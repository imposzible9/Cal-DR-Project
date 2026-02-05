import os
import sys
import asyncio
import httpx

# Add backend/API to path
sys.path.append(os.path.join(os.getcwd(), 'backend', 'API'))

# Mock module level _client
import news_api

async def main():
    # Initialize client
    news_api._client = httpx.AsyncClient()
    
    country = "TH"
    limit = 5
    lang = "en"
    hours = 168
    
    # Test cases
    queries = ["Thailand", "DELTA.BK", "DELTA", "Delta Electronics", "Delta Electronics (Thailand)"]
    
    print("\n========== TESTING BING RSS ==========")
    for q in queries:
        print(f"\nQuery: '{q}'")
        try:
            items = await news_api.fetch_bing_news(q, limit, lang, hours, country)
            print(f"Result count: {len(items)}")
            for i in items[:2]:
                print(f"- {i['title']} ({i['source']})")
        except Exception as e:
            print(f"Error: {e}")

    print("\n========== TESTING GOOGLE RSS ==========")
    for q in queries:
        print(f"\nQuery: '{q}'")
        try:
            # Access private function
            items = await news_api._fetch_google_rss_items(q, limit, lang, hours, country)
            print(f"Result count: {len(items)}")
            for i in items[:2]:
                print(f"- {i['title']} ({i['source']})")
        except Exception as e:
            print(f"Error: {e}")

    await news_api._client.aclose()

if __name__ == "__main__":
    asyncio.run(main())
