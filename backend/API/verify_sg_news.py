
import asyncio
import aiohttp
import json

async def verify_sg_news():
    url = "http://localhost:8000/news/api/news/Singapore%20Stock%20Market%20OR%20STI%20Index%20OR%20SGX%20OR%20Straits%20Times%20Index%20OR%20Singapore%20Exchange?limit=40&language=en&hours=72&country=sg&trusted_only=true"
    
    print(f"Fetching: {url}")
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            if resp.status != 200:
                print(f"Error: {resp.status}")
                text = await resp.text()
                print(text)
                return
                
            data = await resp.json()
            news = data.get("news", [])
            print(f"Total items: {len(news)}")
            
            print("\nSources found:")
            sources = {}
            for item in news:
                src = item.get("source") or "Unknown"
                sources[src] = sources.get(src, 0) + 1
                
            for src, count in sources.items():
                print(f"- {src}: {count}")
                
            print("\nTop 5 Titles:")
            for item in news[:5]:
                print(f"- {item.get('title')} ({item.get('source')})")

if __name__ == "__main__":
    asyncio.run(verify_sg_news())
