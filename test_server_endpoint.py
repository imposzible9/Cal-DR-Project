import httpx
import asyncio
import json

async def test_endpoint():
    urls = [
        "http://localhost:8000/api/symbols",
        "http://localhost:8000/news/api/symbols",
        "http://localhost:8003/api/symbols" # Just in case running standalone
    ]
    
    async with httpx.AsyncClient() as client:
        for url in urls:
            try:
                print(f"Testing {url}...")
                r = await client.get(url, timeout=2)
                print(f"Status: {r.status_code}")
                if r.status_code == 200:
                    data = r.json()
                    print(f"Got {len(data)} symbols")
                    th_count = sum(1 for s in data if s.get("country") == "TH")
                    print(f"TH Symbols: {th_count}")
                    if th_count > 0:
                        print("SUCCESS: TH symbols found!")
                        return
                else:
                    print(f"Error: {r.text[:100]}")
            except Exception as e:
                print(f"Failed: {e}")
            print("-" * 20)

if __name__ == "__main__":
    asyncio.run(test_endpoint())
