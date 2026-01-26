"""
Manual history fetcher

Usage:
    py manual_history_fetch.py

This script fetches market snapshots for a list of markets and inserts them into
`rating_history` using `upsert_history_snapshot` from `ratings_api_dynamic.py`.
It batches requests and respects `MAX_CONCURRENCY` and `BATCH_SLEEP_SECONDS`.

Note: run this from `backend/API` folder so relative imports work.
"""
import os
import asyncio
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo
import httpx

# Import helpers from main module
import ratings_api_dynamic as rmod

# Markets and their desired close timestamps (Thai time)
TARGETS = {
    "US": "2026-01-24 04:30:00",
    "HK": "2026-01-24 15:30:00",
    "JP": "2026-01-24 13:30:00",
    "SG": "2026-01-24 16:30:00",
    "TW": "2026-01-24 13:00:00",
    "CN": "2026-01-24 14:30:00",
    "VN": "2026-01-24 15:30:00",
}

BKK_TZ = ZoneInfo("Asia/Bangkok")
DB_PATH = getattr(rmod, "DB_FILE", "ratings.sqlite")
DR_LIST_URL = os.getenv("DR_LIST_URL") or getattr(rmod, "DR_LIST_URL", None)
MAX_CONCURRENCY = int(getattr(rmod, "MAX_CONCURRENCY", 8))
BATCH_SLEEP = float(getattr(rmod, "BATCH_SLEEP_SECONDS", 0.2))
REQUEST_TIMEOUT = int(getattr(rmod, "REQUEST_TIMEOUT", 10))

if not DR_LIST_URL:
    print("ERROR: DR_LIST_URL not configured. Set DR_LIST_URL env or in ratings_api_dynamic.py")
    raise SystemExit(1)

async def fetch_dr_list(client: httpx.AsyncClient):
    r = await client.get(DR_LIST_URL, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.json().get("rows", [])

async def fetch_for_items(client, items, semaphore):
    tasks = []
    for item in items:
        async def run_fetch(it=item):
            async with semaphore:
                try:
                    return await rmod.fetch_single_ticker_for_history(client, it)
                except Exception as e:
                    return {"ticker": it.get("u_code"), "success": False, "error": str(e)}
        tasks.append(asyncio.create_task(run_fetch()))
    results = await asyncio.gather(*tasks)
    return results

async def process_market(market_code: str, snapshot_ts_thai: datetime):
    print(f"[ManualFetch] Start market {market_code} snapshot {snapshot_ts_thai.isoformat()}")
    # Reduce concurrency for some fragile markets (HK often rate-limits)
    local_max_concurrency = MAX_CONCURRENCY
    if market_code == "HK":
        local_max_concurrency = max(2, int(MAX_CONCURRENCY / 4))
    semaphore = asyncio.Semaphore(local_max_concurrency)

    async with httpx.AsyncClient() as client:
        try:
            rows = await fetch_dr_list(client)
        except Exception as e:
            print(f"[ManualFetch] Failed to fetch DR list: {e}")
            return

        # Build items list matching fetch_single_ticker_for_history expectations
        items = []
        for item in rows:
            # derive underlying code similar to main code
            u_code = item.get("underlying") or (item.get("symbol") or "").replace("80", "").replace("19", "")
            if not u_code:
                continue
            u_code = u_code.strip().upper()
            exchange = item.get("underlyingExchange") or item.get("exchange") or item.get("u_exch") or ""
            name = item.get("underlyingName") or item.get("name") or item.get("u_name") or ""
            dr_sym = item.get("symbol") or item.get("dr_sym") or ""
            mapped = rmod.market_code_from_exchange(exchange)
            if mapped != market_code:
                continue
            items.append({"u_code": u_code, "u_name": name, "u_exch": exchange, "dr_sym": dr_sym})

        if not items:
            print(f"[ManualFetch] No tickers mapped to market {market_code}")
            return

        # Batch fetch in groups to avoid rate limits
        batch_size = max(4, local_max_concurrency * 2)
        all_results = []
        item_map = {it["u_code"]: it for it in items}
        for i in range(0, len(items), batch_size):
            batch = items[i:i+batch_size]
            results = await fetch_for_items(client, batch, semaphore)
            all_results.extend(results)
            await asyncio.sleep(BATCH_SLEEP)

        # Retry failed tickers with more conservative settings
        failed = [r for r in all_results if not r or not r.get("success")]
        retry_round = 0
        max_retries = 2
        retry_sleep = BATCH_SLEEP * 3
        while failed and retry_round < max_retries:
            retry_round += 1
            retry_items = []
            for r in failed:
                t = r.get("ticker")
                if t and t in item_map:
                    retry_items.append(item_map[t])
            if not retry_items:
                break
            # use smaller batches and lower concurrency on retries
            retry_batch_size = max(2, int(local_max_concurrency))
            new_results = []
            for i in range(0, len(retry_items), retry_batch_size):
                batch = retry_items[i:i+retry_batch_size]
                res = await fetch_for_items(client, batch, semaphore)
                new_results.extend(res)
                await asyncio.sleep(retry_sleep)

            # merge new_results into all_results replacing previous entries for the same ticker
            res_map = {r.get("ticker"): r for r in new_results if r}
            merged = []
            for r in all_results:
                t = r.get("ticker")
                if t in res_map:
                    merged.append(res_map.pop(t))
                else:
                    merged.append(r)
            # append any leftover new results
            merged.extend([v for k, v in res_map.items()])
            all_results = merged
            failed = [r for r in all_results if not r or not r.get("success")]
            retry_sleep *= 2

        # if still failures, write to a file for later manual retry
        final_failed = [r.get("ticker") for r in all_results if not r or not r.get("success")]
        if final_failed:
            fname = f"manual_fetch_failed_{market_code}.txt"
            with open(fname, "w", encoding="utf-8") as f:
                for t in sorted(set(final_failed)):
                    f.write(t + "\n")
            print(f"[ManualFetch] Wrote {len(final_failed)} failed tickers to {fname}")
            # Also write a mapping of failed ticker -> constructed TradingView symbol to help debugging
            map_fname = f"manual_fetch_failed_map_{market_code}.txt"
            try:
                with open(map_fname, "w", encoding="utf-8") as mf:
                    for t in sorted(set(final_failed)):
                        it = item_map.get(t)
                        if it:
                            tv = rmod.construct_tv_symbol(it.get("u_code"), it.get("u_name"), it.get("u_exch"), it.get("dr_sym"))
                            mf.write(f"{t} -> {tv}\n")
                        else:
                            mf.write(f"{t} -> (no item data)\n")
                print(f"[ManualFetch] Wrote mapping to {map_fname}")
            except Exception as e:
                print(f"[ManualFetch] Failed to write mapping file: {e}")

    # Insert results into DB using upsert_history_snapshot
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    inserted = 0
    errors = 0
    for res in all_results:
        try:
            if not res or not res.get("success"):
                errors += 1
                continue
            ticker = res.get("ticker")
            exchange = res.get("exchange") or res.get("u_exch") or ""
            # fetch returned ratings and market_data structure (fetch_single_ticker_for_history returns nested 'data')
            data = res.get("data") or {}
            daily_val = data.get("daily_val") or data.get("daily", {}).get("val")
            daily_rating = data.get("daily_rating") or data.get("daily", {}).get("rating")
            weekly_val = data.get("weekly_val") or data.get("weekly", {}).get("val")
            weekly_rating = data.get("weekly_rating") or data.get("weekly", {}).get("rating")
            market_data = data.get("market_data") or {
                "price": res.get("price") or data.get("price"),
                "open": res.get("open") or data.get("open"),
                "high": res.get("high") or data.get("high"),
                "low": res.get("low") or data.get("low"),
                "currency": res.get("currency") or data.get("currency"),
                "change_pct": res.get("change_pct") or data.get("change_pct"),
                "change_abs": res.get("change_abs") or data.get("change_abs"),
            }
            # call helper to upsert
            rmod.upsert_history_snapshot(
                cur,
                ticker,
                market_code,
                snapshot_ts_thai,
                daily_val,
                daily_rating,
                weekly_val,
                weekly_rating,
                exchange,
                market_data,
            )
            inserted += 1
        except Exception as e:
            errors += 1
            print(f"[ManualFetch] Error saving {res.get('ticker')}: {e}")
    con.commit()
    con.close()

    print(f"[ManualFetch] Market {market_code}: inserted={inserted}, errors={errors}")

async def main():
    # parse target timestamps to tz-aware datetimes
    targets = {}
    for m, tstr in TARGETS.items():
        dt = datetime.fromisoformat(tstr)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=BKK_TZ)
        targets[m] = dt

    # process sequentially (to be safe with DR API rate limits)
    for market_code, ts in targets.items():
        await process_market(market_code, ts)

if __name__ == "__main__":
    asyncio.run(main())
