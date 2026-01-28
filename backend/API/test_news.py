
import asyncio
import os
from news_api import fetch_news, lifespan, app

async def test():
    async with lifespan(app):
        print("Fetching news for AAPL...")
        news = await fetch_news("AAPL", 5, "en", 24, "us")
        print(f"Got {len(news)} articles.")
        for n in news:
            print(f"- {n['title']} ({n['source']})")

if __name__ == "__main__":
    asyncio.run(test())
