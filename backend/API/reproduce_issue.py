
import asyncio
import httpx
import os

API_URL = "http://localhost:8000/news"

async def test_symbol(symbol):
    print(f"Testing {symbol}...")
    async with httpx.AsyncClient() as client:
        # 1. Test Quote
        try:
            r = await client.get(f"{API_URL}/api/finnhub/quote/{symbol}")
            print(f"  Quote Status: {r.status_code}")
            if r.status_code == 200:
                print(f"  Quote Data: {r.json()}")
            else:
                print(f"  Quote Error: {r.text}")
        except Exception as e:
            print(f"  Quote Exception: {e}")

        # 2. Test Company News (without country param, simulating frontend)
        try:
            r = await client.get(f"{API_URL}/api/finnhub/company-news/{symbol}", params={"hours": 168, "limit": 30})
            print(f"  News Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                print(f"  News Items: {len(data.get('news', []))}")
            else:
                print(f"  News Error: {r.text}")
        except Exception as e:
            print(f"  News Exception: {e}")

async def main():
    # Test TTE.PA (France)
    await test_symbol("TTE.PA")
    # Test D05.SI (Singapore)
    await test_symbol("D05.SI")

if __name__ == "__main__":
    asyncio.run(main())
