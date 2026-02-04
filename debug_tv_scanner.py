import httpx
import asyncio
import json

async def test_tv_scanner():
    url = "https://scanner.tradingview.com/thailand/scan"
    
    # Exact payload from news_api.py
    subtypes = ["common", "preference", "etf", "reit"]
    exchange_filter = ["SET", "mai"]
    min_volume = 50000

    payload = {
        "filter": [
            {"left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"]},
            # {"left": "subtype", "operation": "in_range", "right": subtypes},
            {"left": "exchange", "operation": "in_range", "right": exchange_filter},
            {"left": "average_volume_10d_calc", "operation": "greater", "right": min_volume}
        ],
        "options": {"lang": "en"},
        "symbols": {"query": {"types": []}, "tickers": []},
        "columns": ["logoid", "name", "close", "change", "change_abs", "Recommend.All", "volume", "market_cap_basic", "exchange", "type", "subtype"],
        "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"},
        "range": [0, 500] 
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        print(f"POST {url}")
        r = await client.post(url, json=payload, headers=headers)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"Total: {data.get('totalCount')}")
            rows = data.get("data", [])
            print(f"Rows: {len(rows)}")
            
            seen_types = set()
            for r in rows:
                d = r.get("d", [])
                if len(d) > 10:
                    type_ = d[9]
                    subtype = d[10]
                    combo = (type_, subtype)
                    if combo not in seen_types:
                        seen_types.add(combo)
                        print(f"Found Type: {type_}, Subtype: '{subtype}' Example: {r['s']}")
        else:
            print(r.text)

if __name__ == "__main__":
    asyncio.run(test_tv_scanner())
