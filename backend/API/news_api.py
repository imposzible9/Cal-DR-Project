from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import httpx
import os
import time
import asyncio
import re
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

NEWS_API_BASE_URL = "https://newsapi.org/v2/top-headlines"
NEWS_API_KEY = "a2982e76c7844902b4289a6b08712d89"
NEWS_TTL_SECONDS = int(os.getenv("NEWS_TTL_SECONDS") or "300")
FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
FINNHUB_TOKEN = os.getenv("FINNHUB_TOKEN") or None
DR_LIST_URL = os.getenv("DR_LIST_URL") or "http://172.17.1.85:8333/dr"
TRADINGVIEW_SCANNER_URL = os.getenv("TRADINGVIEW_SCANNER_URL") or "https://scanner.tradingview.com/america/scan"

app = FastAPI(title="News API")

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

_client: httpx.AsyncClient | None = None
_news_cache: dict[str, dict] = {}

TRUSTED_SOURCES = {
    "bloomberg", "reuters", "cnbc", "wall street journal", "financial times", "wsj",
    "marketwatch", "nikkei", "bangkok post", "the nation", "scmp", "caixin",
    "bbc", "cnn", "forbes", "business insider", "techcrunch", "engadget",
    "kaohoon", "thansettakij", "money channel", "efinance thai", "infoquest",
    "settrade", "prachachat", "ประชาชาติ", "กรุงเทพธุรกิจ", "ฐานเศรษฐกิจ",
    "ข่าวหุ้น", "ทันหุ้น", "bangkok biz news",
    "xinhua", "global times", "china daily", "south china morning post", "scmp",
    "korea times", "yonhap", "pulse news",
    "japan times", "asahi", "mainichi", "yomiuri", "kyodo",
    "straitstimes", "businesstimes", "cna",
    "vietnam news", "vnexpress",
    "taipei times", "focustaiwan",
    "times of india", "economic times", "hindu business line",
}

BLOCKED_DOMAINS = {
    "youtube.com", "youtu.be",
    "tiktok.com",
    "facebook.com",
    "instagram.com",
    "twitter.com", "x.com",
    "reddit.com",
    "pinterest.com",
    "vimeo.com",
    "dailymotion.com",
    "espn.com", # Sports sites often have irrelevant ticker matches
    "linkedin.com",
    "medium.com",
    "quora.com",
    "pantip.com",
    "discord.com",
    "telegram.org",
    "tumblr.com",
    "myspace.com",
    "tripadvisor.com",
    "yelp.com",
    "soundcloud.com",
    "spotify.com",
    "twitch.tv",
    "blockdit.com", # Thai social blog
    "lemon8-app.com",
}

IRRELEVANT_KEYWORDS = [
    "giveaway", "sweepstakes", "lottery", "horoscope",
    "soccer", "football", "basketball", "sport",
    "celebrity", "gossip", "dating",
    "sex", "porn",
    "concert", "ticket",
    "review", "unboxing", 
    "how to", "tutorial",
    "deal", "discount", "coupon",
    "joker", "slot", "bet", "casino",
    "ufabet", "pgslot", # Thai gambling keywords
]

VIDEO_KEYWORDS = [
    "watch:", "video:", "live:", "stream:",
    "full episode", "official trailer",
    "music video", "mv",
]

STOCK_SUFFIXES = {
    "us": " stock",
    "gb": " stock",
    "au": " stock",
    "ca": " stock",
    "in": " stock",
    "sg": " stock",
    "th": " หุ้น",
    "cn": " 股票",
    "hk": " stock", 
    "tw": " 股票",
    "jp": " 株",
    "kr": " 주식",
    "vn": " cổ phiếu",
    "de": " aktie",
    "fr": " action",
}

# Mapping for "Stock Market" queries in local languages to improve Google News hits
LOCAL_MARKET_QUERIES = {
    "cn": "股市",
    "hk": "stock market", # HK is mostly English/Bilingual
    "jp": "株式市場",
    "kr": "주식 시장",
    "vn": "thị trường chứng khoán",
    "th": "ตลาดหุ้น",
    "tw": "股市",
    "in": "stock market",
    "de": "börse",
    "fr": "bourse",
    "us": "stock market",
    "gb": "stock market",
    "au": "stock market",
    "sg": "stock market",
    "ca": "stock market",
}

COUNTRY_LANG_DEFAULTS = {
    "CN": "zh-CN",
    "JP": "ja-JP",
    "KR": "ko-KR",
    "TW": "zh-TW",
    "VN": "vi-VN",
    "TH": "th",
    "DE": "de",
    "FR": "fr",
}

def _is_trusted_source(source_name: str) -> bool:
    if not source_name: return False
    s = source_name.lower()
    return any(t in s for t in TRUSTED_SOURCES)

def _is_valid_source(item: dict) -> bool:
    """Filter out unwanted sources like Yahoo Finance and Social Media"""
    src = (item.get("source") or "").lower()
    url = (item.get("url") or "").lower()
    
    # 1. Block specific domains
    for domain in BLOCKED_DOMAINS:
        if domain in url:
            return False
            
    # 2. Block if source name implies video/social (heuristic)
    if "tiktok" in src or "youtube" in src:
        return False
        
    # 3. Check for video patterns in URL
    if "/video/" in url or "/watch?" in url or "/shorts/" in url:
        return False

    # 4. Check for irrelevant content in title/summary
    title = (item.get("title") or "").lower()
    summary = (item.get("summary") or "").lower()
    full_text = f"{title} {summary}"
    
    # Check for video keywords
    if any(k in title for k in VIDEO_KEYWORDS):
        return False
        
    # Check for spam/irrelevant keywords
    if any(k in full_text for k in IRRELEVANT_KEYWORDS):
        return False
        
    return True

def _get_exclusion_string() -> str:
    # Construct -site:domain1 -site:domain2 ...
    return " ".join([f"-site:{d}" for d in BLOCKED_DOMAINS])

def _mix_news_sources(items: list[dict], limit: int) -> list[dict]:
    """
    Mix Yahoo news with other sources.
    Strategy: Interleave 2 non-Yahoo items with 1 Yahoo item to ensure diversity.
    """
    yahoo_items = []
    other_items = []
    
    seen_urls = set()
    unique_items = []
    
    # Deduplicate
    for item in items:
        url = (item.get("url") or "").lower()
        if url in seen_urls:
            continue
        seen_urls.add(url)
        unique_items.append(item)
        
    for item in unique_items:
        src = (item.get("source") or "").lower()
        url = (item.get("url") or "").lower()
        if "yahoo" in src or "yahoo" in url:
            yahoo_items.append(item)
        else:
            other_items.append(item)
            
    # Interleave: 2 others, 1 yahoo
    result = []
    y_idx = 0
    o_idx = 0
    
    while len(result) < limit and (y_idx < len(yahoo_items) or o_idx < len(other_items)):
        # Add up to 2 others
        for _ in range(2):
            if o_idx < len(other_items):
                result.append(other_items[o_idx])
                o_idx += 1
                if len(result) >= limit: break
        
        if len(result) >= limit: break
        
        # Add 1 yahoo
        if y_idx < len(yahoo_items):
            result.append(yahoo_items[y_idx])
            y_idx += 1
            
    return result

from urllib.parse import urlparse, parse_qs, unquote

def _normalize_url(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip()
    try:
        p = urlparse(u)
        if not p.scheme:
            return None
        if p.netloc.endswith("news.google.com") or p.netloc.endswith("google.com"):
            qs = parse_qs(p.query)
            raw = qs.get("url", [None])[0]
            if raw:
                cand = unquote(raw)
                if cand.startswith("http://") or cand.startswith("https://"):
                    u = cand
        return u
    except Exception:
        return None

def _normalize_source(source: str | None, url: str | None) -> str | None:
    s = (source or "").strip()
    if url:
        try:
            host = urlparse(url).netloc.lower()
            host = host[4:] if host.startswith("www.") else host
            if not s or s.lower() in {"google news", "newsapi", "newsapi.org"}:
                return host
        except Exception:
            pass
    return s or None

async def _maybe_resolve_redirect(url: str) -> str:
    try:
        p = urlparse(url)
        host = p.netloc.lower()
        if host.endswith("news.google.com"):
            assert _client is not None
            r = await _client.get(url, timeout=5)
            final = str(r.url)
            fp = urlparse(final).netloc.lower()
            if fp and not fp.endswith("news.google.com"):
                return final
            try:
                txt = r.text
                m = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', txt)
                if not m:
                    m = re.search(r'<meta[^>]+property="og:url"[^>]+content="([^"]+)"', txt)
                if m:
                    cand = m.group(1)
                    cp = urlparse(cand).netloc.lower()
                    if cand.startswith("http") and cp and not cp.endswith("news.google.com"):
                        return cand
            except Exception:
                pass
    except Exception:
        pass
    return url

FALLBACK_SYMBOLS = [
    {"symbol": "AAPL", "name": "Apple Inc.", "logo": "https://s3-symbol-logo.tradingview.com/apple.svg", "country": "US"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "logo": "https://s3-symbol-logo.tradingview.com/microsoft.svg", "country": "US"},
    {"symbol": "GOOG", "name": "Alphabet Inc.", "logo": "https://s3-symbol-logo.tradingview.com/alphabet.svg", "country": "US"},
    {"symbol": "AMZN", "name": "Amazon.com, Inc.", "logo": "https://s3-symbol-logo.tradingview.com/amazon.svg", "country": "US"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "logo": "https://s3-symbol-logo.tradingview.com/nvidia.svg", "country": "US"},
    {"symbol": "TSLA", "name": "Tesla, Inc.", "logo": "https://s3-symbol-logo.tradingview.com/tesla.svg", "country": "US"},
    {"symbol": "META", "name": "Meta Platforms, Inc.", "logo": "https://s3-symbol-logo.tradingview.com/meta-platforms.svg", "country": "US"},
    {"symbol": "BABA", "name": "Alibaba Group Holding Limited", "logo": "https://s3-symbol-logo.tradingview.com/alibaba.svg", "country": "US"},
    {"symbol": "NFLX", "name": "Netflix, Inc.", "logo": "https://s3-symbol-logo.tradingview.com/netflix.svg", "country": "US"},
    {"symbol": "AMD", "name": "Advanced Micro Devices, Inc.", "logo": "https://s3-symbol-logo.tradingview.com/advanced-micro-devices.svg", "country": "US"}
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
    await init_client()
    try:
        yield
    finally:
        await close_client()


app.router.lifespan_context = lifespan


async def init_client():
    global _client
    _client = httpx.AsyncClient(timeout=10, follow_redirects=True)


async def close_client():
    global _client
    if _client:
        await _client.aclose()


async def fetch_news(symbol: str, limit: int, language: str | None, hours: int, country: str | None):
    # Enhance query to ensure relevance, especially for common words (e.g. "LOVE", "BEST")
    search_query = symbol
    target_country = country if country else "us"
    
    is_general_market = symbol.lower() in ["stock market", "market", "business"]
    
    if not is_general_market:
        # Append stock-related keywords based on country to filter out non-financial news
        suffix = STOCK_SUFFIXES.get(target_country.lower(), " stock")
        
        # Don't append if already present
        if suffix.strip().lower() not in symbol.lower():
             search_query = f"{symbol}{suffix}"
    
    if is_general_market:
        # Strict enforcement: Always use specific "Stock Market" query for the country
        # This overrides generic terms like "business" or "market"
        # BUT if language is explicitly 'en', use 'stock market' to ensure we get English results
        if language == 'en':
            search_query = "stock market"
        elif country and country.lower() in LOCAL_MARKET_QUERIES:
            search_query = LOCAL_MARKET_QUERIES[country.lower()]
        else:
            # Default fallback if country not in list (though we added most)
            search_query = "stock market"

    # Apply default language if not provided
    if not language and country and country.upper() in COUNTRY_LANG_DEFAULTS:
        language = COUNTRY_LANG_DEFAULTS[country.upper()]

    if not NEWS_API_KEY:
        return await fetch_google_news(search_query, limit, language, hours, country)

    assert _client is not None

    params: dict[str, str | int] = {
        "pageSize": limit,
        "apiKey": NEWS_API_KEY,
        "category": "business",
    }
    
    if not is_general_market:
        # params["q"] = search_query
        # params["sortBy"] = "publishedAt" # Not supported by top-headlines
        pass

    # ALWAYS apply the search query to filter for specific topics (e.g. "stock market")
    # even for general category, to avoid broad "business" news that isn't stock related.
    # User requirement: "All news must be stock market related, no general news"
    if search_query:
        params["q"] = search_query

    if country:
        params["country"] = country
    else:
        params["country"] = "us"

    if language:
        # NewsAPI uses 2-letter codes (e.g., 'zh' not 'zh-CN')
        params["language"] = language.split('-')[0]
    
    print(f"Fetching NewsAPI: {NEWS_API_BASE_URL} Params: {params}")

    # 'from' param is not supported by top-headlines, so we omit it or only use it if we were using /everything
    # But since we are forced to use top-headlines, we skip 'from' logic for API call.
    # We can filter results manually if needed, but top-headlines are usually recent.
    
    # if hours > 0:
    #     now_utc = datetime.now(timezone.utc)
    #     since = now_utc - timedelta(hours=hours)
    #     params["from"] = since.isoformat()

    try:
        r = await _client.get(NEWS_API_BASE_URL, params=params)
    except Exception:
        return await fetch_google_news(search_query, limit, language, hours, country)

    if r.status_code != 200:
        return await fetch_google_news(search_query, limit, language, hours, country)

    data = r.json()
    articles = data.get("articles") or []
    if not articles:
        return await fetch_google_news(search_query, limit, language, hours, country)

    normalized = []
    for a in articles:
        source = a.get("source") or {}
        item = {
            "title": a.get("title"),
            "summary": a.get("description") or a.get("content"),
            "published_at": a.get("publishedAt"),
            "source": source.get("name"),
            "url": a.get("url"),
            "image_url": a.get("urlToImage"),
            "is_trusted": _is_trusted_source(source.get("name")),
        }
        item["url"] = _normalize_url(item["url"])
        item["source"] = _normalize_source(item["source"], item["url"])
        if item["url"] and _is_valid_source(item):
            normalized.append(item)

    if not normalized:
        return await fetch_google_news(search_query, limit, language, hours, country)

    return _mix_news_sources(normalized, limit)

async def _fetch_google_rss_items(query: str, limit: int, language: str | None, hours: int, country: str | None):
    assert _client is not None
    hl = "en-US"
    gl = "US"
    ceid = "US:en"

    if country:
        gl = country.upper()
        hl = f"en-{gl}"
        ceid = f"{gl}:en"

    if language:
        hl = language
        # If country is known, construct CEID using it
        if country:
            ceid = f"{country.upper()}:{hl}"
        elif language.lower() == "th":
            gl = "TH"
            ceid = "TH:th"
            
    # Add time filter to query to ensure freshness (e.g., when:3d)
    if hours and hours > 0:
        days = (hours + 23) // 24
        query += f" when:{days}d"

    params = {"q": query, "hl": hl, "gl": gl, "ceid": ceid}
    
    try:
        r = await _client.get("https://news.google.com/rss/search", params=params)
        if r.status_code != 200:
            return []
        text = r.text
        
        import xml.etree.ElementTree as ET
        root = ET.fromstring(text)
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
            
            # Extract description
            raw_desc = (it.findtext("description") or "").strip()
            summary = None
            if raw_desc:
                # Remove HTML tags (Google News RSS often has <a>...</a>)
                summary = re.sub(r'<[^>]+>', '', raw_desc).strip()
                # Decode HTML entities if present (basic cleanup)
                summary = summary.replace("&nbsp;", " ").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")

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
            item = {
                "title": title or None,
                "summary": summary,
                "published_at": published_at,
                "source": source,
                "url": link or None,
                "image_url": None,
                "is_trusted": _is_trusted_source(source),
            }
            item["url"] = _normalize_url(item["url"])
            if item["url"]:
                item["url"] = await _maybe_resolve_redirect(item["url"])
            item["source"] = _normalize_source(item["source"], item["url"])
            if item["url"] and _is_valid_source(item):
                normalized.append(item)
                # Collect enough items
                if len(normalized) >= limit * 2:
                    break
        return normalized
    except Exception as e:
        print(f"Google RSS error for {query}: {e}")
        return []

async def fetch_google_news(query: str, limit: int, language: str | None, hours: int, country: str | None):
    # Parallel fetch strategy to ensure diversity
    # 1. Fetch mostly non-Yahoo sources
    # 2. Fetch Yahoo sources (if needed)
    
    # We add -site:yahoo.com to exclude Yahoo from the "Others" query
    # We add site:finance.yahoo.com to specifically get Yahoo for the "Yahoo" query
    
    exclusions = _get_exclusion_string()
    query_others = f"{query} -site:yahoo.com -site:finance.yahoo.com {exclusions}"
    query_yahoo = f"{query} site:finance.yahoo.com"
    
    t_others = _fetch_google_rss_items(query_others, limit, language, hours, country)
    t_yahoo = _fetch_google_rss_items(query_yahoo, limit, language, hours, country)
    
    items_others, items_yahoo = await asyncio.gather(t_others, t_yahoo)
    
    # Combine lists
    all_items = items_others + items_yahoo
    
    return _mix_news_sources(all_items, limit)


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
    # 1. Try Finnhub with raw symbol first
    if FINNHUB_TOKEN:
        try:
            if _client:
                r = await _client.get(
                    f"{FINNHUB_BASE_URL}/stock/profile2",
                    params={"symbol": symbol.upper(), "token": FINNHUB_TOKEN},
                )
                if r.status_code == 200:
                    data = r.json() or {}
                    if data.get("logo"):
                        return data.get("logo")
        except Exception:
            pass

    # 2. Fallback to Internal List (TradingView/DR)
    # This covers cases where Finnhub misses (e.g. non-US stocks) or requires suffix
    try:
        all_symbols = await get_symbols()
        # Try exact match
        match = next((s for s in all_symbols if s["symbol"] == symbol.upper()), None)
        
        # Try stripping suffix (e.g. PTT.BK -> PTT)
        if not match and "." in symbol:
            short_sym = symbol.split(".")[0]
            match = next((s for s in all_symbols if s["symbol"] == short_sym.upper()), None)

        # Try stripping leading zeros (e.g. 0700 -> 700)
        if not match and symbol.isdigit() and symbol.startswith("0"):
            short_sym = str(int(symbol))
            match = next((s for s in all_symbols if s["symbol"] == short_sym), None)

        if match and match.get("logo"):
            return match.get("logo")
    except Exception:
        pass
        
    return None

@app.get("/api/news/{symbol}")
async def get_news(
    symbol: str,
    limit: int = Query(10, ge=1, le=50),
    language: str | None = Query(None),
    hours: int = Query(24, ge=1, le=168),
    country: str | None = Query(None, description="Two-letter country code (e.g., us, gb)"),
):
    key = f"news-v10|{symbol.upper()}|{limit}|{language or ''}|{hours}|{country or ''}"
    cached = _cache_get(key)
    if cached is not None:
        # Check if cache is "stale but usable" (soft TTL)
        # For now, we just return it as valid.
        return {
            "symbol": symbol.upper(),
            "total": len(cached["news"]),
            "news": cached["news"],
            "quote": cached.get("quote"),
            "logo_url": cached.get("logo_url"),
            "cached": True,
            "ttl_seconds": NEWS_TTL_SECONDS,
        }

    # Parallel Fetching for Critical Data
    # If this is a general market query (no quote needed), skip fetch_quote/fetch_logo to save time
    is_general_query = " OR " in symbol or " " in symbol # Heuristic for search query vs ticker
    
    if is_general_query:
        items = await fetch_news(symbol, limit, language, hours, country)
        quote = None
        logo_url = None
    else:
        items, quote, logo_url = await asyncio.gather(
            fetch_news(symbol, limit, language, hours, country),
            fetch_quote(symbol),
            fetch_logo(symbol)
        )

    payload = {"news": items, "quote": quote, "logo_url": logo_url}
    
    # Cache Aggressively for General News (Longer TTL)
    ttl = NEWS_TTL_SECONDS
    if is_general_query:
        ttl = 600 # 10 minutes for general news
        
    _cache_set(key, payload, ttl=ttl)

    return {
        "symbol": symbol.upper(),
        "total": len(items),
        "news": items,
        "quote": quote,
        "logo_url": logo_url,
        "cached": False,
        "ttl_seconds": ttl,
    }

import random

# =============== HELPER FUNCTIONS ===============

EXCHANGE_SUFFIX_MAP = {
    "SET": ".BK", "mai": ".BK",
    "HKEX": ".HK",
    "TSE": ".T",
    "LSE": ".L", "LSIN": ".L",
    "SSE": ".SS", "SZSE": ".SZ",
    "KSE": ".KS", "KOSDAQ": ".KQ",
    "SGX": ".SI",
    "TWSE": ".TW",
    "NSE": ".NS", "BSE": ".BO",
    "ASX": ".AX",
    "XETRA": ".DE", "FWB": ".F",
    "EURONEXT": ".PA",
    "HOSE": ".HM", "HNX": ".HN",
}

async def _resolve_finnhub_symbol(symbol: str) -> str:
    """
    Resolves the correct Finnhub symbol (with suffix) based on the exchange.
    """
    if "." in symbol:
        return symbol
        
    # Look up in our symbol list
    all_symbols = await get_symbols()
    match = next((s for s in all_symbols if s["symbol"] == symbol), None)
    
    # Try stripping leading zeros for numeric symbols (e.g., 0700 -> 700 for HKEX)
    if not match and symbol.isdigit() and symbol.startswith("0"):
        short_sym = str(int(symbol))
        match = next((s for s in all_symbols if s["symbol"] == short_sym), None)
        if match:
            symbol = short_sym # Update symbol to the matched one (e.g., 700)
    
    if match:
        exch = match.get("exchange")
        suffix = EXCHANGE_SUFFIX_MAP.get(exch)
        if suffix:
            return f"{symbol}{suffix}"
            
    return symbol

# =============== FINNHUB PROXY ENDPOINTS ===============

async def _get_fallback_query(symbol: str) -> str:
    """
    Get a better query string for Google News fallback (e.g. 'Company Name symbol' instead of just 'symbol').
    """
    try:
        all_symbols = await get_symbols()
        match = next((s for s in all_symbols if s["symbol"] == symbol), None)
        if match and match.get("name"):
            # Clean name (remove Inc, Corp, etc to keep it short?)
            # Or just use full name. Google is smart.
            return f"{match['name']} {symbol}"
    except Exception:
        pass
    return symbol

async def _require_client():
    if _client is None:
        raise HTTPException(500, "HTTP client not initialized")

@app.get("/api/finnhub/quote/{symbol}")
async def get_quote(symbol: str):
    symbol = symbol.upper()
    
    # Resolve symbol with suffix for Finnhub
    finnhub_symbol = await _resolve_finnhub_symbol(symbol)
    
    # 1. Try Finnhub first
    q = {}
    success = False
    
    if FINNHUB_TOKEN:
        await _require_client()
        try:
            r = await _client.get(f"{FINNHUB_BASE_URL}/quote", params={"symbol": finnhub_symbol, "token": FINNHUB_TOKEN})
            if r.status_code == 200:
                q = r.json() or {}
                # Finnhub often returns c=0 for invalid symbols
                if q.get("c") != 0:
                     success = True
        except Exception as e:
            print(f"Finnhub quote exception for {symbol} ({finnhub_symbol}): {e}")

    # 2. Fallback to internal list (TradingView data) if Finnhub failed
    if not success:
        print(f"Finnhub failed/empty for {symbol}, trying internal list fallback")
        try:
            # We call get_symbols but we might need to await it properly if it's cached or not.
            # get_symbols uses a cache key.
            # To avoid circular dependency or complex logic, let's just check the cache directly first
            # or call the function.
            all_symbols = await get_symbols()
            match = next((s for s in all_symbols if s["symbol"] == symbol), None)
            
            # Try stripping suffix (e.g. PTT.BK -> PTT)
            if not match and "." in symbol:
                 short_sym = symbol.split(".")[0]
                 match = next((s for s in all_symbols if s["symbol"] == short_sym), None)

            # Try stripping leading zeros
            if not match and symbol.isdigit() and symbol.startswith("0"):
                match = next((s for s in all_symbols if s["symbol"] == str(int(symbol))), None)
            
            if match:
                print(f"Found fallback data for {symbol}")
                return {
                    "symbol": symbol,
                    "price": match.get("price", 0),
                    "change": match.get("change", 0),
                    "change_pct": match.get("change_pct", 0),
                    "high": match.get("price", 0), # Approximate
                    "low": match.get("price", 0),  # Approximate
                    "open": match.get("price", 0), # Approximate
                    "prev_close": match.get("price", 0), # Approximate
                    "logo_url": match.get("logo"),
                    "source": "fallback"
                }
        except Exception as e:
            print(f"Fallback quote error: {e}")

    # If still no success, return what we have (even if zeros) or raise error if it was a hard failure?
    # If Finnhub returned 0s and we have no fallback, returning 0s is better than 500 Error
    # because 500 Error causes the whole page to crash with "Invalid Symbol".
    # Returning 0s allows the page to render (maybe with $0.00) but News might still load.
    
    if not success and not q:
        # If we didn't get a response from Finnhub AND no fallback
        # raise HTTPException(404, "Symbol not found")
        # BUT, to be safe for user experience, let's return a dummy object with 0s
        # so at least the News part (which is fetched separately) has a chance to show up?
        # Actually, if quote fails, News.jsx throws error.
        # So return dummy 0s is safer.
        return {
            "symbol": symbol,
            "price": 0,
            "change": 0,
            "change_pct": 0,
            "high": 0,
            "low": 0,
            "open": 0,
            "prev_close": 0,
            "logo_url": None
        }

    logo_url = await fetch_logo(symbol)

    return {
        "symbol": symbol,
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
    language: str | None = Query(None),
    country: str | None = Query(None, description="Two-letter country code (e.g., us, gb)"),
):
    # Cache check
    key = f"company_news_v8|{symbol.upper()}|{hours}|{limit}|{country}|{language or ''}"
    cached = _cache_get(key)
    if cached:
        return cached

    if not FINNHUB_TOKEN:
        fallback_query = await _get_fallback_query(symbol.upper())
        items = await fetch_news(fallback_query, limit, language=language, hours=hours, country=country)
        return {
            "symbol": symbol.upper(),
            "total": len(items),
            "news": items,
        }

    await _require_client()
    
    finnhub_symbol = await _resolve_finnhub_symbol(symbol.upper())

    # Finnhub company-news requires date range (YYYY-MM-DD)
    now_utc = datetime.now(timezone.utc)
    since = now_utc - timedelta(hours=hours)
    params = {
        "symbol": finnhub_symbol,
        "from": since.date().isoformat(),
        "to": now_utc.date().isoformat(),
        "token": FINNHUB_TOKEN,
    }
    
    try:
        r = await _client.get(f"{FINNHUB_BASE_URL}/company-news", params=params)
        if r.status_code != 200:
            print(f"Finnhub company-news error for {symbol}: {r.status_code} {r.text[:200]}")
            # Fallback to Google News/NewsAPI
            fallback_query = await _get_fallback_query(symbol.upper())
            items = await fetch_news(fallback_query, limit, language=language, hours=hours, country=country)
            return {
                "symbol": symbol.upper(),
                "total": len(items),
                "news": items,
            }
            
        items = r.json() or []
    except Exception as e:
        print(f"Finnhub company-news exception for {symbol}: {e}")
        # Fallback to Google News/NewsAPI
        fallback_query = await _get_fallback_query(symbol.upper())
        items = await fetch_news(fallback_query, limit, language=language, hours=hours, country=country)
        return {
            "symbol": symbol.upper(),
            "total": len(items),
            "news": items,
        }

    # Normalize structure similar to NewsAPI
    normalized = []
    for a in items:
        item = {
            "title": a.get("headline"),
            "summary": a.get("summary"),
            "published_at": a.get("datetime"),
            "source": a.get("source"),
            "url": a.get("url"),
            "image_url": a.get("image"),
            "is_trusted": _is_trusted_source(a.get("source")),
        }
        item["url"] = _normalize_url(item["url"])
        item["source"] = _normalize_source(item["source"], item["url"])
        if item["url"] and _is_valid_source(item):
            normalized.append(item)
            # Collect more for mixing
            if len(normalized) >= limit * 2:
                break
    
    # Check diversity: If we have too few non-Yahoo items, supplement with Google News
    non_yahoo_count = sum(1 for item in normalized if "yahoo" not in (item.get("source") or "").lower())
    
    # Check freshness: If the latest item is older than 6 hours, force supplement
    is_stale = False
    if normalized:
        try:
            # Finnhub returns unix timestamp in 'datetime' field (which we mapped to 'published_at')
            # But wait, in the loop above: "published_at": a.get("datetime")
            # Finnhub 'datetime' is int (unix timestamp).
            latest_ts = normalized[0].get("published_at")
            if isinstance(latest_ts, int):
                if _now() - latest_ts > 6 * 3600: # 6 hours
                    is_stale = True
        except Exception:
            pass
    else:
        is_stale = True # No items = stale

    if non_yahoo_count < 3 or is_stale:
        # print(f"Low diversity or stale for {symbol}. Supplementing with Google News.")
        try:
            # Use name + symbol for better precision in Google News if possible
            # Append "stock" to ensure financial context and avoid irrelevant news (e.g. medical/virus news for SAP)
            fallback_query = await _get_fallback_query(symbol.upper())
            exclusions = _get_exclusion_string()
            query_others = f"{fallback_query} stock -site:yahoo.com -site:finance.yahoo.com {exclusions}"
            google_items = await _fetch_google_rss_items(query_others, limit, "en", hours, country)
            normalized.extend(google_items)
        except Exception as e:
            print(f"Error supplementing news: {e}")

    # Mix sources
    final_items = _mix_news_sources(normalized, limit)
    
    result = {
        "symbol": symbol.upper(),
        "total": len(final_items),
        "news": final_items,
    }
    
    _cache_set(key, result, ttl=NEWS_TTL_SECONDS)
    return result


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
        
        finnhub_symbol = await _resolve_finnhub_symbol(symbol_upper)

        r_quote = await _client.get(
            f"{FINNHUB_BASE_URL}/quote",
            params={"symbol": finnhub_symbol, "token": FINNHUB_TOKEN},
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
            "symbol": finnhub_symbol,
            "from": since.date().isoformat(),
            "to": now_utc.date().isoformat(),
            "token": FINNHUB_TOKEN,
        }
        r_news = await _client.get(f"{FINNHUB_BASE_URL}/company-news", params=params)
        if r_news.status_code != 200:
            raise HTTPException(r_news.status_code, f"Finnhub news error: {r_news.text[:200]}")
        items = r_news.json() or []
        for a in items:
            item = {
                "title": a.get("headline"),
                "summary": a.get("summary"),
                "published_at": a.get("datetime"),
                "source": a.get("source"),
                "url": a.get("url"),
                "image_url": a.get("image"),
            }
            item["url"] = _normalize_url(item["url"])
            item["source"] = _normalize_source(item["source"], item["url"])
            if item["url"] and _is_valid_source(item):
                news_items.append(item)
                # Collect more to allow mixing
                if len(news_items) >= limit * 2:
                    break
        
        # Check diversity and supplement if needed
        non_yahoo_count = sum(1 for item in news_items if "yahoo" not in (item.get("source") or "").lower())
        if non_yahoo_count < 3:
            print(f"Low diversity for {symbol} in Overview. Supplementing.")
            try:
                # Use finnhub_symbol for better precision
                exclusions = _get_exclusion_string()
                query_others = f"{finnhub_symbol} stock -site:yahoo.com -site:finance.yahoo.com {exclusions}"
                google_items = await _fetch_google_rss_items(query_others, limit, "en", hours, country)
                news_items.extend(google_items)
            except Exception as e:
                print(f"Error supplementing overview news: {e}")

        # Mix sources
        news_items = _mix_news_sources(news_items, limit)
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

async def _fetch_dr_symbols(client):
    dr_symbols = []
    try:
        r = await client.get(DR_LIST_URL, timeout=2)
        if r.status_code == 200:
            data = r.json()
            rows = data.get("rows", [])
            for row in rows:
                underlying = row.get("underlying")
                if underlying:
                    underlying = underlying.strip().upper()
                    dr_symbols.append({
                        "symbol": underlying,
                        "name": row.get("underlyingName") or row.get("name") or "",
                        "dr_symbol": row.get("symbol"),
                        "logo": row.get("logo") or row.get("logoUrl") or row.get("image")
                    })
    except Exception as e:
        print(f"Error fetching DR symbols: {e}")
    return dr_symbols


@app.get("/api/symbols")
async def get_symbols():
    """
    Fetches the list of available DR symbols and merged with TradingView stocks.
    """
    key = "dr_tv_symbols_list_v6"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    client_to_use = _client
    local_client = False
    if client_to_use is None:
        client_to_use = httpx.AsyncClient()
        local_client = True
    
    try:
        # 1. Fetch DR Symbols (keep existing logic)
        dr_symbols = []
        try:
            r = await client_to_use.get("http://172.17.1.85:8333/dr", timeout=2)
            if r.status_code == 200:
                data = r.json()
                rows = data.get("rows", [])
                for row in rows:
                    underlying = row.get("underlying")
                    if underlying:
                        underlying = underlying.strip().upper()
                        dr_symbols.append({
                            "symbol": underlying,
                            "name": row.get("underlyingName") or row.get("name") or "",
                            "dr_symbol": row.get("symbol"),
                            "logo": row.get("logo") or row.get("logoUrl") or row.get("image"),
                            "country": "TH", # DRs are traded in Thailand
                            "type": "dr"
                        })
        except Exception as e:
            print(f"Error fetching DR symbols: {e}")
            # Don't fail completely, just use fallback or empty

        # 2. Fetch TradingView Stocks (All Supported Regions)
        regions_config = [
            {"region": "america", "country": "US", "limit": 2000},
            {"region": "thailand", "country": "TH", "limit": 2000},
            {"region": "china", "country": "CN", "limit": 500},
            {"region": "hongkong", "country": "HK", "limit": 500},
            {"region": "japan", "country": "JP", "limit": 500},
            {"region": "korea", "country": "KR", "limit": 500},
            {"region": "vietnam", "country": "VN", "limit": 500},
            {"region": "singapore", "country": "SG", "limit": 500},
            {"region": "taiwan", "country": "TW", "limit": 500},
            {"region": "india", "country": "IN", "limit": 500},
            {"region": "australia", "country": "AU", "limit": 500},
            {"region": "uk", "country": "GB", "limit": 500},
            {"region": "germany", "country": "DE", "limit": 500},
            {"region": "france", "country": "FR", "limit": 500}
        ]
        
        tasks = []
        for rc in regions_config:
            tasks.append(_fetch_tradingview_stocks(client_to_use, region=rc["region"], country_code=rc["country"], limit=rc.get("limit", 500)))
            
        tv_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        tv_symbols = []
        for res in tv_results:
            if isinstance(res, list):
                tv_symbols.extend(res)
            else:
                print(f"Error fetching region: {res}")
        
        # 3. Merge Lists
        # Use a dict to dedup by symbol, preferring DR info if available (or TV info if better?)
        # Let's prefer TV info for logo/name as it might be more standard, 
        # but keep DR specific fields if any.
        merged = {}
        
        # Add fallback symbols first
        for s in FALLBACK_SYMBOLS:
            merged[s["symbol"]] = s.copy()

        # Add DR symbols
        for s in dr_symbols:
            if s["symbol"] not in merged:
                merged[s["symbol"]] = s
            else:
                # Merge?
                pass
        
        # Add TV symbols (will overwrite if exists, which might be good for better names/logos)
        for s in tv_symbols:
            # If exists, update logo/name but also merge volume/market_cap info if available
            if s["symbol"] in merged:
                existing = merged[s["symbol"]]
                if not existing.get("logo") and s.get("logo"):
                    existing["logo"] = s["logo"]
                if not existing.get("name") and s.get("name"):
                    existing["name"] = s["name"]
                
                # Merge financial info
                existing["market_cap"] = s.get("market_cap", 0)
                existing["volume"] = s.get("volume", 0)
                existing["price"] = s.get("price", 0)
                existing["change_pct"] = s.get("change_pct", 0)
                existing["change"] = s.get("change", 0)
                existing["exchange"] = s.get("exchange")
                existing["country"] = s.get("country")
                if s.get("type"):
                    existing["type"] = s.get("type")
            else:
                merged[s["symbol"]] = s
        
        result = list(merged.values())
        # Sort by:
        # 1. Stocks first (type != "dr") - False < True, so type != "dr" is False? No.
        # We want Stock first. 
        # is_dr = (type == "dr")
        # sort key: (is_dr, -market_cap) -> False (0) comes before True (1)
        result.sort(key=lambda x: (x.get("type") == "dr", -x.get("market_cap", 0)))
        
        _cache_set(key, result, ttl=3600)
        return result
        
    finally:
        if local_client:
            await client_to_use.aclose()

async def _fetch_tradingview_stocks(client, region="america", country_code="US", limit=500):
    try:
        url = f"https://scanner.tradingview.com/{region}/scan"
        min_volume = 50000 # Default threshold
        exchange_filter = []

        if region == "america":
            min_volume = 500000 # Higher threshold for US
            exchange_filter = ["AMEX", "NASDAQ", "NYSE"]
        elif region == "thailand":
            exchange_filter = ["SET", "mai"]

        # Filter logic to reduce noise (remove derivatives, low volume, etc.)
        # We restrict subtypes to common/etf/reit to avoid warrants/structured products that rarely have news.
        subtypes = ["common", "preference", "etf", "reit"]
        
        filters = [
            {"left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"]},
            # {"left": "exchange", "operation": "in_range", "right": exchange_filter},
            {"left": "average_volume_10d_calc", "operation": "greater", "right": min_volume}
        ]
        
        if exchange_filter:
            filters.append({"left": "exchange", "operation": "in_range", "right": exchange_filter})
        
        # For US, be stricter with subtypes. For Thailand, we need to allow empty subtypes for DRs.
        # For others, apply subtypes to avoid junk.
        if region != "thailand":
             filters.append({"left": "subtype", "operation": "in_range", "right": subtypes})

        payload = {
            "filter": filters,
            "options": {"lang": "en"},
            "symbols": {"query": {"types": []}, "tickers": []},
            "columns": ["logoid", "name", "close", "change", "change_abs", "Recommend.All", "volume", "market_cap_basic", "exchange", "type"],
            "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"},
            "range": [0, limit] 
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": "https://www.tradingview.com",
            "Referer": "https://www.tradingview.com/",
            "Content-Type": "application/json"
        }

        r = await client.post(url, json=payload, headers=headers, timeout=10)
        if r.status_code != 200:
            print(f"TV Scanner error: {r.status_code} {r.text[:100]}")
            return []
            
        data = r.json()
        total = data.get("totalCount", 0)
        rows = data.get("data", [])
        
        # Determine country code based on region (Now passed as argument)
        # country_code = "US"
        # if region == "thailand":
        #    country_code = "TH"
        # Add more mappings if needed
        
        results = []
        for row in rows:
            # "d": ["apple-big", "Apple Inc", 234.5, ...]
            # columns: ["logoid", "name", ...]
            d = row.get("d", [])
            if not d or len(d) < 2:
                continue
                
            symbol = row.get("s", "").split(":")[-1] # NASDAQ:AAPL -> AAPL
            logoid = d[0]
            name = d[1]
            
            # --- Additional Filtering Heuristics ---
            # 1. Thai Specific Filters
            if region == "thailand":
                # Exclude Foreign board / NVDR / Warrants often denoted by dots (e.g., PTT.F, PTT.R)
                # But allow numbers (2S, 7UP)
                if "." in symbol:
                    continue
                # Removed "name == symbol" check because many valid Thai stocks have name=symbol in TV data
                # if name.strip().upper() == symbol.strip().upper():
                #    continue

            # 2. General Filters
            # Exclude if name is empty
            if not name:
                continue
            # ---------------------------------------

            # Extract additional data (close, change, change_abs, volume, market_cap)
            # columns: ["logoid", "name", "close", "change", "change_abs", "Recommend.All", "volume", "market_cap_basic", "exchange", "type"]
            # indices:     0        1        2        3          4              5             6           7                  8            9
            close = d[2] if len(d) > 2 else 0
            change_pct = d[3] if len(d) > 3 else 0
            change_abs = d[4] if len(d) > 4 else 0
            volume = d[6] if len(d) > 6 else 0
            market_cap = d[7] if len(d) > 7 and d[7] is not None else 0
            exchange = d[8] if len(d) > 8 else None
            asset_type = d[9] if len(d) > 9 else None

            logo_url = None
            if logoid:
                # TV logo logic
                base_tv_logo = "https://s3-symbol-logo.tradingview.com/"
                logo_url = f"{base_tv_logo}{logoid}.svg"
            
            results.append({
                "symbol": symbol,
                "name": name,
                "logo": logo_url,
                "price": close,
                "change_pct": change_pct,
                "change": change_abs,
                "volume": volume,
                "market_cap": market_cap,
                "exchange": exchange,
                "country": country_code,
                "type": asset_type
            })
            
        return results
    except Exception as e:
        print(f"Error fetching TV stocks: {e}")
        return []

# Removed old _fetch_and_cache_symbols as it's integrated above



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8003)
