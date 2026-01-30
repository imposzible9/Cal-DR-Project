
import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

API_BASE = "http://localhost:8003"

async def check_adsk():
    async with httpx.AsyncClient() as client:
        print("Checking Quote for ADSK...")
        try:
            r = await client.get(f"{API_BASE}/api/finnhub/quote/ADSK")
            print(f"Quote Status: {r.status_code}")
            print(f"Quote Data: {r.text}")
        except Exception as e:
            print(f"Quote Error: {e}")

        print("\nChecking News for ADSK...")
        try:
            r = await client.get(f"{API_BASE}/api/finnhub/company-news/ADSK")
            print(f"News Status: {r.status_code}")
            print(f"News Data: {r.text[:500]}...") 
        except Exception as e:
            print(f"News Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_adsk())
