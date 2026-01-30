
import asyncio
import httpx

async def check_logos():
    symbols = ["AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "TSLA", "META", "BABA", "NFLX", "AMD"]
    url = "https://scanner.tradingview.com/america/scan"
    payload = {
        "filter": [
            {"left": "name", "operation": "in_range", "right": symbols}
        ],
        "columns": ["logoid", "name"],
        "range": [0, 50]
    }
    
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload)
        data = r.json()
        for row in data['data']:
            symbol = row['s'].split(':')[-1]
            logoid = row['d'][0]
            print(f"{symbol}: https://s3-symbol-logo.tradingview.com/{logoid}.svg")

if __name__ == "__main__":
    asyncio.run(check_logos())
