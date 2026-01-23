
import asyncio
import httpx

async def check_symbols_count():
    async with httpx.AsyncClient() as client:
        r = await client.get("http://localhost:8003/api/symbols")
        if r.status_code == 200:
            data = r.json()
            print(f"Total symbols: {len(data)}")
            # Check if ABCL is in there
            abcl = next((s for s in data if s["symbol"] == "ABCL"), None)
            if abcl:
                print("ABCL found")
            else:
                print("ABCL NOT found")
                
            # Check for bad Thai symbols
            bad_th = next((s for s in data if "." in s["symbol"] and s.get("exchange") in ["SET", "mai"]), None)
            if bad_th:
                print(f"Found bad Thai symbol: {bad_th}")
            else:
                print("No bad Thai symbols found (dots)")
        else:
            print(f"Error: {r.status_code}")

if __name__ == "__main__":
    asyncio.run(check_symbols_count())
