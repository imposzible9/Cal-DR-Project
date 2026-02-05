import asyncio
import httpx
import json

# Logic from backend/API/news_api.py

def construct_tv_symbol_tester(symbol: str, country: str = None) -> str:
    symbol = symbol.upper()
    
    if "." in symbol:
        clean_symbol = symbol.split(".")[0]
    else:
        clean_symbol = symbol
        
    # Manual Override based on suffix/country for testing
    if symbol.endswith(".BK") or country == "TH": return f"SET:{clean_symbol}"
    if symbol.endswith(".HK") or country == "HK": return f"HKEX:{clean_symbol}"
    if symbol.endswith(".VN") or country == "VN": return f"HOSE:{clean_symbol}"
    if symbol.endswith(".T") or country == "JP": return f"TSE:{clean_symbol}"
    
    # Common US
    if symbol in ["AAPL", "TSLA", "NVDA", "AMD"]: return f"NASDAQ:{clean_symbol}"
    
    return f"NASDAQ:{clean_symbol}" # Default

async def test_fetch(symbol: str, country: str = None):
    tv_symbol = construct_tv_symbol_tester(symbol, country)
    print(f"Testing {symbol} -> TV Symbol: {tv_symbol}")
    
    params = {
        "symbol": tv_symbol,
        "fields": "close,change,change_abs,high,low,volume,currency,Recommend.All",
        "no_404": "true"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get("https://scanner.tradingview.com/symbol", params=params, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            if r.status_code == 200:
                data = r.json()
                if "data" in data and data["data"]:
                    d = data["data"]
                    print(f"✅ SUCCESS: {symbol} Price: {d.get('close')} {d.get('currency')}")
                    return True
                else:
                    print(f"❌ DATA MISSING: {symbol} - Response: {data}")
            else:
                print(f"❌ ERROR {r.status_code}: {symbol}")
        except Exception as e:
            print(f"❌ EXCEPTION: {e}")
            
    return False

async def main():
    test_cases = [
        ("PTT.BK", "TH"),
        ("AOT.BK", "TH"),
        ("700.HK", "HK"),
        ("9988.HK", "HK"),
        ("AAPL", "US"),
        ("VIC.VN", "VN")
    ]
    
    print("--- Verifying TradingView Price Fetching Logic ---")
    for sym, country in test_cases:
        await test_fetch(sym, country)

if __name__ == "__main__":
    asyncio.run(main())
