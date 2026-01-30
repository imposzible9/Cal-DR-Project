
import asyncio
import httpx

async def check_nvda_logo():
    url = "https://scanner.tradingview.com/america/scan"
    payload = {
        "filter": [
            {"left": "name", "operation": "equal", "right": "NVDA"}
        ],
        "columns": ["logoid", "name"],
        "range": [0, 10]
    }
    
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload)
        data = r.json()
        print(data)
        if data['data']:
            logoid = data['data'][0]['d'][0]
            print(f"Logo ID: {logoid}")
            print(f"Constructed URL: https://s3-symbol-logo.tradingview.com/{logoid}.svg")

if __name__ == "__main__":
    asyncio.run(check_nvda_logo())
