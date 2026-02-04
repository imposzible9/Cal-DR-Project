import asyncio
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from news_api import get_company_news, init_client, close_client, GOOGLE_FINANCE_COUNTRIES, get_symbols

async def test():
    await init_client()
    try:
        # Pre-warm symbols cache (since get_company_news needs it for fallback lookup)
        print("Fetching symbols...")
        await get_symbols()
        
        # Test HK (0700.HK) - Should use "Tencent Holdings Ltd" or similar as fallback query
        print("\n--- Testing HK (0700.HK) via get_company_news ---")
        # Explicitly pass language=None to avoid getting the default Query() object when calling directly
        result = await get_company_news("0700.HK", hours=24, limit=5, country="hk", language="en")
        items = result.get("news", [])
        print(f"Found {len(items)} items")
        if items:
            print(f"Source: {items[0]['source']}")
            print(f"Title: {items[0]['title']}")
            print(f"Image: {items[0]['image_url']}")

        # Test TH (PTT.BK)
        print("\n--- Testing TH (PTT.BK) via get_company_news ---")
        result = await get_company_news("PTT.BK", hours=24, limit=5, country="th", language="th")
        items = result.get("news", [])
        print(f"Found {len(items)} items")
        if items:
            print(f"Source: {items[0]['source']}")
            print(f"Title: {items[0]['title']}")

    finally:
        await close_client()

if __name__ == "__main__":
    asyncio.run(test())
