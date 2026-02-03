import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

// Read API base from Vite environment variables. Support multiple names
// (some projects use VITE_NEWS_API, others VITE_NEWS_API_URL or VITE_API_BASE)
const API_BASE = import.meta.env.VITE_NEWS_API || import.meta.env.VITE_NEWS_API_URL || import.meta.env.VITE_API_BASE || 'http://localhost:8003';
const TH_QUERY = "ตลาดหุ้น OR หุ้น OR ดัชนี";
const EN_QUERY = "stock market";
const CN_QUERY = "股市";
const JP_QUERY = "株式市場";
const DEFAULT_SYMBOLS_MAP = {
  "All": ["NVDA", "AAPL", "0700", "600519", "7203", "PTT", "SAP", "MC"],
  "US": ["NVDA", "TSLA", "GOOG", "AAPL", "MSFT", "AMZN", "META", "BABA"],
  "TH": ["PTT", "DELTA", "AOT", "KBANK", "SCB", "ADVANC", "CPALL", "BDMS"],
  "CN": ["600519", "601318", "600036", "601857"],
  "HK": ["0700", "9988", "1299", "0941", "0005"],
  "JP": ["7203", "6758", "9984", "8306", "7974"],
  "KR": ["005930", "000660", "035420", "005380"],
  "VN": ["VIC", "VHM", "VCB", "FPT", "VNM"],
  "SG": ["D05", "O39", "U11", "Z74"],
  "TW": ["2330", "2317", "2454", "2308"],
  "IN": ["RELIANCE", "TCS", "HDFCBANK", "INFY"],
  "AU": ["BHP", "CBA", "CSL", "NAB"],
  "GB": ["HSBA", "AZN", "SHE", "BP"],
  "DE": ["SAP", "SIE", "ALV", "DTE"],
  "FR": ["MC", "OR", "TTE", "SAN"]
};

// Common English words/abbreviations to ignore when scanning for tickers in text
const BLACKLIST_TICKERS = new Set([
  "A", "I", "T", "S", "Y", "OR", "IT", "US", "UK", "EU", "BE", "ON", "IN", "AT", "TO", "BY", "OF", "UP", "GO", "DO", "AN", "AS", "IF", "MY", "WE", "HE", "NO", "SO", "ME",
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "ANY", "CAN", "HAD", "HAS", "HER", "HIM", "HIS", "HOW", "MAN", "NEW", "NOW", "OLD", "ONE", "OUR", "OUT", "PUT", "SAY", "SHE", "TOO", "USE", "WAY", "WHO", "WHY", "YES", "YET",
  "CEO", "CFO", "CTO", "IPO", "ETF", "GDP", "CPI", "FED", "USA", "USD", "THB", "CNY", "JPY", "EUR", "GBP"
]);

const COUNTRY_OPTIONS = [
  { code: "All", label: "Global", flag: "🌍" },
  { code: "US", label: "United States", flag: "🇺🇸" },
  { code: "TH", label: "Thailand", flag: "🇹🇭" },
  { code: "CN", label: "China", flag: "🇨🇳" },
  { code: "HK", label: "Hong Kong", flag: "🇭🇰" },
  { code: "JP", label: "Japan", flag: "🇯🇵" },
  { code: "KR", label: "South Korea", flag: "🇰🇷" },
  { code: "VN", label: "Vietnam", flag: "🇻🇳" },
  { code: "SG", label: "Singapore", flag: "🇸🇬" },
  { code: "TW", label: "Taiwan", flag: "🇹🇼" },
  { code: "IN", label: "India", flag: "🇮🇳" },
  { code: "AU", label: "Australia", flag: "🇦🇺" },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { code: "DE", label: "Germany", flag: "🇩🇪" },
  { code: "FR", label: "France", flag: "🇫🇷" },
];
const CACHE_KEY_HOME = "caldr_news_home_v6";
const CACHE_KEY_SEARCH_PREFIX = "caldr_news_search_v2_";
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes (Increased from 15 to reduce fetching)

// Helper for LocalStorage Caching
const getCache = (key, ignoreTTL = false) => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (ignoreTTL) return parsed.data;
    if (Date.now() - parsed.timestamp < CACHE_TTL) {
      return parsed.data;
    }
    return null;
  } catch (e) {
    return null;
  }
};

const setCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  } catch (e) {
    console.error("Cache save failed", e);
  }
};

function timeAgo(ts) {
  try {
    let d;
    if (typeof ts === "number") {
      d = new Date(ts * 1000); // finnhub epoch seconds
    } else {
      d = new Date(ts);
    }
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleString();
  } catch {
    return "";
  }
}

// Simple keyword-based sentiment analysis
const analyzeSentiment = (text) => {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  // Expanded keywords for better accuracy
  const positive = [
    "surge", "jump", "record", "gain", "profit", "bull", "high", "growth", "boost", "beat", "rally", "soar", "up", "buy", "positive", "strong", "outperform", "upgrade", "lead", "leading", "success", "top", "best", "rebound", "climb", "recover",
    "expansion", "expand", "funding", "invest", "strategic", "launch", "new", "partner", "deal", "agreement", "contract", "win", "won", "approve", "approval", "settled", "solution", "stable", "innovation", "dividend"
  ];
  const negative = [
    "drop", "fall", "plunge", "loss", "crash", "bear", "low", "cut", "miss", "risk", "down", "sell", "negative", "fail", "decline", "weak", "underperform", "downgrade", "warn", "warning", "fear", "panic", "worst", "slide", "tumble", "slump", "retreat", "mixed", "volatile", "uncertain",
    "scrapped", "shut", "close", "halt", "suspend", "ban", "lawsuit", "sue", "probe", "investigation", "breach", "hack", "attack", "debt", "bankrupt", "layoff", "fire", "terminate", "delay", "struggle",
    "punish", "penalty", "fine", "slow", "slower", "pressure", "concern", "problem", "trouble", "hard", "tough", "hurt", "damage", "hit", "weigh", "impact"
  ];
  
  const posCount = positive.filter(w => lower.includes(w)).length;
  const negCount = negative.filter(w => lower.includes(w)).length;
  
  if (posCount > negCount) return "positive";
  if (negCount > posCount) return "negative";
  return "neutral";
};

const NewsCard = ({ ticker, quote, news, formatPrice }) => {
  const isPositive = quote && quote.change_pct >= 0;
  const textSentiment = analyzeSentiment(news.title + " " + news.summary);

  // Logic to resolve conflict between Price and Text Sentiment
  let sentiment = textSentiment;
  if (quote) {
    // If Stock is Green but Text says Negative -> Override to Neutral (or Positive if weak negative)
    // This prevents the "Green Price / Red Border" confusion
    if (isPositive && textSentiment === "negative") {
      sentiment = "neutral"; 
    }
    // If Stock is Red but Text says Positive -> Override to Neutral
    if (!isPositive && textSentiment === "positive") {
      sentiment = "neutral";
    }
  }

  // Define classes based on sentiment
  const containerClasses = "bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow flex flex-col md:flex-row gap-6 items-start";

  return (
    <a href={news.url} target="_blank" rel="noreferrer" className="block group">
      <div className={containerClasses}>
        {ticker && quote && (
          <div className="flex-shrink-0 w-full md:w-[120px] bg-[#F9FAFB] rounded-lg border border-gray-100 p-3 flex flex-col items-center justify-center text-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center overflow-hidden">
              {quote.logo_url ? (
                <img src={quote.logo_url} alt={ticker} className="w-full h-full object-contain" />
              ) : (
                <span className="text-sm font-bold text-gray-900">{ticker[0]}</span>
              )}
            </div>
            <div>
                <div className="text-sm font-bold text-gray-900">{ticker}</div>
                {quote.price !== undefined && quote.price !== 0 && formatPrice && (
                    <div className="text-xs font-semibold text-gray-700">
                        {formatPrice(quote.price, ticker)}
                    </div>
                )}
            </div>
            <div className={`text-xs font-bold ${isPositive ? 'text-[#137333]' : 'text-[#C5221F]'}`}>
              {isPositive ? '+' : ''}{quote.change_pct?.toFixed(2)}%
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
            {news.title}
          </h3>
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {news.summary}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {news.source && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-medium">
                {news.source}
                {news.is_trusted && (
                  <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </span>
            )}
            {news.source && <span>•</span>}
            <span>{timeAgo(news.published_at)}</span>
          </div>
        </div>
      </div>
    </a>
  );
};

const News = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("symbol") || "";

  const [search, setSearch] = useState(selected);
  const [country, setCountry] = useState("All");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const countryDropdownRef = React.useRef(null);
  // const [selected, setSelected] = useState(""); 
  const [allSymbols, setAllSymbols] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Data for "Home" view
  const [marketNews, setMarketNews] = useState([]);
  const [defaultUpdates, setDefaultUpdates] = useState([]);
  const [loadingHome, setLoadingHome] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  // Data for "Search" view
  const [symbolNews, setSymbolNews] = useState([]);
  const [quote, setQuote] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [errorSearch, setErrorSearch] = useState("");

  // Sync search input with URL selected symbol
  useEffect(() => {
    setSearch(selected);
  }, [selected]);

  // Fetch available symbols for suggestions
  useEffect(() => {
    async function loadSymbols() {
      try {
        const res = await axios.get(`${API_BASE}/api/symbols`);
        if (res.data && Array.isArray(res.data)) {
          setAllSymbols(res.data);
        }
      } catch (e) {
        console.error("Failed to load symbols", e);
      }
    }
    loadSymbols();
  }, []);

  // Fetch Market News (Top Stories)
  useEffect(() => {
    let mounted = true;
    async function loadMarket() {
      // 1. Try Cache First (Stale-While-Revalidate)
      const currentCacheKey = `${CACHE_KEY_HOME}_${country}`;
      const cached = getCache(currentCacheKey, true); // Get stale data if available
      
      // If we have cached data, show it IMMEDIATELY before starting the fetch
      if (cached) {
        // Optimistic UI Update
        if (cached.marketNews) setMarketNews(cached.marketNews);
        if (cached.defaultUpdates) setDefaultUpdates(cached.defaultUpdates);
        
        // If cache is fresh (within TTL) AND not an auto-refresh, stop here to save bandwidth/latency
        const isFresh = getCache(currentCacheKey); 
        if (isFresh && refreshKey === 0) {
            setLoadingHome(false);
            return;
        }
        
        // If stale or auto-refresh, we continue to fetch in background but UI is already populated
        // We set loadingHome to false so user doesn't see spinner while revalidating
        setLoadingHome(false);
      } else {
        // Only show spinner if we have absolutely nothing
        setLoadingHome(true);
        // Clear previous view to avoid confusion (or keep it? better to clear if switching countries completely)
        setMarketNews([]); 
        setDefaultUpdates([]);
      }

      try {
        // Parallel Fetching: General News + Company Updates
        const fetchGeneralNews = async () => {
            if (country === "All") {
                // Fetch Major Markets: US/World, Thai, China, Japan
                const [enRes, thRes, cnRes, jpRes] = await Promise.all([
                  axios.get(`${API_BASE}/api/news/${encodeURIComponent(EN_QUERY)}`, { params: { limit: 15, language: "en", hours: 72 } }),
                  axios.get(`${API_BASE}/api/news/${encodeURIComponent(TH_QUERY)}`, { params: { limit: 15, language: "th", hours: 72 } }),
                  axios.get(`${API_BASE}/api/news/${encodeURIComponent(CN_QUERY)}`, { params: { limit: 10, language: "zh", hours: 72 } }),
                  axios.get(`${API_BASE}/api/news/${encodeURIComponent(JP_QUERY)}`, { params: { limit: 10, language: "ja", hours: 72 } })
                ]);
                return [
                    ...(enRes.data?.news || []), 
                    ...(thRes.data?.news || []),
                    ...(cnRes.data?.news || []),
                    ...(jpRes.data?.news || [])
                ];
            } else if (country === "TH") {
                const res = await axios.get(`${API_BASE}/api/news/${encodeURIComponent(TH_QUERY)}`, { 
                    params: { limit: 40, language: "th", hours: 72, country: "th" } 
                });
                return res.data?.news || [];
            } else {
                const res = await axios.get(`${API_BASE}/api/news/${encodeURIComponent(EN_QUERY)}`, { 
                    params: { limit: 40, language: "en", hours: 72, country: country.toLowerCase() } 
                });
                return res.data?.news || [];
            }
        };

        const targetSymbols = (country && DEFAULT_SYMBOLS_MAP[country]) 
            ? DEFAULT_SYMBOLS_MAP[country] 
            : DEFAULT_SYMBOLS_MAP["All"];

        const fetchUpdates = async () => {
            const updatesPromises = targetSymbols.map(async (sym) => {
              try {
                const [qRes, nRes] = await Promise.all([
                  axios.get(`${API_BASE}/api/finnhub/quote/${sym}`),
                  axios.get(`${API_BASE}/api/finnhub/company-news/${sym}`, { 
                    params: { 
                        hours: 72, 
                        limit: 2,
                        country: country !== "All" ? country : undefined,
                        language: "en"
                    } 
                  })
                ]);
    
                const articles = nRes.data?.news || [];
                return articles.slice(0, 2).map(art => ({
                  ticker: sym,
                  quote: qRes.data,
                  news: art
                }));
              } catch (e) {
                console.error(`Failed to load default data for ${sym}`, e);
                return [];
              }
            });
            return (await Promise.all(updatesPromises)).flat();
        };

        // Execute fetches incrementally to show UI faster
        const generalNewsPromise = fetchGeneralNews();
        const updatesPromise = fetchUpdates();

        // 1. Wait for General News first (Fastest & Most Important)
        try {
            const merged = await generalNewsPromise;
            
            if (mounted) {
                merged.sort((a, b) => {
                  const da = a.published_at ? new Date(a.published_at) : new Date(0);
                  const db = b.published_at ? new Date(b.published_at) : new Date(0);
                  return db - da;
                });
                
                const generalNewsWrapped = merged.map(item => ({ news: item }));
                
                // Immediate Render: Show General News while waiting for updates
                // Only if we don't have cached data displayed, or if we want to refresh it
                setMarketNews(generalNewsWrapped);
                setLoadingHome(false); // Stop loading spinner immediately
            }

            // 2. Wait for Company Updates (Slower)
            const updates = await updatesPromise;
            
            if (!mounted) return;

            const toMs = (v) => typeof v === "number" ? v * 1000 : (new Date(v).getTime() || 0);
            updates.sort((a, b) => toMs(b.news.published_at) - toMs(a.news.published_at));

            // Merge general news and company updates
            const combinedNews = [
              ...merged.map(item => ({ news: item })),
              ...updates
            ];

            combinedNews.sort((a, b) => toMs(b.news.published_at) - toMs(a.news.published_at));

            if (mounted) {
              // Prevent re-render if data is identical to cache (Deep check logic)
              let hasChanged = true;
              if (cached && cached.marketNews && cached.marketNews.length === combinedNews.length) {
                   const getTitlesHash = (list) => list.map(i => i.news.id || i.news.title).join('|');
                   const newHash = getTitlesHash(combinedNews);
                   const oldHash = getTitlesHash(cached.marketNews);
                   const updatesChanged = updates.length !== cached.defaultUpdates?.length;
                   
                   if (newHash === oldHash && !updatesChanged) {
                       hasChanged = false;
                   }
              }

              if (hasChanged) {
                setDefaultUpdates(updates);
                setMarketNews(combinedNews);
                
                // Save to Cache
                setCache(currentCacheKey, {
                  marketNews: combinedNews,
                  defaultUpdates: updates
                });
                console.log("News updated from fetch (full)");
              } else {
                console.log("News identical to cache, skipping update");
              }
            }
        } catch (err) {
            console.error("Error in incremental fetch:", err);
            throw err; // Re-throw to be caught by outer catch
        }

      } catch (e) {
        console.error("Failed to load market news", e);
      } finally {
        if (mounted) setLoadingHome(false);
      }
    }

    if (!selected) {
      loadMarket();
    }

    return () => { mounted = false; };
  }, [selected, country, refreshKey]);

  // Fetch Search Data
  useEffect(() => {
    if (!selected) return;

    let mounted = true;
    async function loadSymbol() {
      // 1. Try Cache First (Stale-While-Revalidate)
      const cacheKey = `${CACHE_KEY_SEARCH_PREFIX}${selected}`;
      const cached = getCache(cacheKey, true); // Get stale data
      if (cached) {
        setQuote(cached.quote);
        setSymbolNews(cached.symbolNews);
        setErrorSearch("");
        
        // If fresh, stop
        if (getCache(cacheKey)) {
            setLoadingSearch(false);
            return;
        }
        // If stale, keep fetching in background
      } else {
        setLoadingSearch(true);
      }
      
      setErrorSearch("");

      // Determine query symbol (append .BK for Thai stocks)
      let querySymbol = selected;
      const match = allSymbols.find(s => s.symbol === selected);
      if (match && (match.exchange === 'SET' || match.exchange === 'mai')) {
        querySymbol = selected + ".BK";
      }

      try {
        const [qRes, nRes] = await Promise.all([
          axios.get(`${API_BASE}/api/finnhub/quote/${encodeURIComponent(querySymbol)}`),
          axios.get(`${API_BASE}/api/finnhub/company-news/${encodeURIComponent(querySymbol)}`, { params: { hours: 168, limit: 30 } }),
        ]);
        if (!mounted) return;
        
        const newQuote = qRes.data || null;
        const newNews = nRes.data?.news || [];

        setQuote(newQuote);
        setSymbolNews(newNews);

        // Save to Cache
        setCache(cacheKey, {
          quote: newQuote,
          symbolNews: newNews
        });

      } catch (e) {
        console.error("Search error:", e);
        if (!mounted) return;
        
        // Only show error if we don't have cached data displayed
        if (!cached) {
            setErrorSearch("ไม่สามารถดึงข้อมูลได้ หรือ Symbol ไม่ถูกต้อง");
            setQuote(null);
            setSymbolNews([]);
        }
      } finally {
        if (mounted) setLoadingSearch(false);
      }
    }
    loadSymbol();
    return () => { mounted = false; };
  }, [selected, allSymbols]); // Added allSymbols dependency for safe match check

  const topStory = useMemo(() => {
    // Prioritize General Market News (no ticker) for Top Story
    let story = marketNews.find(item => !item.ticker);
    
    // Fallback to first available item
    if (!story) story = marketNews[0];
    
    if (!story) return null;

    // Clone to enrich
    let enriched = { ...story };

    // Attempt to enrich story with ticker/logo from title if missing
    if (!enriched.ticker && enriched.news && enriched.news.title) {
        // Use original text for case-sensitive check
        const text = (enriched.news.title + " " + (enriched.news.summary || ""));
        const textUpper = text.toUpperCase();
        
        // 1. Look for ticker pattern like "(SNPS)" - Highest Confidence
        // Support Alphanumeric (e.g. 700, 601398, COM7)
        const match = enriched.news.title.match(/\(([A-Z0-9]{1,8})\)/);
        let ticker = match ? match[1] : null;

        // 2. Ticker Scan (Strict)
        if (!ticker && allSymbols.length > 0) {
            // Tokenize: allow alphanumeric but exclude pure numbers (to avoid years/amounts)
            // unless they are long enough (e.g. 5+ digits for CN/KR/JP)
            const tokens = text.split(/[^A-Za-z0-9]+/);
            const symbolSet = new Set(allSymbols.map(s => s.symbol));
            
            ticker = tokens.find(t => {
                if (!symbolSet.has(t)) return false;
                if (BLACKLIST_TICKERS.has(t)) return false;
                
                // Heuristics for Safety:
                // 1. Purely Numeric (e.g. "700", "2024")
                if (/^[0-9]+$/.test(t)) {
                    // Only allow if length >= 5 (Safe for CN/KR/JP 5-6 digits like 601398, 005930)
                    if (t.length >= 5) return true;
                    // Reject 1-4 digit numbers (Too risky: "2024", "100", "1", "700")
                    // Unless we are absolutely sure, but for loose scan it's safer to skip.
                    return false;
                }
                
                // 2. Alphanumeric (Mixed) or Alpha
                // Check length constraints (e.g. 2-8 chars)
                if (t.length < 2 || t.length > 8) return false;
                
                return true;
            });
        }

        // 3. Name Match (Fuzzy) - Fallback if no ticker found
        // This is expensive, so only do it for Top Story
        if (!ticker && allSymbols.length > 0) {
            // Optimization: Filter symbols to likely candidates? No, just iterate.
            // We want to find the Longest Name that appears in the text to avoid partial matches
            // e.g. "General" matching "General Motors" (Bad) vs "General Motors" (Good)
            // So we sort symbols by name length descending? Too slow to sort all.
            // Instead, just iterate and keep best match.
            
            // Pre-process blacklist words for names
            const IGNORE_NAMES = new Set(["THE", "INC", "CORP", "LTD", "GROUP", "HOLDINGS", "PLC", "NV", "SA", "AG", "COMPANY", "LIMITED"]);
            
            let bestMatch = null;
            let maxLen = 0;

            for (const sym of allSymbols) {
                if (!sym.name) continue;
                
                // Clean name: "Apple Inc." -> "Apple"
                // But be careful: "Amazon.com" -> "Amazon"
                // "Advanced Micro Devices" -> "Advanced Micro Devices"
                
                // Simple heuristic: Use the first 2 words if length > 1, else 1 word.
                // Or just use the full name and check if it exists in text.
                // Many TV names are like "Apple Inc."
                
                let cleanName = sym.name
                    .replace(/,?\s*(Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|PLC|PCL|Group|Holdings|Company|Co\.?)\b/gi, "")
                    .replace(/[^a-zA-Z0-9\s]/g, "") // Remove dots/commas
                    .trim();

                if (cleanName.length < 4) continue; // Skip short names to avoid false positives
                if (IGNORE_NAMES.has(cleanName.toUpperCase())) continue;

                // Check if cleanName appears in text (Case Insensitive)
                // Use regex with word boundaries
                try {
                    const regex = new RegExp(`\\b${cleanName}\\b`, "i");
                    if (regex.test(text)) {
                         if (cleanName.length > maxLen) {
                             maxLen = cleanName.length;
                             bestMatch = sym.symbol;
                         }
                    }
                } catch (e) {
                    // Regex error for weird names
                }
            }
            
            if (bestMatch) {
                ticker = bestMatch;
            }
        }

        if (ticker) {
            // Check if we have this symbol in our database
            const symbolData = allSymbols.find(s => s.symbol === ticker);
            if (symbolData) {
                return {
                    ...enriched,
                    ticker: ticker,
                    quote: {
                        logo_url: symbolData.logo,
                        change_pct: 0 // Dummy value
                    }
                };
            }
        }
    }
    
    return enriched;
  }, [marketNews, allSymbols]);

  const [topStoryQuote, setTopStoryQuote] = useState(null);

  // Fetch real quote for Top Story if it has a ticker but no real quote
  useEffect(() => {
    setTopStoryQuote(null); // Reset when story changes
    if (topStory?.ticker) {
        // Use backend resolution or direct
        // If it's a Thai stock, append .BK? Backend handles it via _resolve_finnhub_symbol? 
        // But /api/finnhub/quote/{symbol} calls backend get_quote which calls _resolve_finnhub_symbol.
        // So sending "PTT" is fine.
        
        axios.get(`${API_BASE}/api/finnhub/quote/${encodeURIComponent(topStory.ticker)}`)
             .then(res => {
                 if (res.data && res.data.price !== 0) {
                     setTopStoryQuote(res.data);
                 }
             })
             .catch(err => console.error("Failed to fetch top story quote", err));
    }
  }, [topStory?.ticker]); // Only refetch if ticker changes

  // Merge real quote into topStory
  const finalTopStory = useMemo(() => {
      if (!topStory) return null;
      if (topStoryQuote && topStory.ticker === topStoryQuote.symbol) {
          return { ...topStory, quote: topStoryQuote };
      }
      return topStory;
  }, [topStory, topStoryQuote]);

  const topStorySentiment = useMemo(() => {
    if (!finalTopStory) return "neutral";
    const textSentiment = analyzeSentiment(finalTopStory.news.title + " " + finalTopStory.news.summary);
    
    // Conflict Resolution for Top Story
    if (finalTopStory.quote) {
      const isPositive = finalTopStory.quote.change_pct >= 0;
      if (isPositive && textSentiment === "negative") return "neutral";
      if (!isPositive && textSentiment === "positive") return "neutral";
    }
    
    return textSentiment;
  }, [finalTopStory]);


  const onSearchKey = (e) => {
    if (e.key === "Enter") {
      if (suggestions.length > 0) {
        selectSuggestion(suggestions[0]);
        return;
      }

      const raw = search.trim();
      if (!raw) {
        setSearchParams({});
        setErrorSearch("");
        return;
      }
      const isValid = /^[A-Za-z0-9]+$/.test(raw);
      if (!isValid) {
        setSearchParams({});
        setErrorSearch("กรุณากรอกรหัส Underlying หรือ Ticker เป็นตัวอักษร/ตัวเลขเท่านั้น");
        return;
      }
      setErrorSearch("");
      setSearchParams({ symbol: raw.toUpperCase() });
      setShowSuggestions(false);
    }
  };

  const updateSuggestions = (value) => {
    let filtered = allSymbols;
    
    // Filter by Country if not "All"
    if (country !== "All") {
      filtered = filtered.filter(s => s.country === country);
    }
    
    if (value.length > 0) {
      filtered = filtered.filter(s => s.symbol.startsWith(value));
    }
    
    setSuggestions(filtered.slice(0, 100));
    setShowSuggestions(true);
    
    // Cancel any pending blur to keep it open
    if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
    }
  };

  const handleSearchChange = (e) => {
    const newSearch = e.target.value.toUpperCase();
    setSearch(newSearch);
    updateSuggestions(newSearch);
  };

  const inputRef = React.useRef(null);
  const blurTimeoutRef = React.useRef(null);

  // Handle country switch for smoother transition
  const handleCountryChange = (code) => {
    // 1. Close dropdown immediately
    setShowCountryDropdown(false);
    
    // 2. Check Cache synchronously to avoid "stale data" flash
    const cacheKey = `${CACHE_KEY_HOME}_${code}`;
    const cached = getCache(cacheKey, true); // Get stale data if available

    if (cached) {
        // If cache exists, update state IMMEDIATELY -> Instant transition
        setMarketNews(cached.marketNews);
        setDefaultUpdates(cached.defaultUpdates);
        setLoadingHome(false);
    } else {
        // If no cache, set loading IMMEDIATELY -> Avoid showing previous country's news
        setMarketNews([]); // Clear old data
        setDefaultUpdates([]);
        setLoadingHome(true);
    }

    // 3. Update country state (this triggers useEffect for background fetch/validation)
    setCountry(code);
  };

  // Update suggestions when country changes
  // Removed auto-focus and auto-show behavior as per user request
  // Suggestions will be updated when user focuses the input or types


  // Click outside to close country dropdown
  useEffect(() => {
      const handleClickOutside = (event) => {
          if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target)) {
              setShowCountryDropdown(false);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close suggestions when clicking outside
  const handleSearchBlur = () => {
    // Clear any existing timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
    // Delay hiding to allow item click to register
    blurTimeoutRef.current = setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  };
  
  // Clear blur timeout if we interact with search
  const handleSearchFocus = () => {
    if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
    }
    updateSuggestions(search);
  };

  const selectSuggestion = (s) => {
    setSearch(s.symbol);
    setSearchParams({ symbol: s.symbol });
    setShowSuggestions(false);
    setErrorSearch("");
  };

  const clearSearch = () => {
    setSearch("");
    setSearchParams({});
    setSuggestions(allSymbols.slice(0, 100)); // Reset to default suggestions
    setShowSuggestions(true); // Keep open or close? Usually close if cleared via X, but maybe user wants to search again.
    // Let's close it if they click X, or maybe keep it open if they want to pick another?
    // User said "Search" button clears it. 
    // If I click clear, I probably want to reset.
    // Let's keep it closed for now unless they focus again.
    setShowSuggestions(false);
  };

  let suggestionsContent = null;
  if (showSuggestions && suggestions.length > 0) {
    suggestionsContent = (
      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl mt-1 shadow-lg z-50 max-h-60 overflow-y-auto">
        {search.trim() === "" && (
            <div className="px-4 py-2 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                RECOMMENDED
            </div>
        )}
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex justify-between items-center border-b border-gray-50 last:border-0"
            onClick={() => selectSuggestion(s)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {s.logo ? (
                  <img
                    src={s.logo}
                    alt={s.symbol}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'block';
                    }}
                  />
                ) : null}
                <span
                  className="text-xs font-bold text-gray-500"
                  style={{ display: s.logo ? 'none' : 'block' }}
                >
                  {s.symbol[0]}
                </span>
              </div>
              <span className="font-bold text-[#0B102A]">{s.symbol}</span>
              {s.exchange && (
                <span className="text-xs font-medium text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50">
                  {s.exchange}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500 truncate max-w-[150px]">{s.name}</span>
          </div>
        ))}
      </div>
    );
  }

  const getCurrency = (symbol) => {
    if (!symbol) return "$";
    // Strip suffix if present (e.g. PTT.BK -> PTT)
    const rawSymbol = symbol.includes('.') ? symbol.split('.')[0] : symbol;

    // 1. Check if we have match in allSymbols to get Country
    if (!allSymbols.length) return "$";
    const match = allSymbols.find(s => s.symbol === rawSymbol);
    if (!match) return "$"; // Default

    const c = match.country ? match.country.toUpperCase() : "US";
    switch (c) {
        case "TH": return "฿";
        case "CN": return "¥";
        case "HK": return "HK$";
        case "JP": return "¥";
        case "KR": return "₩";
        case "GB": return "£";
        case "DE": case "FR": case "EU": return "€";
        case "IN": return "₹";
        case "VN": return "₫";
        case "SG": return "S$";
        case "TW": return "NT$";
        case "AU": return "A$";
        default: return "$";
    }
  };

  const formatPrice = (price, symbol) => {
      if (typeof price !== 'number') return "0.00";
      
      const currency = getCurrency(symbol);
      
      // Special formatting for high-value currencies (KRW, VND, JPY) - usually no decimals
      if (["₩", "₫", "¥"].includes(currency)) {
          return `${currency}${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      }
      
      return `${currency}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F5F5] flex justify-center">
      <div className="w-full max-w-[1248px] px-4 md:px-8 flex flex-col h-full py-10">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-6 mb-4 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-[#0B102A]">News</h1>
            <p className="text-[#6B6B6B] text-xs sm:text-sm">Latest market updates, earnings reports, and insights for Underlying Assets</p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            {/* Country Select (Custom Dropdown with Flags) */}
            <div className="relative w-full md:w-56" ref={countryDropdownRef}>
              <button
                onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                className="w-full bg-white border border-gray-200 text-[#0B102A] py-2.5 pl-3 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B102A] text-sm font-medium flex items-center gap-3 shadow-sm hover:border-gray-300 transition-colors"
              >
                 {country === "All" ? (
                    <div className="w-6 h-4 flex items-center justify-center text-lg leading-none">🌍</div>
                 ) : (
                    <img 
                        src={`https://flagcdn.com/w40/${country.toLowerCase()}.png`} 
                        alt={country} 
                        className="w-6 h-auto object-cover rounded-[2px] shadow-sm border border-gray-100" 
                    />
                 )}
                 <span className="truncate">
                    {COUNTRY_OPTIONS.find(o => o.code === country)?.label || "Global"}
                 </span>
                 <div className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 pointer-events-none">
                    <i className="bi bi-chevron-down text-xs"></i>
                 </div>
              </button>

              {showCountryDropdown && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl mt-1 shadow-xl z-[60] max-h-[300px] overflow-y-auto custom-scrollbar">
                    {COUNTRY_OPTIONS.map((opt) => (
                        <div
                            key={opt.code}
                            onClick={() => handleCountryChange(opt.code)}
                            className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 text-sm transition-colors ${country === opt.code ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-[#0B102A]'}`}
                        >
                            {opt.code === "All" ? (
                                <div className="w-6 h-4 flex items-center justify-center text-lg leading-none">🌍</div>
                            ) : (
                                <img 
                                    src={`https://flagcdn.com/w40/${opt.code.toLowerCase()}.png`} 
                                    alt={opt.code} 
                                    className="w-6 h-auto object-cover rounded-[2px] shadow-sm border border-gray-100" 
                                />
                            )}
                            <span className="font-medium">{opt.code === "All" ? "Global" : opt.label}</span>
                            {country === opt.code && (
                                <i className="bi bi-check-lg ml-auto text-blue-600"></i>
                            )}
                        </div>
                    ))}
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-[300px]">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={handleSearchChange}
              onKeyDown={onSearchKey}
              onFocus={handleSearchFocus}
              onBlur={handleSearchBlur}
              placeholder="Search"
              className="w-full bg-white pl-4 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B102A] text-sm shadow-sm"
            />
            {selected ? (
              <button onClick={clearSearch} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <i className="bi bi-x-lg"></i>
              </button>
            ) : (
              <i className="bi bi-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            )}

            {/* Suggestions Dropdown */}
            {suggestionsContent}

          </div>
        </div>
      </div>

        {/* Main Content */}
        <div className="flex-1 pb-10">

          {selected ? (
            /* Search Result View */
            <div className="space-y-6">
              {loadingSearch ? (
                <div className="animate-pulse h-32 bg-gray-200 rounded-xl" />
              ) : errorSearch ? (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl">{errorSearch}</div>
              ) : (
                <>
                  {/* Symbol Banner */}
                  {quote && (
                    <div className="bg-[#0B102A] rounded-2xl p-6 text-white flex items-center justify-between shadow-lg relative overflow-hidden">
                      <div className="relative z-10 flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-xl font-bold overflow-hidden">
                          {quote.logo_url ? (
                            <img src={quote.logo_url} alt={selected} className="w-full h-full object-contain" />
                          ) : (
                            <span>{selected[0]}</span>
                          )}
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{selected}</div>
                        </div>
                      </div>
                      <div className="relative z-10 text-right">
                        <div className="text-3xl font-bold">{formatPrice(quote.price, selected)}</div>
                        <div className={`text-sm font-medium ${quote.change_pct >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                          {quote.change_pct >= 0 ? '+' : ''}{quote.change_pct?.toFixed(2)}%
                        </div>
                      </div>
                      {/* Decoration */}
                      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                    </div>
                  )}

                  {/* News List */}
                  <div>
                    <h2 className="text-lg font-bold text-[#0B102A] mb-4">Latest News for {selected}</h2>
                    <div className="flex flex-col gap-4">
                      {symbolNews.length > 0 ? (
                        symbolNews.map((news, idx) => (
                          <NewsCard key={idx} news={news} />
                        ))
                      ) : (
                        <div className="text-gray-500 text-center py-10">No news available</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Home View */
            <div className="space-y-8">
              {/* Top Stories Banner */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-[#0B102A]">Top Stories</h2>
                {loadingHome ? (
                  <div className="animate-pulse h-48 bg-gray-200 rounded-2xl" />
                ) : topStory ? (
                  <a href={topStory.news.url} target="_blank" rel="noreferrer" className="block group">
                    <div className="bg-[#0B102A] rounded-2xl px-5 sm:px-7 md:px-8 py-4 sm:py-5 md:py-6 text-white relative overflow-hidden shadow-lg">
                      <div className="relative z-10 max-w-3xl pr-20 sm:pr-28 md:pr-36">
                        {topStory.ticker && topStory.quote ? (
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                              {topStory.quote.logo_url ? (
                                <img src={topStory.quote.logo_url} alt={topStory.ticker} className="w-full h-full object-contain" />
                              ) : (
                                <span className="text-sm font-bold text-white">{topStory.ticker[0]}</span>
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-blue-200">{topStory.ticker}</div>
                              {topStory.quote.price !== undefined && topStory.quote.price !== 0 && (
                                <div className={`text-xs font-medium ${topStory.quote.change_pct >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                                  {formatPrice(topStory.quote.price, topStory.ticker)} 
                                  <span className="ml-1">
                                    {topStory.quote.change_pct >= 0 ? '+' : ''}{topStory.quote.change_pct?.toFixed(2)}%
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                        <h3 className="text-lg md:text-xl font-semibold leading-snug mb-2 group-hover:text-blue-200 transition-colors">
                          {topStory.news.title}
                        </h3>
                        {topStory.news.summary && (
                          <p className="text-sm text-blue-100/80 mb-3 line-clamp-2">
                            {topStory.news.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-blue-200/80">
                          {topStory.news.source && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded bg-white/10 text-blue-100 font-medium border border-white/10">
                              {topStory.news.source}
                            </span>
                          )}
                          {topStory.news.source && <span>•</span>}
                          <span>{timeAgo(topStory.news.published_at)}</span>
                        </div>
                      </div>
                      <div className="absolute right-4 sm:right-6 md:right-8 top-1/2 transform -translate-y-1/2 w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] md:w-[120px] md:h-[120px]">
                        {/* Layer 0: Default Fallback (Source Initial) */}
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-800 to-blue-900 rounded-lg shadow-md border border-white/10">
                          <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-white/90">
                            {topStory.news.source ? topStory.news.source[0].toUpperCase() : "N"}
                          </span>
                        </div>

                        {/* Layer 1: Quote Logo (if available) */}
                        {topStory.quote && topStory.quote.logo_url && (
                          <div className="absolute inset-0 bg-white rounded-lg p-2 shadow-sm flex items-center justify-center">
                             <img 
                                src={topStory.quote.logo_url} 
                                className="w-full h-full object-contain" 
                                alt="logo"
                                onError={(e) => e.target.parentElement.style.display='none'} 
                             />
                          </div>
                        )}

                        {/* Layer 2: News Image (if available) */}
                        {topStory.news.image_url && (
                          <img 
                            src={topStory.news.image_url} 
                            alt="background"
                            className="absolute inset-0 w-full h-full object-cover rounded-lg shadow-md border border-white/10 bg-white"
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        )}
                      </div>
                    </div>
                  </a>
                ) : (
                  <div className="text-gray-500">No top stories available</div>
                )}
              </div>

              {/* Latest Updates */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-[#0B102A]">Latest Updates</h2>
                <div className="flex flex-col gap-4">
                  {loadingHome ? (
                    Array.from({ length: 3 }).map((_, i) => <div key={i} className="animate-pulse h-24 bg-gray-100 rounded-xl" />)
                  ) : defaultUpdates && defaultUpdates.length > 0 ? (
                    defaultUpdates
                        .filter(item => !topStory || item.news.url !== topStory.news.url) // Prevent duplication
                        .map((item, idx) => (
                      <NewsCard
                        key={idx}
                        ticker={item.ticker}
                        quote={item.quote}
                        news={item.news}
                        formatPrice={formatPrice}
                      />
                    ))
                  ) : (
                    <div className="text-gray-500">No updates available</div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default News;