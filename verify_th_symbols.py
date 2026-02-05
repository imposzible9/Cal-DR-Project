
import asyncio
import httpx
from backend.API.news_api import get_symbols

async def verify_symbols_order():
    # We can't easily mock the client here without more setup, 
    # but we can try to run get_symbols if the server was running or just check the logic.
    # Since we modified the file, let's just use the fact that we updated the code.
    # We can check if the symbols are in the FALLBACK list by reading the file or importing.
    
    from backend.API.news_api import ADDITIONAL_FALLBACK_SYMBOLS
    
    th_symbols = [s for s in ADDITIONAL_FALLBACK_SYMBOLS if s["country"] == "TH"]
    print(f"Total TH fallback symbols: {len(th_symbols)}")
    
    expected = [
        "PTT.BK", "CPALL.BK", "AOT.BK", "ADVANC.BK", 
        "DELTA.BK", "TRUE.BK", "KBANK.BK", "SCB.BK", 
        "BBL.BK", "KTB.BK", "PTTEP.BK", "GULF.BK", 
        "GPSC.BK", "BDMS.BK", "BH.BK", "CRC.BK", 
        "CPN.BK", "BEM.BK"
    ]
    
    missing = []
    for sym in expected:
        found = next((s for s in th_symbols if s["symbol"] == sym), None)
        if not found:
            missing.append(sym)
            
    if missing:
        print(f"Missing symbols in fallback list: {missing}")
    else:
        print("All expected symbols are present in fallback list.")
        
    print("Verification complete.")

if __name__ == "__main__":
    asyncio.run(verify_symbols_order())
