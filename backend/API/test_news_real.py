import asyncio
import httpx

NEWS_API_BASE_URL = "https://newsapi.org/v2/top-headlines"
NEWS_API_KEY = "a2982e76c7844902b4289a6b08712d89"

async def test_news():
    async with httpx.AsyncClient() as client:
        # Case 1: Generic "stock market" query (simulating frontend call)
        # Frontend: limit=20, language="en", hours=72
        # Code logic:
        # is_general_market = True
        # params["q"] is NOT set
        # params["country"] = "us"
        # params["language"] = "en"
        
        params = {
            "pageSize": 20,
            "apiKey": NEWS_API_KEY,
            "category": "business",
            "country": "us",
            "language": "en"
        }
        
        print("Testing Case 1: Generic Market News (with language=en)")
        print(f"URL: {NEWS_API_BASE_URL}")
        print(f"Params: {params}")
        
        try:
            r = await client.get(NEWS_API_BASE_URL, params=params)
            print(f"Status: {r.status_code}")
            data = r.json()
            articles = data.get("articles", [])
            print(f"Article Count: {len(articles)}")
            if len(articles) > 0:
                print(f"First Article: {articles[0]['title']}")
            else:
                print("No articles found.")
                print(f"Response: {data}")
        except Exception as e:
            print(f"Error: {e}")

        print("-" * 20)

        # Case 2: Without language param (exactly as user requested)
        params2 = {
            "pageSize": 20,
            "apiKey": NEWS_API_KEY,
            "category": "business",
            "country": "us"
            # language omitted
        }
        
        print("Testing Case 2: Generic Market News (WITHOUT language)")
        try:
            r = await client.get(NEWS_API_BASE_URL, params=params2)
            print(f"Status: {r.status_code}")
            data = r.json()
            articles = data.get("articles", [])
            print(f"Article Count: {len(articles)}")
        except Exception as e:
            print(f"Error: {e}")

        print("-" * 20)
        
        # Case 3: Google News Fallback (simulate by using invalid API key)
        print("Testing Case 3: Google News Fallback")
        # We need to copy the logic from news_api.py fetch_google_news roughly
        # Or just import it if we could, but better to simulate request
        
        google_params = {"q": "stock market", "hl": "en-US", "gl": "US", "ceid": "US:en"}
        try:
            r = await client.get("https://news.google.com/rss/search", params=google_params)
            print(f"Google Status: {r.status_code}")
            if r.status_code == 200:
                print(f"Google Response Length: {len(r.text)}")
                if "<item>" in r.text:
                    print("Google News returned items.")
                else:
                    print("Google News returned NO items.")
        except Exception as e:
            print(f"Google Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_news())
