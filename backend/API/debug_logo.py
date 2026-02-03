
import asyncio
import os
import httpx
from news_api import get_symbols, fetch_logo, _resolve_finnhub_symbol

# Mock environment if needed, but news_api loads .env
# We need to make sure we can run async functions

async def test_logo_fallback():
    print("Fetching symbols list first (to populate cache)...")
    await get_symbols() # Initialize cache
    
    test_symbols = ["PTT", "600519", "0700", "7203"] # TH, CN, HK, JP
    
    async with httpx.AsyncClient() as client:
        for sym in test_symbols:
            print(f"\n--- Testing {sym} ---")
            
            # 1. Check Finnhub Logo
            finnhub_sym = await _resolve_finnhub_symbol(sym)
            logo_finnhub = await fetch_logo(sym)
            print(f"Finnhub Logo ({finnhub_sym}): {logo_finnhub}")
            
            # 2. Check TradingView Logo (from symbols list)
            all_symbols = await get_symbols()
            match = next((s for s in all_symbols if s["symbol"] == sym), None)
            logo_tv = match.get("logo") if match else None
            print(f"TradingView Logo: {logo_tv}")
            
            if not logo_finnhub and logo_tv:
                print(">>> OPPORTUNITY: Finnhub missing, but TV has it!")

if __name__ == "__main__":
    # Initialize news_api client since it's required for fetch_logo
    import news_api
    
    async def main():
        await news_api.init_client()
        try:
            await test_logo_fallback()
        finally:
            await news_api.close_client()

    asyncio.run(main())
