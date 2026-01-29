
import asyncio
import httpx
from news_api import fetch_google_news, init_client, close_client, _fetch_google_rss_items

async def test_google_news_fetching():
    await init_client()
    try:
        query = "NVDA stock"
        print(f"Testing query: {query}")
        
        # Test 1: Run the actual function
        results = await fetch_google_news(query, limit=10, language="en", hours=24, country="us")
        print(f"\nTotal results: {len(results)}")
        for i, item in enumerate(results, 1):
            print(f"{i}. [{item.get('source')}] {item.get('title')} - {item.get('source')}")
            print(f"   Summary: {item.get('summary')[:100]}...")  # Print summary
            
        # Test 2: Debug the specific queries
        print("\n--- Debugging separate queries ---")
        query_others = f"{query} -site:yahoo.com -site:finance.yahoo.com"
        query_yahoo = f"{query} site:finance.yahoo.com"
        
        print(f"Query Others: {query_others}")
        items_others = await _fetch_google_rss_items(query_others, 10, "en", 24, "us")
        print(f"Found {len(items_others)} items for Others")
        for item in items_others:
            print(f"  - [{item.get('source')}] {item.get('title')}")
            
        print(f"\nQuery Yahoo: {query_yahoo}")
        items_yahoo = await _fetch_google_rss_items(query_yahoo, 10, "en", 24, "us")
        print(f"Found {len(items_yahoo)} items for Yahoo")
        
    finally:
        await close_client()

if __name__ == "__main__":
    asyncio.run(test_google_news_fetching())
