
import asyncio
import httpx
from backend.API.news_api import get_symbols

async def test_symbols():
    # We need to mock the client or ensure the backend dependencies are met
    # Actually, we can just call the endpoint logic if we can instantiate it
    # But get_symbols relies on global _client or creates one.
    
    # Let's try to fetch from the running server if possible, or run the function directly.
    # Since we can't easily connect to localhost port of the app (it might not be running),
    # we will run the function directly.
    
    print("Testing get_symbols...")
    try:
        symbols = await get_symbols()
        print(f"Got {len(symbols)} symbols")
        
        us_count = 0
        th_count = 0
        other_counts = {}
        none_count = 0
        
        if symbols:
            print("Sample symbol:", symbols[0])
            
        for s in symbols:
            c = s.get("country")
            if c == "US":
                us_count += 1
            elif c == "TH":
                th_count += 1
            elif c:
                other_counts[c] = other_counts.get(c, 0) + 1
            else:
                none_count += 1
        
        print(f"US: {us_count}, TH: {th_count}, None: {none_count}")
        print(f"Others: {other_counts}")
        
        if us_count > 0 and th_count > 0:
            print("SUCCESS: Found both US and TH symbols")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_symbols())
