from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import time
import httpx
import uvicorn

app = FastAPI(title="DR Calculation API (Cache + Background Refresh + Symbol Map)")

IDEATRADE_BASE = "https://api.ideatrade1.com"
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
}

EXCHANGE_TV_PREFIX_MAP = {
    "The Nasdaq Global Select Market": "NASDAQ",
    "The Nasdaq Stock Market": "NASDAQ",
    "The New York Stock Exchange": "NYSE",
    "The New York Stock Exchange Archipelago": "NYSEARCA",
    "The Stock Exchange of Hong Kong Limited": "HKEX",
    "Nasdaq Copenhagen": "OMXCOP",
    "Euronext Amsterdam": "AMS",
    "Euronext Paris": "EPA",
    "Euronext Milan": "MIL",
    "Tokyo Stock Exchange": "TSE",
    "Singapore Exchange": "SGX",
    "Taiwan Stock Exchange": "TWSE",
    "Shenzhen Stock Exchange": "SZSE",
    "Hochiminh Stock Exchange": "HOSE",
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

# -----------------------------
# ✅ TradingView symbol override (กรณี underlying ไม่ตรงกับชื่อที่ TV ใช้)
# ใส่เฉพาะตัวที่เจอปัญหาได้เลย
# format: {"EXCHANGE_PREFIX:UNDERLYING_FROM_IDEATRADE": "EXCHANGE_PREFIX:TV_SYMBOL"}
# หรือถ้าอยาก override ทั้งตัวเต็ม: {"NYSE:DISNEY": "NYSE:DIS"}
# -----------------------------
TV_SYMBOL_OVERRIDES: dict[str, str] = {
    # ตัวอย่าง:
    # "NYSE:DISNEY": "NYSE:DIS",
    # "NYSE:BRKB": "NYSE:BRK.B",
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

async def tv_scan_close(tv_ticker: str) -> float:
    """
    tv_ticker เช่น 'NASDAQ:AAPL' หรือ 'FX_IDC:USDTHB'
    """
    payload = {"symbols": {"tickers": [tv_ticker], "query": {"types": []}}, "columns": ["close"]}
    assert _tv_client is not None
    r = await _tv_client.post(TV_SCAN_URL, json=payload)
    r.raise_for_status()
    data = r.json()
    try:
        return float(data["data"][0]["d"][0])
    except Exception:
        raise HTTPException(500, f"Cannot fetch close for {tv_ticker}")

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

# -----------------------------
# ✅ NEW: build a map from ideatrade rows
# เพื่อแก้เคส user ส่งชื่อ underlying แปลก ๆ (เช่น DISNEY)
# ให้ map กลับเป็น tv_symbol ที่ถูกก่อนยิงไป TradingView
# -----------------------------
def build_underlying_tv_map(rows: list) -> dict[str, str]:
    """
    return dict ที่ key = normalized "exchange_prefix:underlying"
    value = "exchange_prefix:resolved_symbol"
    เช่น key "nyse:disney" -> value "NYSE:DIS"
    """
    m: dict[str, str] = {}

    for dr in rows:
        exchange_name = dr.get("underlyingExchange")
        if not exchange_name:
            continue
        tv_prefix = EXCHANGE_TV_PREFIX_MAP.get(exchange_name)
        if not tv_prefix:
            continue

        # base underlying from ideatrade
        underlying = str(dr.get("underlying", "")).strip()
        if not underlying:
            continue

        # HK/JP ใช้เลขในวงเล็บ
        if exchange_name == "The Stock Exchange of Hong Kong Limited":
            code = _extract_code_in_parens(dr.get("underlyingName", ""))
            if code:
                underlying = code

        if exchange_name == "Tokyo Stock Exchange":
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

    # HK ต้องใช้เลขในวงเล็บ
    if exchange_name == "The Stock Exchange of Hong Kong Limited":
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code:
            underlying = code

    # JP ต้องใช้เลข
    if exchange_name == "Tokyo Stock Exchange":
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code:
            underlying = code
        else:
            raise HTTPException(400, f"Missing JP numeric code in underlyingName: {dr.get('underlyingName')}")

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
    assert _idea_client is not None

    r = await _idea_client.get(f"{IDEATRADE_BASE}/caldr")
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
    try:
        underlying_price = await get_price_cached("U", tv_symbol, ttl=CACHE_TTL_SECONDS)
    except HTTPException:
        # ✅ fallback: ถ้า tv_symbol แปลกจริง ๆ ให้ลอง override จาก underlyingName (ในเคสหุ้น US ส่วนใหญ่จะเป็น ticker ในวงเล็บ)
        # ตัวอย่าง "WALT DISNEY CO (DIS)" -> ดึง DIS
        code = _extract_code_in_parens(dr.get("underlyingName", ""))
        if code:
            exchange_name = dr.get("underlyingExchange")
            tv_prefix = EXCHANGE_TV_PREFIX_MAP.get(exchange_name, "")
            if tv_prefix:
                alt_symbol = f"{tv_prefix}:{code}"
                alt_symbol = TV_SYMBOL_OVERRIDES.get(alt_symbol, alt_symbol)
                underlying_price = await get_price_cached("U", alt_symbol, ttl=CACHE_TTL_SECONDS)
                tv_symbol = alt_symbol
            else:
                raise
        else:
            raise

    fx_rate = await get_price_cached("F", f"FX_IDC:{fx_pair}", ttl=CACHE_TTL_SECONDS)

    return {
        "dr_symbol": dr_symbol,
        "matched_symbol": dr.get("symbol"),
        "tv_symbol": tv_symbol,
        "currency": currency,
        "fx_pair": fx_pair,
        "fx_rate": round(float(fx_rate), 6),
        "underlying_price": round(float(underlying_price), 2),
        "underlyingExchange": dr.get("underlyingExchange"),
        "underlying": dr.get("underlying"),
        "underlyingName": dr.get("underlyingName"),
        "cache_ttl_sec": CACHE_TTL_SECONDS,
        "refresh_interval_sec": REFRESH_INTERVAL_SECONDS,
    }

if __name__ == "__main__":
    uvicorn.run("dr_calculation_api:app", host="0.0.0.0", port=8000, reload=True)