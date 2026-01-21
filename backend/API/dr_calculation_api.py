import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import time
import httpx
import re
import uvicorn

app = FastAPI(title="DR Calculation API (Cache + Background Refresh + Symbol Map)")

DR_API_URL = os.getenv("DR_API_URL")
TV_SCAN_URL = "https://scanner.tradingview.com/global/scan"

# -----------------------------
# CONFIG (ปรับได้)
# -----------------------------
CACHE_TTL_SECONDS = 5            # อายุ cache (วินาที) เช่น 3-10
REFRESH_INTERVAL_SECONDS = 2     # background รีทุกกี่วินาที
WARM_KEYS_LIMIT = 120            # จะอุ่นกี่ตัวล่าสุด (กันหนัก)

# ถ้าอยากให้ FX รีถี่กว่า underlying:
FX_REFRESH_MULT = 1              # 1 = เท่ากัน, 2 = underlying ช้ากว่า FX 2 เท่า ฯลฯ

# -----------------------------
# MAPS (ตามของคุณ)
# -----------------------------
EXCHANGE_CURRENCY_MAP = {
    "The Nasdaq Global Select Market": "USD",
    "The Nasdaq Stock Market": "USD",
    "The New York Stock Exchange": "USD",
    "The New York Stock Exchange Archipelago": "USD",
    "The Stock Exchange of Hong Kong Limited": "HKD",
    "Nasdaq Copenhagen": "DKK",
    "Euronext Amsterdam": "EUR",
    "Euronext Paris": "EUR",
    "Euronext Milan": "EUR",
    "Tokyo Stock Exchange": "JPY",
    "Singapore Exchange": "SGD",
    "Taiwan Stock Exchange": "TWD",
    "Shenzhen Stock Exchange": "CNY",
    "Hochiminh Stock Exchange": "VND",
    "Shanghai Stock Exchange": "CNY",
}

EXCHANGE_TV_PREFIX_MAP = {
    "The Nasdaq Global Select Market": "NASDAQ",
    "The Nasdaq Stock Market": "NASDAQ",
    "The New York Stock Exchange": "NYSE",
    "The New York Stock Exchange Archipelago": "NYSEARCA",
    "The Stock Exchange of Hong Kong Limited": "HKEX",
    "Nasdaq Copenhagen": "OMXCOP",
    "Euronext Paris": "EURONEXT",
    "Euronext Amsterdam": "EURONEXT",
    "Euronext Milan": "EURONEXT",
    "Tokyo Stock Exchange": "TSE",
    "Singapore Exchange": "SGX",
    "Taiwan Stock Exchange": "TWSE",
    "Shenzhen Stock Exchange": "SZSE",
    "Hochiminh Stock Exchange": "HOSE",
    "Shanghai Stock Exchange": "SSE",
}

FX_PAIR_MAP = {
    "USD": "USDTHB",
    "HKD": "HKDTHB",
    "DKK": "DKKTHB",
    "EUR": "EURTHB",
    "JPY": "JPYTHB",
    "SGD": "SGDTHB",
    "TWD": "TWDTHB",
    "CNY": "CNYTHB",
    "VND": "VNDTHB",
}

TV_SYMBOL_OVERRIDES: dict[str, str] = {
    "EPA:OR": "EURONEXT:OR",
    "HOSE:DCVFMVN30 ETF": "HOSE:E1VFVN30",
    "NYSEARCA:GLD": "AMEX:GLD",
    "EPA:RMS": "EURONEXT:RMS",
    "EPA:HERMES": "EURONEXT:RMS",
    "HKEX:0388": "HKEX:388",
    "EPA:LVMH": "EURONEXT:MC",
    "EPA:MC": "EURONEXT:MC",
    "OMXCOP:NOVOB": "OMXCOP:NOVO_B",
    "OMXCOP:NOVO-B": "OMXCOP:NOVO_B",
    "HKEX:PINGAN": "HKEX:2318",
    "EURONEXT:SANOFI": "EURONEXT:SAN",
    "NYSEARCA:SPY":  "AMEX:SPY",
    "NYSEARCA:SPYM": "AMEX:SPYM",
    "NYSEARCA:SPAB": "AMEX:SPAB",
}

def _norm(s: str) -> str:
    return (s or "").strip().lower()

def _now() -> float:
    return time.time()

# -----------------------------
# CORS (ให้ frontend เครื่องอื่นเรียกได้)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # prod ควร lock domain
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# -----------------------------
# CACHE (in-memory)
# -----------------------------
_price_cache: dict[str, dict] = {}
_warm_keys: dict[str, float] = {}

def cache_get(key: str):
    item = _price_cache.get(key)
    if not item:
        return None
    if item["exp"] <= _now():
        return None
    return item["value"]

def cache_set(key: str, value: float, ttl: int = CACHE_TTL_SECONDS):
    _price_cache[key] = {"value": float(value), "exp": _now() + ttl}

def mark_warm(key: str):
    _warm_keys[key] = _now()

def _trim_warm_keys():
    if len(_warm_keys) <= WARM_KEYS_LIMIT:
        return
    oldest = sorted(_warm_keys.items(), key=lambda kv: kv[1])[: max(1, len(_warm_keys) - WARM_KEYS_LIMIT)]
    for k, _ in oldest:
        _warm_keys.pop(k, None)

# -----------------------------
# HTTP clients (reuse)
# -----------------------------
_tv_client: httpx.AsyncClient | None = None
_idea_client: httpx.AsyncClient | None = None

# ✅ แก้หลัก: fallback columns + debug log ตอน error
async def tv_scan_close(tv_ticker: str) -> float:
    columns = ["last", "close", "open"]
    payload = {
        "symbols": {"tickers": [tv_ticker], "query": {"types": []}},
        "columns": columns,
    }

    assert _tv_client is not None

    data = None  # ✅ สำคัญมาก กัน NameError

    try:
        r = await _tv_client.post(TV_SCAN_URL, json=payload)
        r.raise_for_status()
        data = r.json()

        # ❗ TradingView หา ticker ไม่เจอ
        if not data.get("data"):
            print("TV_SCAN_NOT_FOUND ticker=", tv_ticker)
            print("TV_SCAN_RESPONSE=", data)
            raise HTTPException(
                404,
                f"TradingView ticker not found or no data returned: {tv_ticker}",
            )

        d = data["data"][0]["d"]  # [last, close, open]

        def to_float(x):
            if x is None:
                return None
            try:
                f = float(x)
                if f == f and f > 0:  # กัน NaN
                    return f
            except Exception:
                return None
            return None

        # ✅ ให้ตรงกับ TradingView → ใช้ last ก่อน
        for v in d:
            fv = to_float(v)
            if fv is not None:
                return fv

        raise HTTPException(
            500,
            f"No usable price fields for {tv_ticker} (tried {columns})",
        )

    except HTTPException:
        raise

    except Exception as e:
        # ✅ ต่อให้ error ก่อน data = r.json() ก็ไม่พัง
        print("TV_SCAN_ERROR ticker=", tv_ticker)
        print("TV_SCAN_ERROR response=", data)
        raise HTTPException(
            500,
            f"Cannot fetch close for {tv_ticker}: {type(e).__name__}",
        )

    # ================== FIX หลัก ==================
    # TradingView หา ticker ไม่เจอ → data จะว่าง
    if not data.get("data"):
        # ✅ fallback เฉพาะ NYSEARCA ETF
        if tv_ticker.startswith("NYSEARCA:"):
            sym = tv_ticker.split(":", 1)[1]

            # prefix ที่ TradingView ใช้กับ ETF บ่อย
            candidates = [
                f"AMEX:{sym}",
                f"ARCA:{sym}",
                f"BATS:{sym}",
            ]

            found = False
            for alt in candidates:
                r2 = await _tv_client.post(
                    TV_SCAN_URL,
                    json={
                        "symbols": {"tickers": [alt], "query": {"types": []}},
                        "columns": columns,
                    },
                )
                r2.raise_for_status()
                data2 = r2.json()

                if data2.get("data"):
                    data = data2
                    tv_ticker = alt   # ✅ ใช้ symbol ที่หาเจอจริง
                    found = True
                    break

            if not found:
                print("TV_SCAN_NOT_FOUND ticker=", tv_ticker, "candidates=", candidates)
                print("TV_SCAN_RESPONSE=", data)
                raise HTTPException(
                    404,
                    f"TradingView ticker not found or no data returned: {tv_ticker}",
                )
        else:
            print("TV_SCAN_NOT_FOUND ticker=", tv_ticker)
            print("TV_SCAN_RESPONSE=", data)
            raise HTTPException(
                404,
                f"TradingView ticker not found or no data returned: {tv_ticker}",
            )
    # =================================================

    try:
        d = data["data"][0]["d"]  # list ตาม columns

        for i, col in enumerate(columns):
            v = d[i]
            if v is None:
                continue

            fv = float(v)
            if fv == fv and fv > 0:  # กัน NaN
                return fv

        # ไม่มี field ไหน usable
        raise HTTPException(
            500,
            f"No usable price fields for {tv_ticker} (tried {columns})",
        )

    except HTTPException:
        raise

    except Exception as e:
        # debug ให้เห็น response จริง
        print("TV_SCAN_ERROR ticker=", tv_ticker)
        print("TV_SCAN_ERROR columns=", columns)
        print("TV_SCAN_ERROR response=", data)

        raise HTTPException(
            500,
            f"Cannot fetch close for {tv_ticker}: {type(e).__name__}",
        )

async def get_price_cached(kind: str, tv_ticker: str, ttl: int = CACHE_TTL_SECONDS) -> float:
    """
    kind: 'U' underlying, 'F' fx
    key: f"{kind}|{tv_ticker}"
    """
    key = f"{kind}|{tv_ticker}"
    mark_warm(key)
    _trim_warm_keys()

    v = cache_get(key)
    if v is not None:
        return v

    v = await tv_scan_close(tv_ticker)
    cache_set(key, v, ttl=ttl)
    return v

# -----------------------------
# DR selection helpers (ของคุณ)
# -----------------------------
def _extract_code_in_parens(s: str) -> str | None:
    if not s:
        return None
    s = str(s)
    i = s.rfind("(")
    j = s.rfind(")")
    if i != -1 and j != -1 and j > i:
        code = s[i+1:j].strip()
        return code if code else None
    return None

def choose_best_row(candidates: list) -> dict:
    def score(r: dict):
        status = str(r.get("marketStatus", "")).lower()
        is_open = 1 if status == "open" else 0
        tv = float(r.get("totalValue") or 0)
        vol = float(r.get("totalVolume") or 0)
        return (is_open, tv, vol)
    return sorted(candidates, key=score, reverse=True)[0]

def pick_dr_row(rows: list, query_symbol: str) -> dict:
    q = _norm(query_symbol)

    exact_symbol = [r for r in rows if _norm(str(r.get("symbol", ""))) == q]
    if exact_symbol:
        return exact_symbol[0]

    exact_underlying = [r for r in rows if _norm(str(r.get("underlying", ""))) == q]
    if exact_underlying:
        return choose_best_row(exact_underlying)

    contains_underlying = [r for r in rows if q and q in _norm(str(r.get("underlying", "")))]
    if contains_underlying:
        return choose_best_row(contains_underlying)

    raise HTTPException(404, f"No matching DR found for '{query_symbol}'")

def _strip_tv_suffix(sym: str) -> str:
    return re.sub(r"\.(HK|SS|SZ|T)\s*$", "", (sym or "").strip(), flags=re.I)

# ✅ NEW: helper สำหรับ HK ให้เหลือเลข 4 หลักเสมอ
def _hk_digits(code: str) -> str | None:
    code = _strip_tv_suffix(code or "")
    digits = "".join(ch for ch in code if ch.isdigit())
    if not digits:
        return None
    return str(int(digits))  # ✅ ตัด leading zero


def build_underlying_tv_map(rows: list) -> dict[str, str]:
    """
    key = normalized "exchange_prefix:underlying"
    value = "exchange_prefix:resolved_symbol"
    """
    m: dict[str, str] = {}

    for dr in rows:
        exchange_name = dr.get("underlyingExchange")
        if not exchange_name:
            continue

        tv_prefix = EXCHANGE_TV_PREFIX_MAP.get(exchange_name)
        if not tv_prefix:
            continue

        underlying = str(dr.get("underlying", "")).strip()
        if not underlying:
            continue

        # HK → ใช้เลขล้วน 4 หลัก (NO .HK)
        if exchange_name == "The Stock Exchange of Hong Kong Limited":
            code = _extract_code_in_parens(dr.get("underlyingName", "")) or underlying
            hk = _hk_digits(code)
            if hk:
                underlying = hk
            else:
                # ✅ ไม่ให้พังทั้งระบบถ้าบางแถวข้อมูล HK แปลก ๆ
                continue

        # JP → เลขตรง ๆ
        if exchange_name == "Tokyo Stock Exchange":
            code = _extract_code_in_parens(dr.get("underlyingName", ""))
            if code:
                underlying = code

        # SSE → เลขตรง ๆ
        if exchange_name == "Shanghai Stock Exchange":
            code = _extract_code_in_parens(dr.get("underlyingName", ""))
            if code:
                underlying = code

        key = _norm(f"{tv_prefix}:{underlying}")
        m[key] = f"{tv_prefix}:{underlying}"

    return m

def map_to_tv_symbol_and_currency(dr: dict, underlying_tv_map: dict[str, str]) -> tuple[str, str]:
    exchange_name = dr.get("underlyingExchange")
    if not exchange_name:
        raise HTTPException(400, "Missing underlyingExchange")

    currency = EXCHANGE_CURRENCY_MAP.get(exchange_name)
    if not currency:
        raise HTTPException(400, f"Unsupported exchange (currency map missing): {exchange_name}")

    tv_prefix = EXCHANGE_TV_PREFIX_MAP.get(exchange_name)
    if not tv_prefix:
        raise HTTPException(400, f"Unsupported exchange (tv map missing): {exchange_name}")

    underlying = str(dr.get("underlying", "")).strip()
    if not underlying:
        raise HTTPException(400, "Missing underlying")

    # ✅ NEW: US / ETF / หุ้นส่วนใหญ่ ใช้ ticker ในวงเล็บจาก underlyingName เช่น "(GLD)"
# ✅ ใช้ ticker/code ในวงเล็บจาก underlyingName เป็นหลัก
# ครอบคลุม: US / SGX / Euronext / ETF
    if exchange_name in (
        "The Nasdaq Global Select Market",
        "The Nasdaq Stock Market",
        "The New York Stock Exchange",
        "The New York Stock Exchange Archipelago",
        "Singapore Exchange",
        "Euronext Paris",
        "Euronext Amsterdam",
        "Euronext Milan",
    ):
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code:
            underlying = code
        else:
            # ⚠️ ตลาดพวกนี้ไม่ควรเดา symbol จากชื่อ
            raise HTTPException(
                400,
                f"Missing ticker code in underlyingName: exchange={exchange_name}, underlyingName={dr.get('underlyingName')}"
            )

    # JP ต้องใช้เลข
    if exchange_name == "Tokyo Stock Exchange":
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code:
            underlying = code
        else:
            raise HTTPException(400, f"Missing JP numeric code in underlyingName: {dr.get('underlyingName')}")

    # SSE ต้องใช้เลขใน underlyingName เช่น "(588000)"
    if exchange_name == "Shanghai Stock Exchange":
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code:
            underlying = code
        else:
            if underlying.isdigit():
                pass
            else:
                raise HTTPException(400, f"Missing SSE numeric code in underlyingName: {dr.get('underlyingName')}")
            
    # ✅ HK ต้องเป็นเลขเท่านั้น (กันไม่ให้ยิง HKEX:PINGAN / HKEX:NONGFU / ชื่อ ETF)
    if exchange_name == "The Stock Exchange of Hong Kong Limited":
        code = _extract_code_in_parens(dr.get("underlyingName", "")) or underlying
        hk = _hk_digits(code)
        if hk:
            underlying = hk
        else:
            # ถ้าไม่มีเลขจริง ๆ ให้ error (หรือจะ rely on explicit override ก็ได้)
            raise HTTPException(
                400,
                f"HK underlying missing numeric code: underlying={dr.get('underlying')} underlyingName={dr.get('underlyingName')}"
            )

    # ✅ TWSE ต้องใช้ "เลขในวงเล็บ" เท่านั้น เช่น (0050)
    if exchange_name == "Taiwan Stock Exchange":
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code and code.isdigit():
            underlying = code
        else:
            raise HTTPException(
                400,
                f"TWSE underlying missing numeric code: underlyingName={dr.get('underlyingName')}"
            )
    # ✅ ถ้า underlying เป็นชื่อยาว/มีช่องว่าง/มีคำว่า ETF
    # ให้ใช้ ticker ในวงเล็บจาก underlyingName (เช่น (FUESSVFL))
    if (" " in underlying) or ("ETF" in underlying.upper()):
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code:
            underlying = code

    tv_symbol = f"{tv_prefix}:{underlying}"

    # ✅ 1) override แบบ explicit
    tv_symbol = TV_SYMBOL_OVERRIDES.get(tv_symbol, tv_symbol)

    # ✅ 2) map จาก ideatrade (กันเคส symbol แปลก)
    tv_symbol = underlying_tv_map.get(_norm(tv_symbol), tv_symbol)

    return tv_symbol, currency

# -----------------------------
# Background refresher
# -----------------------------
async def refresher_loop():
    tick = 0
    while True:
        try:
            tick += 1
            keys = sorted(_warm_keys.items(), key=lambda kv: kv[1], reverse=True)
            keys = [k for k, _ in keys[:WARM_KEYS_LIMIT]]

            for key in keys:
                item = _price_cache.get(key)
                near_exp = (not item) or (item["exp"] - _now() < 1)
                if not near_exp:
                    continue

                kind, tv_ticker = key.split("|", 1)

                if kind == "U" and FX_REFRESH_MULT > 1:
                    if tick % FX_REFRESH_MULT != 0:
                        continue

                v = await tv_scan_close(tv_ticker)
                cache_set(key, v, ttl=CACHE_TTL_SECONDS)

        except Exception:
            pass

        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _tv_client, _idea_client
    _tv_client = httpx.AsyncClient(timeout=10)
    _idea_client = httpx.AsyncClient(timeout=20)

    task = asyncio.create_task(refresher_loop())
    try:
        yield
    finally:
        task.cancel()
        await _tv_client.aclose()
        await _idea_client.aclose()

app.router.lifespan_context = lifespan

# -----------------------------
# MAIN ENDPOINT
# -----------------------------
@app.get("/api/calc/dr/{dr_symbol}")
async def calculate_dr(dr_symbol: str):
    """
    - ดึง DR list จาก ideatrade (snapshot)
    - เลือก row ให้ถูก
    - map เป็น tv symbol + currency (มี map ช่วย)
    - ดึง underlying + fx ผ่าน cache (เร็ว)
    """
    try:
        assert _idea_client is not None

        r = await _idea_client.get(f"{DR_API_URL}/caldr")
        r.raise_for_status()
        rows = r.json().get("rows", [])
        if not rows:
            raise HTTPException(404, "DR list is empty")

        # ✅ build map จาก ideatrade rows ก่อน
        underlying_tv_map = build_underlying_tv_map(rows)

        dr = pick_dr_row(rows, dr_symbol)

        tv_symbol, currency = map_to_tv_symbol_and_currency(dr, underlying_tv_map)

        fx_pair = FX_PAIR_MAP.get(currency)
        if not fx_pair:
            raise HTTPException(400, f"Unsupported currency (FX map missing): {currency}")

        # ✅ ดึงผ่าน cache
        underlying_price = None  # ✅ เพิ่มบรรทัดนี้ก่อน try

        try:
            underlying_price = await get_price_cached("U", tv_symbol, ttl=CACHE_TTL_SECONDS)

        except HTTPException as e:
            print("CALC_UNDERLYING_FAIL", dr_symbol, "tv_symbol=", tv_symbol, "status=", e.status_code, "detail=", e.detail)

            # ✅ fallback: ถ้า tv_symbol แปลกจริง ๆ ให้ลอง override จาก underlyingName
            code = _extract_code_in_parens(dr.get("underlyingName", ""))
            exchange_name = dr.get("underlyingExchange")
            tv_prefix = EXCHANGE_TV_PREFIX_MAP.get(exchange_name, "")

            # ✅ ถ้าคุณยังไม่ทำ fallback จริง ๆ ในโค้ด ให้จบตรงนี้เลย
            raise

        # ✅ กันหลุด (ถึงแม้โค้ดด้านบนควร raise แล้ว)
        if underlying_price is None:
            raise HTTPException(404, f"Underlying price not resolved for {dr_symbol} (tv_symbol={tv_symbol})")

        fx_rate = await get_price_cached("F", f"FX_IDC:{fx_pair}", ttl=CACHE_TTL_SECONDS)

        return {
            "dr_symbol": dr_symbol,
            "matched_symbol": dr.get("symbol"),
            "tv_symbol": tv_symbol,
            "currency": currency,
            "fx_pair": fx_pair,
            "fx_rate": float(fx_rate),  # จะปัดหรือไม่ก็ได้ แต่ถ้าจะให้ frontend จัดการ ก็ส่ง raw ไปเลย
            "underlying_price_raw": float(underlying_price),  # ✅ เพิ่มบรรทัดนี้ (ห้ามปัด)
            "underlying_price": float(underlying_price),      # ✅ แก้ไม่ให้ round (ให้หน้าเว็บปัดเอง)
            "underlyingExchange": dr.get("underlyingExchange"),
            "underlying": dr.get("underlying"),
            "underlyingName": dr.get("underlyingName"),
            "cache_ttl_sec": CACHE_TTL_SECONDS,
            "refresh_interval_sec": REFRESH_INTERVAL_SECONDS,
        }

    except HTTPException as e:
        # ✅ log แบบรู้ทันทีว่าพังที่ไหน
        print(
            "CALC_ERROR",
            "dr_symbol=", dr_symbol,
            "status=", e.status_code,
            "detail=", e.detail
        )
        raise

    except Exception as e:
        print("CALC_CRASH", "dr_symbol=", dr_symbol, "err=", type(e).__name__, str(e))
        raise HTTPException(500, f"Unhandled error: {type(e).__name__}")

if __name__ == "__main__":
    uvicorn.run("dr_calculation_api:app", host="0.0.0.0", port=8002, reload=True)
