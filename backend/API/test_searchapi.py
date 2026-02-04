import asyncio
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from news_api import fetch_google_finance_news, init_client, close_client, GOOGLE_FINANCE_COUNTRIES, SEARCHAPI_KEY

async def test():
    print(f"SEARCHAPI_KEY present: {bool(SEARCHAPI_KEY)}")
    if not SEARCHAPI_KEY:
        print("WARNING: SEARCHAPI_KEY is missing!")
        
    await init_client()
    try:
        # Test 1: Direct Request Debug
        print("\n--- Direct API Request Debug ---")
        params = {
            "engine": "google_finance",
            "q": "0700.HK",
            "api_key": SEARCHAPI_KEY,
            "gl": "hk",
            "hl": "en"
        }
        
        # Use a new client for this direct test to avoid messing with init_client global state if needed
        # But we can reuse the initialized one.
        import httpx
        async with httpx.AsyncClient() as client:
            r = await client.get("https://www.searchapi.io/api/v1/search", params=params)
            print(f"Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                import json
                print(json.dumps(data, indent=2)[:2000]) # Print first 2000 chars
            else:
                print(r.text)

    finally:
        await close_client()

if __name__ == "__main__":
    asyncio.run(test())
