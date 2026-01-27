
import asyncio
import os
import httpx

NEWS_API_KEY = "a2982e76c7844902b4289a6b08712d89"
NEWS_API_BASE_URL = "https://newsapi.org/v2/top-headlines"

async def test_api(q_val=None):
    params = {
        "apiKey": NEWS_API_KEY,
        "country": "us",
        "category": "business"
    }
    if q_val:
        params["q"] = q_val
    
    print(f"Testing with params: {params}")
    async with httpx.AsyncClient() as client:
        r = await client.get(NEWS_API_BASE_URL, params=params)
        print(f"Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"Total Results: {data.get('totalResults')}")
            articles = data.get("articles", [])
            print(f"Article count: {len(articles)}")
            if articles:
                print(f"First title: {articles[0]['title']}")
        else:
            print(r.text)
        print("-" * 20)

async def main():
    print("1. Testing 'AAPL' with top-headlines")
    await test_api("AAPL")

    print("2. Testing 'stock market' with top-headlines")
    await test_api("stock market")

    print("3. Testing NO query")
    await test_api(None)

if __name__ == "__main__":
    asyncio.run(main())
