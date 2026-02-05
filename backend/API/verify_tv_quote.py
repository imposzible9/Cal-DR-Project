
import asyncio
import aiohttp
import json

async def verify_tv_quote():
    symbols = ["D05.SI", "DELTA.BK", "NVDA"]
    
    async with aiohttp.ClientSession() as session:
        for sym in symbols:
            url = f"http://localhost:8000/news/api/finnhub/quote/{sym}"
            print(f"Fetching: {url}")
            async with session.get(url) as resp:
                if resp.status != 200:
                    print(f"Error for {sym}: {resp.status}")
                    continue
                
                data = await resp.json()
                source = data.get("source")
                price = data.get("price")
                logo = data.get("logo_url")
                print(f"Symbol: {sym}, Source: {source}, Price: {price}, Logo: {logo}")
                
                if not logo:
                     print(f"WARNING: {sym} missing logo!")
                
                if source != "tradingview" and sym != "NVDA": # NVDA might be TV or Finnhub depending on availability, but we prefer TV
                    print(f"WARNING: {sym} source is {source}, expected tradingview")

if __name__ == "__main__":
    asyncio.run(verify_tv_quote())
