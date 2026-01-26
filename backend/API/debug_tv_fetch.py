import asyncio
import os
import re
import httpx
from pprint import pprint

TRADINGVIEW_BASE = os.getenv("TRADINGVIEW_BASE_URL") or "https://scanner.tradingview.com/symbol"
TV_FIELDS = "Recommend.All,Recommend.All|1W,close,change,change_abs,high,low,volume,currency"
FAKE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
    "Accept": "application/json, text/plain, */*",
}


def construct_tv_symbol(ticker: str, name: str, exchange: str, dr_symbol: str):
    ticker = (ticker or "").strip().upper()
    exchange = " ".join(exchange.upper().split()) if exchange else ""
    name = name.strip() if name else ""
    dr_symbol = dr_symbol.strip().upper() if dr_symbol else ""

    real_ticker = ticker
    match = re.search(r'\(([A-Z0-9.\-_]+)\)$', name)
    if match:
        real_ticker = match.group(1)
        if "." in real_ticker:
            real_ticker = real_ticker.split(".")[0]
        real_ticker = real_ticker.strip().upper()
    else:
        if dr_symbol:
            if re.search(r'\d{2}$', dr_symbol):
                candidate = dr_symbol[:-2]
                if len(candidate) >= 2:
                    real_ticker = candidate
            else:
                if len(dr_symbol) >= 2:
                    real_ticker = dr_symbol

    if any(k in exchange for k in ("MILAN", "MIL")): return f"MIL:{real_ticker}"
    if any(k in exchange for k in ("COPENHAGEN", "OMX")): return f"OMXCOP:{real_ticker.replace('-', '_')}"
    if any(k in exchange for k in ("EURONEXT", "PARIS", "AMSTERDAM", "BRUSSELS", "FRANCE", "NETHERLANDS")): return f"EURONEXT:{real_ticker}"
    if any(k in exchange for k in ("SHANGHAI", "SSE", "SHANGHAI STOCK EXCHANGE")): return f"SSE:{real_ticker}"
    if any(k in exchange for k in ("SHENZHEN", "SZSE")): return f"SZSE:{real_ticker}"
    if any(k in exchange for k in ("HONG", "HK", "HKEX")): return f"HKEX:{real_ticker}"
    if any(k in exchange for k in ("VIET", "HOCHIMINH", "HOSE", "HNX")): return f"HOSE:{real_ticker}"
    if any(k in exchange for k in ("TOKYO", "JAPAN", "TSE", "JP")): return f"TSE:{real_ticker}"
    if any(k in exchange for k in ("SINGAPORE", "SGX", "SG")): return f"SGX:{real_ticker}"
    if any(k in exchange for k in ("TAIWAN", "TWSE", "TW")): return f"TWSE:{real_ticker}"
    if "NASDAQ" in exchange: return f"NASDAQ:{real_ticker}"
    if any(k in exchange for k in ("NEW YORK", "NYSE", "NY")):
        if any(sub_k in exchange for sub_k in ("ARCHIPELAGO", "ARCA", "AMEX")): return f"AMEX:{real_ticker}"
        return f"NYSE:{real_ticker}"
    if re.match(r'^\d+$', real_ticker): return f"HKEX:{real_ticker}"
    return f"NASDAQ:{real_ticker}"


async def fetch_tv(tv_symbol: str):
    params = {
        "symbol": tv_symbol,
        "fields": TV_FIELDS,
        "no_404": "true",
        "label-product": "popup-technicals",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(TRADINGVIEW_BASE, params=params, headers=FAKE_HEADERS)
            print(f"Request: {TRADINGVIEW_BASE}?symbol={tv_symbol}")
            print("Status:", resp.status_code)
            try:
                data = resp.json()
                pprint(data)
            except Exception:
                print("Response text:")
                print(resp.text[:2000])
        except Exception as e:
            print(f"HTTP error for {tv_symbol}: {e}")


async def main():
    # Cases to try: use the name strings provided and some exchange guesses
    test_items = [
        {"ticker": "3692.HK", "name": "หุ้นสามัญของบริษัท HANSOH PHARMACEUTICAL GROUP COMPANY LIMITED (3692.HK)", "exchange": "HONG KONG" , "dr_sym": ""},
        {"ticker": "1177.HK", "name": "หุ้นสามัญของบริษัท SINO BIOPHARMACEUTICAL LIMITED (1177.HK)", "exchange": "HONG KONG", "dr_sym": ""},
    ]

    for it in test_items:
        print("\n=== Testing item ===")
        print(it)
        tv = construct_tv_symbol(it.get("ticker"), it.get("name"), it.get("exchange"), it.get("dr_sym"))
        print("Constructed TV symbol:", tv)
        await fetch_tv(tv)

        # Also try explicit common variants
        for cand in [f"HKEX:{re.sub(r'[^0-9]', '', it.get('ticker'))}", f"NASDAQ:{re.sub(r'[^A-Z0-9]', '', it.get('ticker').upper())}"]:
            print("\nTrying variant:", cand)
            await fetch_tv(cand)


if __name__ == "__main__":
    asyncio.run(main())
