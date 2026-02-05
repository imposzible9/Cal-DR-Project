import asyncio
import httpx
import json

async def check_tv_thailand():
    url = "https://scanner.tradingview.com/thailand/scan"
    
    # Same payload as news_api.py
    payload = {
        "filter": [
            {"left": "type", "operation": "in_range", "right": ["stock"]},
            {"left": "average_volume_10d_calc", "operation": "greater", "right": 50000}
        ],
        "options": {"lang": "en"},
        "symbols": {"query": {"types": []}, "tickers": []},
        "columns": ["logoid", "name", "close", "change", "change_abs", "Recommend.All", "volume", "market_cap_basic", "exchange"],
        "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"},
        "range": [0, 50] 
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Origin": "https://www.tradingview.com",
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload, headers=headers)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            rows = data.get("data", [])
            print(f"Found {len(rows)} rows")
            
            for row in rows:
                s = row.get("s")
                d = row.get("d")
                symbol = s.split(":")[-1]
                logoid = d[0]
                name = d[1]
                print(f"Symbol: {symbol}, Name: {name}, LogoID: {logoid}")
                if symbol == "DELTA":
                    print(f"!!! FOUND DELTA !!! LogoID: {logoid}")

if __name__ == "__main__":
    asyncio.run(check_tv_thailand())
