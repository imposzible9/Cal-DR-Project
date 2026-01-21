from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
import os
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))


NEWS_API_BASE_URL = "https://newsapi.org/v2/top-headlines"
NEWS_API_KEY = os.getenv("NEWS_API_KEY") or None
NEWS_TTL_SECONDS = int(os.getenv("NEWS_TTL_SECONDS") or "300")
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
FINNHUB_TOKEN = os.getenv("FINNHUB_TOKEN") or None

app = FastAPI(title="News API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

_client: httpx.AsyncClient | None = None
_news_cache: dict[str, dict] = {}

FALLBACK_SYMBOLS = [
    {"symbol": "AAPL", "name": "Apple Inc.", "logo": "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "logo": "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"},
    {"symbol": "GOOG", "name": "Alphabet Inc.", "logo": "https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg"},
    {"symbol": "AMZN", "name": "Amazon.com, Inc.", "logo": "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "logo": "https://upload.wikimedia.org/wikipedia/commons/2/21/Nvidia_logo.svg"},
    {"symbol": "TSLA", "name": "Tesla, Inc.", "logo": "https://upload.wikimedia.org/wikipedia/commons/e/e8/Tesla_logo.png"},
    {"symbol": "META", "name": "Meta Platforms, Inc.", "logo": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg"},
    {"symbol": "BABA", "name": "Alibaba Group Holding Limited", "logo": "https://upload.wikimedia.org/wikipedia/en/8/80/Alibaba-Group-Logo.svg"},
    {"symbol": "NFLX", "name": "Netflix, Inc.", "logo": "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg"},
    {"symbol": "AMD", "name": "Advanced Micro Devices, Inc.", "logo": "https://upload.wikimedia.org/wikipedia/commons/7/7c/AMD_Logo.svg"}
]


def _now() -> float:
    return time.time()


def _cache_get(key: str):
    item = _news_cache.get(key)
    if not item:
        return None
    if item["exp"] <= _now():
        return None
    return item["value"]


def _cache_set(key: str, value, ttl: int = NEWS_TTL_SECONDS):
    _news_cache[key] = {"value": value, "exp": _now() + ttl}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client
    _client = httpx.AsyncClient(timeout=10)
    try:
        yield
    finally:
        await _client.aclose()


app.router.lifespan_context = lifespan


async def fetch_news(symbol: str, limit: int, language: str | None, hours: int, country: str | None):
    if not NEWS_API_KEY:
        return await fetch_google_news(symbol, limit, language, hours, country)

    assert _client is not None

    params: dict[str, str | int] = {
        "q": symbol,
        "pageSize": limit,
        "sortBy": "publishedAt",
        "apiKey": NEWS_API_KEY,
        "category": "business",
    }

    if country:
        params["country"] = country
    else:
        params["country"] = "us"

    if language:
        params["language"] = language

    if hours > 0:
        now_utc = datetime.now(timezone.utc)
        since = now_utc - timedelta(hours=hours)
        params["from"] = since.isoformat()

    r = await _client.get(NEWS_API_BASE_URL, params=params)
    if r.status_code != 200:
        return await fetch_google_news(symbol, limit, language, hours, country)

    data = r.json()
    articles = data.get("articles") or []
    if not articles:
        return await fetch_google_news(symbol, limit, language, hours, country)

    normalized = []
    for a in articles:
        source = a.get("source") or {}
        normalized.append(
            {
                "title": a.get("title"),
                "summary": a.get("description") or a.get("content"),
                "published_at": a.get("publishedAt"),
                "source": source.get("name"),
                "url": a.get("url"),
                "image_url": a.get("urlToImage"),
            }
        )

    return normalized

async def fetch_google_news(query: str, limit: int, language: str | None, hours: int, country: str | None):
    assert _client is not None
    hl = "en-US"
    gl = "US"
    ceid = "US:en"

    if country:
        gl = country.upper()
        hl = f"en-{gl}"
        ceid = f"{gl}:en"

    if language and language.lower().startswith("th"):
        hl = "th"
        gl = "TH"
        ceid = "TH:th"
    params = {"q": query, "hl": hl, "gl": gl, "ceid": ceid}
    r = await _client.get("https://news.google.com/rss/search", params=params)
    if r.status_code != 200:
        return []
    text = r.text
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(text)
    except Exception:
        return []
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else []
    normalized = []
    since_dt = None
    if hours and hours > 0:
        since_dt = datetime.now(timezone.utc) - timedelta(hours=hours)
    for it in items:
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate")
        source_el = it.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else None
        published_at = pub
        if pub:
            try:
                dt = parsedate_to_datetime(pub)
                if dt and since_dt and dt.tzinfo:
                    if dt < since_dt:
                        continue
            except Exception:
                pass
        normalized.append(
            {
                "title": title or None,
                "summary": None,
                "published_at": published_at,
                "source": source,
                "url": link or None,
                "image_url": None,
            }
        )
        if len(normalized) >= limit:
            break
    return normalized


async def fetch_quote(symbol: str):
    if not FINNHUB_TOKEN:
        return None

    assert _client is not None

    try:
        r = await _client.get(f"{FINNHUB_BASE_URL}/quote", params={"symbol": symbol.upper(), "token": FINNHUB_TOKEN})
        if r.status_code != 200:
            return None
        q = r.json() or {}
        return {
            "symbol": symbol.upper(),
            "price": q.get("c"),
            "change": q.get("d"),
            "change_pct": q.get("dp"),
            "high": q.get("h"),
            "low": q.get("l"),
            "open": q.get("o"),
            "prev_close": q.get("pc"),
        }
    except Exception:
        return None


async def fetch_logo(symbol: str):
    if not FINNHUB_TOKEN:
        return None

    assert _client is not None

    try:
        r = await _client.get(
            f"{FINNHUB_BASE_URL}/stock/profile2",
            params={"symbol": symbol.upper(), "token": FINNHUB_TOKEN},
        )
        if r.status_code != 200:
            return None
        data = r.json() or {}
        return data.get("logo")
    except Exception:
        return None

@app.get("/api/news/{symbol}")
async def get_news(
    symbol: str,
    limit: int = Query(10, ge=1, le=50),
    language: str | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
    country: str | None = Query(None, description="Two-letter country code (e.g., us, gb)"),
):
    key = f"news-v2|{symbol.upper()}|{limit}|{language or ''}|{hours}|{country or ''}"
    cached = _cache_get(key)
    if cached is not None:
        return {
            "symbol": symbol.upper(),
            "total": len(cached["news"]),
            "news": cached["news"],
            "quote": cached.get("quote"),
            "logo_url": cached.get("logo_url"),
            "cached": True,
            "ttl_seconds": NEWS_TTL_SECONDS,
        }

    items = await fetch_news(symbol, limit, language, hours, country)
    quote = await fetch_quote(symbol)
    logo_url = await fetch_logo(symbol)

    payload = {"news": items, "quote": quote, "logo_url": logo_url}
    _cache_set(key, payload, ttl=NEWS_TTL_SECONDS)

    return {
        "symbol": symbol.upper(),
        "total": len(items),
        "news": items,
        "quote": quote,
        "logo_url": logo_url,
        "cached": False,
        "ttl_seconds": NEWS_TTL_SECONDS,
    }

import random

# =============== FINNHUB PROXY ENDPOINTS ===============

async def _require_client():
    if _client is None:
        raise HTTPException(500, "HTTP client not initialized")

@app.get("/api/finnhub/quote/{symbol}")
async def get_quote(symbol: str):
    if not FINNHUB_TOKEN:
        raise HTTPException(500, "FINNHUB_TOKEN is not configured")

    await _require_client()

    r = await _client.get(f"{FINNHUB_BASE_URL}/quote", params={"symbol": symbol.upper(), "token": FINNHUB_TOKEN})
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Finnhub quote error: {r.text[:200]}")
    q = r.json() or {}

    logo_url = await fetch_logo(symbol)

    return {
        "symbol": symbol.upper(),
        "price": q.get("c"),
        "change": q.get("d"),
        "change_pct": q.get("dp"),
        "high": q.get("h"),
        "low": q.get("l"),
        "open": q.get("o"),
        "prev_close": q.get("pc"),
        "logo_url": logo_url,
    }

@app.get("/api/finnhub/company-news/{symbol}")
async def get_company_news(
    symbol: str,
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(20, ge=1, le=50),
    country: str | None = Query(None, description="Two-letter country code (e.g., us, gb)"),
):
    if not FINNHUB_TOKEN:
        items = await fetch_news(symbol.upper(), limit, language="en", hours=hours, country=country)
        return {
            "symbol": symbol.upper(),
            "total": len(items),
            "news": items,
        }

    await _require_client()

    # Finnhub company-news requires date range (YYYY-MM-DD)
    now_utc = datetime.now(timezone.utc)
    since = now_utc - timedelta(hours=hours)
    params = {
        "symbol": symbol.upper(),
        "from": since.date().isoformat(),
        "to": now_utc.date().isoformat(),
        "token": FINNHUB_TOKEN,
    }
    r = await _client.get(f"{FINNHUB_BASE_URL}/company-news", params=params)
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"Finnhub news error: {r.text[:200]}")
    items = r.json() or []
    # Normalize structure similar to NewsAPI
    normalized = []
    for a in items[:limit]:
        normalized.append(
            {
                "title": a.get("headline"),
                "summary": a.get("summary"),
                "published_at": a.get("datetime"),
                "source": a.get("source"),
                "url": a.get("url"),
                "image_url": a.get("image"),
            }
        )
    return {
        "symbol": symbol.upper(),
        "total": len(normalized),
        "news": normalized,
    }


@app.get("/api/stock/overview/{symbol}")
async def get_stock_overview(
    symbol: str,
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(20, ge=1, le=50),
    language: str | None = Query(None),
    country: str | None = Query(None, description="Two-letter country code (e.g., us, gb)"),
):
    symbol_upper = symbol.upper()

    quote = None
    news_items = []
    logo_url = None

    if FINNHUB_TOKEN:
        await _require_client()

        r_quote = await _client.get(
            f"{FINNHUB_BASE_URL}/quote",
            params={"symbol": symbol_upper, "token": FINNHUB_TOKEN},
        )
        if r_quote.status_code != 200:
            raise HTTPException(r_quote.status_code, f"Finnhub quote error: {r_quote.text[:200]}")
        q = r_quote.json() or {}
        quote = {
            "symbol": symbol_upper,
            "price": q.get("c"),
            "change": q.get("d"),
            "change_pct": q.get("dp"),
            "high": q.get("h"),
            "low": q.get("l"),
            "open": q.get("o"),
            "prev_close": q.get("pc"),
        }

        logo_url = await fetch_logo(symbol_upper)

        now_utc = datetime.now(timezone.utc)
        since = now_utc - timedelta(hours=hours)
        params = {
            "symbol": symbol_upper,
            "from": since.date().isoformat(),
            "to": now_utc.date().isoformat(),
            "token": FINNHUB_TOKEN,
        }
        r_news = await _client.get(f"{FINNHUB_BASE_URL}/company-news", params=params)
        if r_news.status_code != 200:
            raise HTTPException(r_news.status_code, f"Finnhub news error: {r_news.text[:200]}")
        items = r_news.json() or []
        for a in items[:limit]:
            news_items.append(
                {
                    "title": a.get("headline"),
                    "summary": a.get("summary"),
                    "published_at": a.get("datetime"),
                    "source": a.get("source"),
                    "url": a.get("url"),
                    "image_url": a.get("image"),
                }
            )
    else:
        items = await fetch_news(symbol_upper, limit, language or "en", hours, country)
        news_items = items

    return {
        "symbol": symbol_upper,
        "quote": quote,
        "logo_url": logo_url,
        "news": {
            "total": len(news_items),
            "items": news_items,
        },
    }

@app.get("/api/symbols")
async def get_symbols():
    """
    Fetches the list of available DR symbols and their underlying assets.
    """
    # Use cached list if available and fresh
    key = "dr_symbols_list"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    if _client is None:
         # Should be initialized in lifespan, but just in case
        async with httpx.AsyncClient() as client:
             return await _fetch_and_cache_symbols(client, key)
    
    return await _fetch_and_cache_symbols(_client, key)

async def _fetch_and_cache_symbols(client, key):
    try:
        try:
            r = await client.get("http://172.17.1.85:8333/dr", timeout=5)
            if r.status_code != 200:
                print(f"DR API returned status {r.status_code}, using fallback.")
                return FALLBACK_SYMBOLS
            
            data = r.json()
            rows = data.get("rows", [])
        except Exception as e:
            print(f"Error connecting to DR API: {e}, using fallback.")
            return FALLBACK_SYMBOLS
        
        # Extract unique underlying symbols
        symbols = {}
        for row in rows:
            # Prefer underlying symbol
            underlying = row.get("underlying")
            if not underlying:
                # Fallback to symbol minus suffix if needed, or just skip
                continue
            
            underlying = underlying.strip().upper()
            if underlying not in symbols:
                symbols[underlying] = {
                    "symbol": underlying,
                    "name": row.get("underlyingName") or row.get("name") or "",
                    "dr_symbol": row.get("symbol"), # Keep reference to DR symbol if needed
                    "logo": row.get("logo") or row.get("logoUrl") or row.get("image") # Try to get logo if available
                }
        
        result = list(symbols.values())
        # Sort by symbol
        result.sort(key=lambda x: x["symbol"])
        
        # Cache for longer duration (e.g. 1 hour)
        _cache_set(key, result, ttl=3600)
        
        return result
    except Exception as e:
        print(f"Error fetching symbols: {e}")
        return FALLBACK_SYMBOLS


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8003)

