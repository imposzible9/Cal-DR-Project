import asyncio
import sys
import os

# Ensure we can import from backend
# sys.path.append(os.path.join(os.getcwd(), "backend", "API"))

from backend.API.news_api import fetch_news, _is_trusted_source, init_client, close_client, _client

async def main():
    print("Initializing client...")
    await init_client()
    try:
        # Check if client is initialized
        from backend.API.news_api import _client as c
        print(f"Client status: {c}")
        
        print("Testing Multi-Country News Fetching...")
        
        # Test Japan
        print("\n--- Fetching JP (Japan) News ---")
        jp_news = await fetch_news("stock market", limit=5, language="en", hours=24, country="jp")
        for item in jp_news:
            trusted = "✅" if item.get("is_trusted") else "❌"
            print(f"[{item.get('source')}] {trusted} {item.get('title')[:60]}...")
        
        # Test Thailand
        print("\n--- Fetching TH (Thailand) News ---")
        th_news = await fetch_news("stock market", limit=5, language="th", hours=24, country="th")
        for item in th_news:
            trusted = "✅" if item.get("is_trusted") else "❌"
            print(f"[{item.get('source')}] {trusted} {item.get('title')[:60]}...")
            
        # Test Trusted Source Logic
        print("\n--- Testing Trusted Source Logic ---")
        sources = ["Bloomberg", "Reuters", "Bangkok Post", "Unknown Blog", "Yahoo Finance"]
        for s in sources:
            print(f"{s}: {_is_trusted_source(s)}")
    finally:
        await close_client()

if __name__ == "__main__":
    asyncio.run(main())
