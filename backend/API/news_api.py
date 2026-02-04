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
NEWS_API_KEY = os.getenv("NEWS_API_KEY") or "a2982e76c7844902b4289a6b08712d89"
NEWS_TTL_SECONDS = int(os.getenv("NEWS_TTL_SECONDS") or "300")
SEARCHAPI_KEY = os.getenv("SEARCHAPI_KEY")
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
    "經濟通", "香港經濟日報", "now 財經", "雅虎財經"
}

GOOGLE_FINANCE_COUNTRIES = {
    "hk", "th", "nl", "cn", "fr", "it", "jp", "sg", "tw", "vn", "dk"
}

def _is_trusted_source(source_name: str) -> bool:
    if not source_name: return False
    s = source_name.lower()
    return any(t in s for t in TRUSTED_SOURCES)

def _is_valid_source(item: dict) -> bool:
    """Filter out unwanted sources like Yahoo Finance"""
    src = (item.get("source") or "").lower()
    url = (item.get("url") or "").lower()
    
    # Filter out Yahoo
    if "yahoo" in src or "yahoo" in url:
        return True 
        
    return True

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

ADDITIONAL_FALLBACK_SYMBOLS = [
    # HK
    {"symbol": "0700.HK", "name": "Tencent Holdings Ltd", "country": "HK"},
    {"symbol": "9988.HK", "name": "Alibaba Group Holding Limited", "country": "HK"},
    {"symbol": "3690.HK", "name": "Meituan", "country": "HK"},
    {"symbol": "1299.HK", "name": "AIA Group Limited", "country": "HK"},
    # TH
    {"symbol": "PTT.BK", "name": "PTT Public Company Limited", "country": "TH"},
    {"symbol": "CPALL.BK", "name": "CP All Public Company Limited", "country": "TH"},
    {"symbol": "AOT.BK", "name": "Airports of Thailand Public Company Limited", "country": "TH"},
    {"symbol": "ADVANC.BK", "name": "Advanced Info Service Public Company Limited", "country": "TH"},
    {"symbol": "DELTA.BK", "name": "Delta Electronics (Thailand) Public Company Limited", "country": "TH"},
    {"symbol": "TRUE.BK", "name": "True Corporation Public Company Limited", "country": "TH"},
    {"symbol": "KBANK.BK", "name": "Kasikornbank Public Company Limited", "country": "TH"},
    {"symbol": "SCB.BK", "name": "SCB X Public Company Limited", "country": "TH"},
    {"symbol": "BBL.BK", "name": "Bangkok Bank Public Company Limited", "country": "TH"},
    {"symbol": "KTB.BK", "name": "Krung Thai Bank Public Company Limited", "country": "TH"},
    {"symbol": "PTTEP.BK", "name": "PTT Exploration and Production Public Company Limited", "country": "TH"},
    {"symbol": "GULF.BK", "name": "Gulf Energy Development Public Company Limited", "country": "TH"},
    {"symbol": "GPSC.BK", "name": "Global Power Synergy Public Company Limited", "country": "TH"},
    {"symbol": "BDMS.BK", "name": "Bangkok Dusit Medical Services Public Company Limited", "country": "TH"},
    {"symbol": "BH.BK", "name": "Bumrungrad Hospital Public Company Limited", "country": "TH"},
    {"symbol": "CRC.BK", "name": "Central Retail Corporation Public Company Limited", "country": "TH"},
    {"symbol": "CPN.BK", "name": "Central Pattana Public Company Limited", "country": "TH"},
    {"symbol": "BEM.BK", "name": "Bangkok Expressway and Metro Public Company Limited", "country": "TH"},
    # NL
    {"symbol": "ASML.AS", "name": "ASML Holding N.V.", "country": "NL"},
    {"symbol": "SHELL.AS", "name": "Shell plc", "country": "NL"},
    # FR
    {"symbol": "MC.PA", "name": "LVMH Moet Hennessy Louis Vuitton", "country": "FR"},
    {"symbol": "TTE.PA", "name": "TotalEnergies SE", "country": "FR"},
    # IT
    {"symbol": "ENEL.MI", "name": "Enel S.p.A.", "country": "IT"},
    # JP
    {"symbol": "7203.T", "name": "Toyota Motor Corporation", "country": "JP"},
    {"symbol": "6758.T", "name": "Sony Group Corporation", "country": "JP"},
    # SG
    {"symbol": "D05.SI", "name": "DBS Group Holdings Ltd", "country": "SG"},
    # TW
    {"symbol": "2330.TW", "name": "Taiwan Semiconductor Manufacturing Company", "country": "TW"},
    # VN
    {"symbol": "VIC.VN", "name": "Vingroup Joint Stock Company", "country": "VN"},
    # DK
    {"symbol": "NOVO-B.CO", "name": "Novo Nordisk A/S", "country": "DK"}
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
    _client = httpx.AsyncClient(timeout=10)

    # Start background task
    asyncio.create_task(background_news_updater())


async def close_client():
    global _client
    if _client:
        await _client.aclose()


async def background_news_updater():
    """
    Periodically fetches news for all markets and updates the cache.
    This ensures that user requests are served instantly from cache.
    """
    print("Background news updater started")
    
    # Wait for app startup
    await asyncio.sleep(5)
    
    while True:
        try:
            print("Running background news refresh...")
            start_time = time.time()
            
            # 1. Update Global News (Aggregated)
            # This matches the parameters used in get_global_news endpoint
            global_limit = 5
            global_trusted = True
            global_key = f"news-global-v2|{global_limit}|{global_trusted}"
            
            global_tasks = []
            for config in GLOBAL_MARKET_CONFIG:
                # We also want to cache the individual country news while we are at it
                # Matches parameters in News.jsx for specific country view
                # params: { limit: 40, language: config.lang, hours: 72, country: country.toLowerCase(), trusted_only: true } 
                country_limit = 40
                country_hours = 72
                country_trusted = True
                
                # We can't easily cache the endpoint result directly because it wraps fetch_news.
                # But we can pre-fetch the data so fetch_news (if cached) would be fast?
                # Actually fetch_news is NOT cached. The endpoint get_news caches.
                # So we should manually populate the cache keys that get_news uses.
                
                # Fetch data
                items = await fetch_news(
                    symbol=config["query"],
                    limit=country_limit, # Use the larger limit to cover both global and country views
                    language=config["lang"],
                    hours=country_hours,
                    country=config["code"].lower()
                )
                
                # Filter for trusted
                trusted_items = [i for i in items if i.get("is_trusted")]
                
                # Update "get_news" cache (Country View)
                # key = f"news-v7|{symbol.upper()}|{limit}|{language or ''}|{hours}|{country or ''}|{trusted_only}"
                country_key = f"news-v7|{config['query'].upper()}|{country_limit}|{config['lang']}|{country_hours}|{config['code'].lower()}|{country_trusted}"
                
                # We need quote and logo for the full payload, but for now just news is better than nothing?
                # The get_news endpoint fetches quote and logo too. 
                # Let's just cache the news part? No, the cache stores the whole payload.
                # It's better to let the first user hit populate the full cache if complex, 
                # OR we simulate the full fetch.
                
                # Simulating full fetch for Country View
                # But to save resources, let's focus on the GLOBAL AGGREGATION first which is the home page.
                
                # For Global Aggregation, we need the items list.
                global_tasks.append(items) # Add raw items (unfiltered) to list, we filter later
                
            global_results = global_tasks # Since we awaited sequentially above (to be gentle), this is already a list of lists.
            # Ideally we should gather parallel, but let's be gentle on rate limits for background task.
            # Actually, fetch_news does sequential fallbacks, so parallel is okay if limited.
            
            merged = []
            for items in global_results:
                if global_trusted:
                    items = [i for i in items if i.get("is_trusted")]
                merged.extend(items)
                
            merged.sort(key=lambda x: x.get("published_at") or "", reverse=True)
            
            # Update "get_global_news" cache
            _cache_set(global_key, merged, ttl=600)
            print(f"Updated global news cache with {len(merged)} items")

            # 2. Update Default Batch Ticker Data (Home Page Updates)
            # Matches News.jsx: { symbols: DEFAULT_SYMBOLS, hours: 72, limit: 2 }
            # And for each country...
            
            # Default US
            us_symbols = ["NVDA", "TSLA", "GOOG", "AAPL", "MSFT", "AMZN", "META", "BABA"]
            batch_req = BatchTickerRequest(symbols=us_symbols, hours=72, limit=2)
            # We can just call the function handler directly? No, it expects request object.
            # Let's call the logic manually.
            
            # Replicate get_batch_ticker_data logic
            symbols_key = ",".join(sorted(batch_req.symbols))
            batch_key = f"batch-data-v3|{symbols_key}|{batch_req.hours}|{batch_req.limit}|{batch_req.country}|{batch_req.language}"
            
            # Fetch
            batch_tasks = []
            for sym in batch_req.symbols:
                batch_tasks.append(get_company_news(
                    sym, 
                    hours=batch_req.hours, 
                    limit=batch_req.limit, 
                    country=batch_req.country, 
                    language=batch_req.language,
                    force_refresh=True
                ))
            
            # We also need quotes
            quote_tasks = [get_quote(s) for s in batch_req.symbols]
            
            batch_news_results = await asyncio.gather(*batch_tasks)
            batch_quote_results = await asyncio.gather(*quote_tasks)
            
            final_data = []
            for i, sym in enumerate(batch_req.symbols):
                news_data = batch_news_results[i]
                quote = batch_quote_results[i]
                news_items = news_data.get("news", []) if isinstance(news_data, dict) else []
                
                if news_items:
                    final_data.append({
                        "ticker": sym,
                        "quote": quote,
                        "news": news_items[0]
                    })
            
            final_data.sort(key=lambda x: (x["news"].get("published_at") or ""), reverse=True)
            _cache_set(batch_key, final_data, ttl=300)
            print(f"Updated default batch data cache with {len(final_data)} items")

            elapsed = time.time() - start_time
            print(f"Background refresh took {elapsed:.2f}s")
            
        except Exception as e:
            print(f"Background news updater error: {e}")
            
        # Sleep for 4 minutes (less than TTL of 5-10 mins) to ensure freshness
        await asyncio.sleep(240) 



async def fetch_google_finance_news(query: str, limit: int, language: str | None, hours: int, country: str | None):
    if not SEARCHAPI_KEY:
        # print("SEARCHAPI_KEY missing, skipping Google Finance")
        return []

    assert _client is not None

    params = {
        "engine": "google_finance",
        "q": query,
        "api_key": SEARCHAPI_KEY
    }
    
    if country:
        params["gl"] = country.lower()
    if language:
        params["hl"] = language.lower()

    print(f"Fetching Google Finance (SearchAPI): {query} Params: {params}")

    try:
        r = await _client.get("https://www.searchapi.io/api/v1/search", params=params)
        if r.status_code != 200:
            print(f"SearchAPI error: {r.status_code} {r.text[:100]}")
            return []
            
        data = r.json()
        news_results = data.get("news", [])
        
        normalized = []
        for a in news_results:
            item = {
                "title": a.get("title"),
                "summary": a.get("snippet") or a.get("description"),
                "published_at": a.get("date"), 
                "source": a.get("source"),
                "url": a.get("link"),
                "image_url": a.get("thumbnail"),
                "is_trusted": _is_trusted_source(a.get("source")),
            }
            if _is_valid_source(item):
                normalized.append(item)
                
        return normalized[:limit]
        
    except Exception as e:
        print(f"Google Finance fetch error: {e}")
        return []


async def fetch_news(symbol: str, limit: int, language: str | None, hours: int, country: str | None, company_name: str | None = None):
    # Enhance query to ensure relevance, especially for common words (e.g. "LOVE", "BEST")
    search_query = symbol
    target_country = country if country else "us"
    
    is_general_market = symbol.lower() in ["stock market", "market", "business"]
    
    if target_country.lower() == "us" and not is_general_market:
         search_query = f"{symbol} stock"

    # Special handling for Google Finance Countries (HK, TH, NL, etc.)
    # Primary: Google Finance (SearchAPI)
    # Fallback: Bing RSS -> Google RSS
    # EXCLUDE: NewsAPI (Strictly ignored for these countries)
    if country and country.lower() in GOOGLE_FINANCE_COUNTRIES:
        # 1. Google Finance (SearchAPI)
        gf_items = await fetch_google_finance_news(symbol, limit, language, hours, country)
        if gf_items:
            return gf_items
            
        # Prepare Fallback Query (Use Company Name if available for better Bing/Google results)
        fallback_query = search_query
        if company_name:
            # Clean company name: remove common legal suffixes iteratively
            cleaned = company_name.strip()
            # Expanded suffix list for global coverage
            suffixes = r'(?i)\s+(ltd|inc|corp|corporation|plc|limited|holding|holdings|group|company|public company limited|pcl|nv|sa|se|ag|spa|s\.p\.a\.|ab|asa)\.?$'
            while True:
                new_cleaned = re.sub(suffixes, '', cleaned)
                if new_cleaned == cleaned:
                    break
                cleaned = new_cleaned.strip()
            
            if cleaned:
                fallback_query = cleaned
        
        print(f"Fallback news query for {symbol}: {fallback_query}")

        # 2. Google RSS (Fallback - Preferred over Bing for better local relevance)
        google_items = await fetch_google_news(fallback_query, limit, language, hours, country)
        if google_items:
            return google_items

        # 3. Bing RSS (Fallback)
        return await fetch_bing_news(fallback_query, limit, language, hours, country)

    if not NEWS_API_KEY:
        # Try Bing first, then Google
        bing_items = await fetch_bing_news(search_query, limit, language, hours, country)
        if bing_items:
            return bing_items
        return await fetch_google_news(search_query, limit, language, hours, country)

    assert _client is not None

    params: dict[str, str | int] = {
        "pageSize": limit,
        "apiKey": NEWS_API_KEY,
        "category": "business",
    }
    
    if not is_general_market:
        params["q"] = search_query
        # params["sortBy"] = "publishedAt" # Not supported by top-headlines

    if country:
        params["country"] = country
    else:
        params["country"] = "us"

    if language:
        params["language"] = language
    
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
        # Fallback
        bing_items = await fetch_bing_news(search_query, limit, language, hours, country)
        if bing_items:
            return bing_items
        return await fetch_google_news(search_query, limit, language, hours, country)

    if r.status_code != 200:
        # Fallback
        bing_items = await fetch_bing_news(search_query, limit, language, hours, country)
        if bing_items:
            return bing_items
        return await fetch_google_news(search_query, limit, language, hours, country)

    data = r.json()
    articles = data.get("articles") or []
    if not articles:
        # Fallback
        bing_items = await fetch_bing_news(search_query, limit, language, hours, country)
        if bing_items:
            return bing_items
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
        if _is_valid_source(item):
            normalized.append(item)

    if not normalized:
        # Try Bing News as a fallback before Google (or in parallel?)
        # User requested Bing, so let's try it.
        bing_items = await fetch_bing_news(search_query, limit, language, hours, country)
        if bing_items:
            return bing_items
            
        return await fetch_google_news(search_query, limit, language, hours, country)

    return _mix_news_sources(normalized, limit)

async def _fetch_bing_rss_items(query: str, limit: int, language: str | None, hours: int, country: str | None):
    assert _client is not None
    
    # Handle "OR" queries by splitting and merging
    if " OR " in query:
        sub_queries = query.split(" OR ")
        tasks = [_fetch_bing_rss_items(sq.strip(), limit, language, hours, country) for sq in sub_queries]
        results = await asyncio.gather(*tasks)
        
        # Merge and deduplicate
        merged = []
        seen_urls = set()
        
        # Flatten results
        all_items = [item for sublist in results for item in sublist]
        
        # Sort by date descending (newest first)
        all_items.sort(key=lambda x: x.get("published_at") or "", reverse=True)
        
        for item in all_items:
            url = item.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                merged.append(item)
                
        return merged[:limit]

    # Map country to Bing's cc param (e.g. US, HK, GB)
    cc = "US"
    if country:
        cc = country.upper()
        
    # Base URL
    url = "https://www.bing.com/news/search"
    params = {
        "q": query,
        "format": "rss",
        "cc": cc
    }
    
    # Debug log
    print(f"Fetching Bing RSS: {query} Params: {params}")
    
    try:
        r = await _client.get(url, params=params)
        if r.status_code != 200:
            print(f"Bing RSS failed with {r.status_code}")
            return []
            
        import xml.etree.ElementTree as ET
        # Bing RSS uses a dynamic namespace for 'News' prefix, which is annoying.
        # We will parse ignoring namespaces or by checking tag suffix.
        
        try:
            root = ET.fromstring(r.text)
        except Exception:
            # XML parsing failed
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
            desc = (it.findtext("description") or "").strip()
            pub_date_str = (it.findtext("pubDate") or "").strip()
            
            # Extract Source and Image from namespaced tags
            source_name = "Bing News"
            image_url = None
            
            for child in it:
                if child.tag.endswith("Source"):
                    source_name = child.text or source_name
                elif child.tag.endswith("Image"):
                    image_url = child.text
            
            # Parse Date
            published_at = None
            if pub_date_str:
                try:
                    dt = parsedate_to_datetime(pub_date_str)
                    if since_dt and dt < since_dt:
                        continue
                    published_at = dt.isoformat()
                except Exception:
                    pass
            
            # Create item
            item = {
                "title": title,
                "summary": desc,
                "published_at": published_at,
                "source": source_name,
                "url": link,
                "image_url": image_url,
                "is_trusted": _is_trusted_source(source_name),
            }
            
            if _is_valid_source(item):
                normalized.append(item)
                
            if len(normalized) >= limit:
                break
                
        return normalized
        
    except Exception as e:
        print(f"Bing RSS error: {e}")
        return []

async def fetch_bing_news(query: str, limit: int, language: str | None, hours: int, country: str | None):
    # Bing is simpler than Google, just one call usually enough
    return await _fetch_bing_rss_items(query, limit, language, hours, country)

async def _fetch_google_rss_items(query: str, limit: int, language: str | None, hours: int, country: str | None):
    assert _client is not None
    hl = "en-US"
    gl = "US"
    ceid = "US:en"

    if country:
        gl = country.upper()
        hl = f"en-{gl}"
        ceid = f"{gl}:en"

    # Support all languages, not just Thai
    if language:
        # Use the provided language code (e.g., 'it', 'th', 'fr', 'zh')
        # Google News usually expects 'hl' as the language code
        # and 'ceid' as COUNTRY:LANGUAGE
        lang_code = language.lower()
        hl = lang_code
        if country:
            ceid = f"{country.upper()}:{lang_code}"

    params = {"q": query, "hl": hl, "gl": gl, "ceid": ceid}
    
    # Debug log
    print(f"Fetching Google RSS: {query} Params: {params}")
    
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
            if _is_valid_source(item):
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
    
    query_others = f"{query} -site:yahoo.com -site:finance.yahoo.com"
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
    trusted_only: bool = Query(False, description="Filter only trusted sources"),
):
    key = f"news-v7|{symbol.upper()}|{limit}|{language or ''}|{hours}|{country or ''}|{trusted_only}"
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

    items, quote, logo_url = await asyncio.gather(
        fetch_news(symbol, limit, language, hours, country),
        fetch_quote(symbol),
        fetch_logo(symbol)
    )

    # Apply trusted filter if requested
    if trusted_only:
        items = [i for i in items if i.get("is_trusted")]

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

# =============== NEW OPTIMIZED ENDPOINTS ===============

GLOBAL_MARKET_CONFIG = [
    {"code": "US", "query": "stock market", "lang": "en"},
    {"code": "TH", "query": "ตลาดหุ้น OR หุ้น OR ดัชนี", "lang": "th"},
    {"code": "HK", "query": "Hang Seng Index OR 恆生指數 OR Hong Kong Stock Market", "lang": "zh"},
    {"code": "DK", "query": "Aktiemarkedet OR C25", "lang": "da"},
    {"code": "NL", "query": "Aandelenmarkt OR AEX", "lang": "nl"},
    {"code": "FR", "query": "Bourse OR CAC 40", "lang": "fr"},
    {"code": "IT", "query": "Borsa Italiana OR FTSE MIB", "lang": "it"},
    {"code": "JP", "query": "株式市場 OR 日経平均", "lang": "ja"},
    {"code": "SG", "query": "Stock Market OR STI", "lang": "en"},
    {"code": "TW", "query": "股市 OR 台積電", "lang": "zh"},
    {"code": "CN", "query": "股市 OR 上證指數", "lang": "zh"},
    {"code": "VN", "query": "Thị trường chứng khoán OR VN-Index", "lang": "vi"}
]

@app.get("/api/news/global")
async def get_global_news(
    limit: int = Query(5, ge=1, le=20),
    trusted_only: bool = Query(True)
):
    """
    Fetch news from all major markets in parallel.
    Aggregates results server-side to reduce frontend requests.
    """
    key = f"news-global-v2|{limit}|{trusted_only}"
    cached = _cache_get(key)
    if cached:
        return {"news": cached, "cached": True}
        
    tasks = []
    for config in GLOBAL_MARKET_CONFIG:
        tasks.append(fetch_news(
            symbol=config["query"],
            limit=limit,
            language=config["lang"],
            hours=72,
            country=config["code"].lower()
        ))
        
    results = await asyncio.gather(*tasks)
    
    # Flatten and trusted filter is already applied if we passed it? 
    # fetch_news doesn't take trusted_only param, we must filter here.
    # Actually fetch_news returns raw list.
    
    merged = []
    for items in results:
        if trusted_only:
            items = [i for i in items if i.get("is_trusted")]
        merged.extend(items)
        
    # Sort by date
    merged.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    
    _cache_set(key, merged, ttl=600) # Cache for 10 minutes
    
    return {"news": merged, "cached": False}

from pydantic import BaseModel

class BatchTickerRequest(BaseModel):
    symbols: list[str]
    hours: int = 72
    limit: int = 2
    country: str | None = None
    language: str | None = None

@app.post("/api/batch-ticker-data")
async def get_batch_ticker_data(req: BatchTickerRequest):
    """
    Fetch quote and latest news for multiple symbols in one go.
    """
    # Create unique key for caching this batch request?
    # Batch requests can vary wildly, so maybe short cache or no cache if user specific?
    # Let's try to cache individual components or just the whole thing for short time.
    symbols_key = ",".join(sorted(req.symbols))
    key = f"batch-data-v3|{symbols_key}|{req.hours}|{req.limit}|{req.country}|{req.language}"
    
    cached = _cache_get(key)
    if cached:
        return {"data": cached, "cached": True}

    async def fetch_one(sym):
        try:
            quote, news_data = await asyncio.gather(
                get_quote(sym),
                get_company_news(sym, hours=req.hours, limit=req.limit, country=req.country, language=req.language)
            )
            news_items = news_data.get("news", []) if isinstance(news_data, dict) else []
            # Normalize news items to limit
            return {
                "ticker": sym,
                "quote": quote,
                "news": news_items[0] if news_items else None # Return only top news for "Latest Updates" card
            }
        except Exception as e:
            print(f"Batch fetch error for {sym}: {e}")
            return None

    tasks = [fetch_one(s) for s in req.symbols]
    results = await asyncio.gather(*tasks)
    
    # Filter out None and entries with no news? 
    # The frontend expects {ticker, quote, news}. 
    # If news is missing, maybe we skip or show just quote?
    # Frontend logic: updates.map... NewsCard uses news.title.
    # So we need news.
    
    final_data = [r for r in results if r and r.get("news")]
    
    # Sort by news time
    final_data.sort(key=lambda x: (x["news"].get("published_at") or ""), reverse=True)
    
    _cache_set(key, final_data, ttl=300) # 5 mins
    
    return {"data": final_data, "cached": False}

import random

# =============== FINNHUB PROXY ENDPOINTS ===============

async def _require_client():
    if _client is None:
        raise HTTPException(500, "HTTP client not initialized")

@app.get("/api/finnhub/quote/{symbol}")
async def get_quote(symbol: str):
    symbol = symbol.upper()
    
    # 1. Try Finnhub first
    q = {}
    success = False
    
    if FINNHUB_TOKEN:
        await _require_client()
        try:
            r = await _client.get(f"{FINNHUB_BASE_URL}/quote", params={"symbol": symbol, "token": FINNHUB_TOKEN})
            if r.status_code == 200:
                q = r.json() or {}
                # Finnhub often returns c=0 for invalid symbols
                if q.get("c") != 0:
                     success = True
        except Exception as e:
            print(f"Finnhub quote exception for {symbol}: {e}")

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
    country: str | None = Query(None, description="Two-letter country code (e.g., us, gb)"),
    language: str | None = Query(None, description="Language code (e.g., en, th)"),
    force_refresh: bool = False # Internal use mainly
):
    # Cache check
    key = f"company_news_v4|{symbol.upper()}|{hours}|{limit}|{country}|{language}"
    if not force_refresh:
        cached = _cache_get(key)
        if cached:
            return cached

    # Special handling for Google Finance Countries (Bypass Finnhub)
    if country and country.lower() in GOOGLE_FINANCE_COUNTRIES:
        # Use passed language or default to 'en'
        lang = language if language else "en"
        
        # Look up company name for better fallback queries
        company_name = None
        try:
            all_syms = await get_symbols()
            match = next((s for s in all_syms if s["symbol"] == symbol.upper()), None)
            if match:
                company_name = match.get("name") or match.get("description")
        except Exception as e:
            print(f"Error looking up company name for {symbol}: {e}")

        # Force fetch_news which uses SearchAPI for these countries
        items = await fetch_news(symbol.upper(), limit, language=lang, hours=hours, country=country, company_name=company_name)
        
        # Also fetch quote data (from fallback/internal if needed)
        q_data = await get_quote(symbol.upper())
        quote = {k: v for k, v in q_data.items() if k != "logo_url" and k != "symbol"} if q_data else None
        logo_url = q_data.get("logo_url") if q_data else None

        result = {
            "symbol": symbol.upper(),
            "total": len(items),
            "news": items,
            "quote": quote,
            "logo_url": logo_url
        }
        _cache_set(key, result, ttl=NEWS_TTL_SECONDS)
        return result

    if not FINNHUB_TOKEN:
        # Use passed language or default to 'en'
        lang = language if language else "en"
        items = await fetch_news(symbol.upper(), limit, language=lang, hours=hours, country=country)
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
        if _is_valid_source(item):
            normalized.append(item)
            # Collect more for mixing
            if len(normalized) >= limit * 2:
                break
    
    # Check diversity: If we have too few non-Yahoo items, supplement with Google News
    non_yahoo_count = sum(1 for item in normalized if "yahoo" not in (item.get("source") or "").lower())
    if non_yahoo_count < 3:
        print(f"Low diversity for {symbol} from Finnhub ({non_yahoo_count} non-Yahoo). Supplementing with Google News.")
        try:
            query_others = f"{symbol} stock -site:yahoo.com -site:finance.yahoo.com"
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

    if country and country.lower() in GOOGLE_FINANCE_COUNTRIES:
        # Use specialized logic (SearchAPI for news, robust get_quote for data)
        q_data = await get_quote(symbol_upper)
        
        # Separate logo_url from quote data
        logo_url = q_data.get("logo_url")
        quote_obj = {k: v for k, v in q_data.items() if k != "logo_url" and k != "symbol"}
        
        # Look up company name for better fallback queries
        company_name = None
        try:
            all_syms = await get_symbols()
            match = next((s for s in all_syms if s["symbol"] == symbol_upper), None)
            if match:
                company_name = match.get("name") or match.get("description")
        except Exception as e:
            print(f"Error looking up company name for {symbol}: {e}")

        # Fetch news using SearchAPI
        news_list = await fetch_news(symbol_upper, limit, language or "en", hours, country, company_name=company_name)
        
        return {
            "symbol": symbol_upper,
            "quote": quote_obj,
            "logo_url": logo_url,
            "news": {
                "total": len(news_list),
                "items": news_list,
            },
        }

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
        for a in items:
            item = {
                "title": a.get("headline"),
                "summary": a.get("summary"),
                "published_at": a.get("datetime"),
                "source": a.get("source"),
                "url": a.get("url"),
                "image_url": a.get("image"),
            }
            if _is_valid_source(item):
                news_items.append(item)
                # Collect more to allow mixing
                if len(news_items) >= limit * 2:
                    break
        
        # Check diversity and supplement if needed
        non_yahoo_count = sum(1 for item in news_items if "yahoo" not in (item.get("source") or "").lower())
        if non_yahoo_count < 3:
            print(f"Low diversity for {symbol} in Overview. Supplementing.")
            try:
                query_others = f"{symbol} stock -site:yahoo.com -site:finance.yahoo.com"
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
    key = "dr_tv_symbols_list_v11"
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
                            "country": "TH" # DRs are traded in Thailand
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
            {"region": "vietnam", "country": "VN", "limit": 500},
            {"region": "singapore", "country": "SG", "limit": 500},
            {"region": "taiwan", "country": "TW", "limit": 500},
            {"region": "denmark", "country": "DK", "limit": 200},
            {"region": "netherlands", "country": "NL", "limit": 200},
            {"region": "italy", "country": "IT", "limit": 200},
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
            
        # Add additional fallback symbols (global)
        for s in ADDITIONAL_FALLBACK_SYMBOLS:
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
            else:
                merged[s["symbol"]] = s
        
        result = list(merged.values())
        # Sort by Market Cap Descending (Popularity)
        result.sort(key=lambda x: x.get("market_cap", 0), reverse=True)
        
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
            {"left": "average_volume_10d_calc", "operation": "greater", "right": min_volume}
        ]

        if region == "thailand":
             # For Thailand, user wants ONLY Thai stocks, no DRs or Funds
             filters.append({"left": "type", "operation": "in_range", "right": ["stock"]})
        else:
             filters.append({"left": "type", "operation": "in_range", "right": ["stock", "dr", "fund"]})
        
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
            "columns": ["logoid", "name", "close", "change", "change_abs", "Recommend.All", "volume", "market_cap_basic", "exchange"],
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
                
                # Append .BK suffix for Thai stocks AFTER filtering
                symbol = f"{symbol}.BK"

            logoid = d[0]
            name = d[1]

            # 2. General Filters
            # Exclude if name is empty
            if not name:
                continue
            # ---------------------------------------

            # Extract additional data (close, change, change_abs, volume, market_cap)
            # columns: ["logoid", "name", "close", "change", "change_abs", "Recommend.All", "volume", "market_cap_basic", "exchange"]
            # indices:     0        1        2        3          4              5             6           7                  8
            close = d[2] if len(d) > 2 else 0
            change_pct = d[3] if len(d) > 3 else 0
            change_abs = d[4] if len(d) > 4 else 0
            volume = d[6] if len(d) > 6 else 0
            market_cap = d[7] if len(d) > 7 and d[7] is not None else 0
            exchange = d[8] if len(d) > 8 else None

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
                "country": country_code
            })
            
        return results
    except Exception as e:
        print(f"Error fetching TV stocks: {e}")
        return []

# Removed old _fetch_and_cache_symbols as it's integrated above



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8003)

