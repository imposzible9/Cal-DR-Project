import asyncio
import httpx

async def verify():
    url = "http://localhost:8005/api/symbols"
    print(f"Checking {url}...")
    
    async with httpx.AsyncClient() as client:
        try:
            r = await client.get(url, timeout=30)
            if r.status_code != 200:
                print(f"Error: {r.status_code}")
                return
                
            data = r.json()
            print(f"Total symbols: {len(data)}")
            
            # Check DELTA.BK
            delta = next((s for s in data if s["symbol"] == "DELTA.BK"), None)
            if delta:
                print(f"Found DELTA.BK: Logo={delta.get('logo')}")
                if delta.get('logo'):
                    print("SUCCESS: DELTA.BK has a logo!")
                else:
                    print("FAILURE: DELTA.BK has NO logo.")
            else:
                print("FAILURE: DELTA.BK not found.")

            # Check ADVANC.BK
            advanc = next((s for s in data if s["symbol"] == "ADVANC.BK"), None)
            if advanc:
                print(f"Found ADVANC.BK: Logo={advanc.get('logo')}")
            
            # Check for generic symbol without .BK (e.g. DELTA)
            delta_raw = next((s for s in data if s["symbol"] == "DELTA" and s.get("country") == "TH"), None)
            if delta_raw:
                print(f"Found DELTA (raw): {delta_raw}")
            else:
                print("Confirmed: DELTA (raw) not found or not TH (as expected due to merge/rename).")

        except Exception as e:
            print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(verify())
