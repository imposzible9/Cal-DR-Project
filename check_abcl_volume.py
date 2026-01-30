
import asyncio
import httpx

async def check_abcl_volume():
    url = "https://scanner.tradingview.com/america/scan"
    payload = {
        "filter": [
            {"left": "name", "operation": "equal", "right": "ABCL"}
        ],
        "columns": ["name", "volume", "average_volume_10d_calc"],
        "range": [0, 10]
    }
    
    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload)
        print(r.json())

if __name__ == "__main__":
    asyncio.run(check_abcl_volume())
