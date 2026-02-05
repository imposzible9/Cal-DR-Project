import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

// Read API base from Vite environment variables. Support multiple names
// (some projects use VITE_NEWS_API, others VITE_NEWS_API_URL or VITE_API_BASE)
const API_BASE = import.meta.env.VITE_NEWS_API || import.meta.env.VITE_NEWS_API_URL || import.meta.env.VITE_API_BASE || '';
const TH_QUERY = "ตลาดหุ้น OR ภาวะตลาดหุ้น OR หุ้นไทย";
const EN_QUERY = "US Stock Market OR S&P 500";

const COUNTRY_CONFIG = {
  "US": {
    query: "US Stock Market OR S&P 500 OR Nasdaq",
    lang: "en",
    symbols: ["NVDA", "TSLA", "GOOG", "AAPL", "MSFT", "AMZN", "META", "BABA"]
  },
  "TH": {
    query: "ตลาดหุ้น OR ภาวะตลาดหุ้น OR หุ้นไทย",
    lang: "th",
    symbols: [
      "DELTA.BK", "ADVANC.BK", "TRUE.BK",
      "KBANK.BK", "SCB.BK", "BBL.BK", "KTB.BK",
      "PTT.BK", "PTTEP.BK", "GULF.BK", "GPSC.BK",
      "BDMS.BK", "BH.BK",
      "CPALL.BK", "CRC.BK", "CPN.BK",
      "AOT.BK", "BEM.BK"
    ]
  },
  "HK": {
    query: "Hang Seng Index OR 恆生指數 OR Hong Kong Stock Market",
    lang: "zh",
    symbols: ["0700.HK", "9988.HK", "1299.HK", "0005.HK", "3690.HK", "1810.HK"]
  },
  "DK": {
    query: "Det danske aktiemarked OR C25 indeks",
    lang: "da",
    symbols: ["NOVO-B.CO", "MAERSK-B.CO", "DSV.CO", "VWS.CO", "CARL-B.CO", "DANSKE.CO"]
  },
  "NL": {
    query: "Nederlandse beurs OR AEX index",
    lang: "nl",
    symbols: ["ASML.AS", "SHELL.AS", "INGA.AS", "ADYEN.AS", "PHIA.AS", "HEIA.AS"]
  },
  "FR": {
    query: "Bourse de Paris OR CAC 40",
    lang: "fr",
    symbols: ["MC.PA", "OR.PA", "TTE.PA", "SAN.PA", "AIR.PA", "RMS.PA"]
  },
  "IT": {
    query: "Borsa Italiana OR FTSE MIB",
    lang: "it",
    symbols: ["ENI.MI", "ISP.MI", "ENEL.MI", "UCG.MI", "RACE.MI", "STLAM.MI"]
  },
  "JP": {
    query: "日本株式市場 OR 日経平均株価",
    lang: "ja",
    symbols: ["7203.T", "6758.T", "9984.T", "8035.T", "6861.T", "6098.T"]
  },
  "SG": {
    query: "Singapore Stock Market OR STI Index OR SGX OR Straits Times Index OR Singapore Exchange OR DBS Group OR UOB OR OCBC OR Singtel OR Keppel Ltd OR Wilmar International OR CapitaLand",
    lang: "en",
    symbols: ["D05.SI", "O39.SI", "U11.SI", "Z74.SI", "C52.SI", "A17U.SI"]
  },
  "TW": {
    query: "台灣股市 OR 加權指數",
    lang: "zh",
    symbols: ["2330.TW", "2317.TW", "2454.TW", "2308.TW", "2881.TW", "2303.TW"]
  },
  "CN": {
    query: "中国股市 OR A股 OR 上證指數 OR 深證成指 OR 滬深300 OR 貴州茅台 OR 騰訊控股 OR 阿里巴巴 OR 工商銀行",
    lang: "zh",
    symbols: ["600519.SS", "601398.SS", "300750.SZ", "600036.SS", "601288.SS", "000858.SZ"]
  },
  "VN": {
    query: "Thị trường chứng khoán Việt Nam OR VN-Index OR HNX-Index OR VN30 OR Vingroup OR Vietcombank OR Hoa Phat Group OR Masan Group",
    lang: "vi",
    symbols: ["VCB.VN", "VIC.VN", "VHM.VN", "HPG.VN", "VNM.VN", "MSN.VN"]
  }
};

const DEFAULT_SYMBOLS = COUNTRY_CONFIG["US"].symbols;
const COUNTRY_OPTIONS = [
  { code: "all", label: "All Markets" },
  { code: "US", label: "United States" },
  { code: "TH", label: "Thailand" },
  { code: "HK", label: "Hong Kong" },
  { code: "DK", label: "Denmark" },
  { code: "NL", label: "Netherlands" },
  { code: "FR", label: "France" },
  { code: "IT", label: "Italy" },
  { code: "JP", label: "Japan" },
  { code: "SG", label: "Singapore" },
  { code: "TW", label: "Taiwan" },
  { code: "CN", label: "China" },
  { code: "VN", label: "Vietnam" },
];

const getFlagUrl = (code) => {
  if (!code || code === 'all') return null;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
};

const CACHE_KEY_HOME = "caldr_news_home_v7";
const CACHE_KEY_SEARCH_PREFIX = "caldr_news_search_v3_";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
  } catch {
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

const NewsCard = ({ ticker, quote, news }) => {
  const isPositive = quote && quote.change_pct >= 0;

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
            <div className="text-sm font-bold text-gray-900">{ticker}</div>
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
  const [country, setCountry] = useState("all");
  const [showCountryMenu, setShowCountryMenu] = useState(false);
  const countryMenuRef = useRef(null);
  const searchContainerRef = useRef(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (countryMenuRef.current && !countryMenuRef.current.contains(event.target)) {
        setShowCountryMenu(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [countryMenuRef, searchContainerRef]);

  // const [selected, setSelected] = useState(""); 
  const [allSymbols, setAllSymbols] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Data for "Home" view
  const [marketNews, setMarketNews] = useState([]);
  const [defaultUpdates, setDefaultUpdates] = useState([]);
  const [loadingHome, setLoadingHome] = useState(false);

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
      const currentCacheKey = `${CACHE_KEY_HOME}_${country}`;

      // 1. Try Valid Cache First (Strict TTL)
      // If valid cache exists, assume no new updates and skip fetch to improve performance
      const fresh = getCache(currentCacheKey, false);
      if (fresh) {
        setMarketNews(fresh.marketNews);
        setDefaultUpdates(fresh.defaultUpdates);
        setLoadingHome(false);
        return;
      }

      // 2. Fallback to Stale Cache (Stale-While-Revalidate)
      const cached = getCache(currentCacheKey, true); // Get stale data if available
      if (cached) {
        setMarketNews(cached.marketNews);
        setDefaultUpdates(cached.defaultUpdates);
      } else {
        setLoadingHome(true);
      }

      try {
        let merged = [];
        let symbolsToFetch = DEFAULT_SYMBOLS;
        
        if (country === "all") {
            // Fetch from optimized backend endpoint
            const res = await axios.get(`${API_BASE}/api/news/global`, { 
                params: { limit: 5, trusted_only: true } 
            });
            merged = res.data?.news || [];
        } else {
            // Specific country
            const config = COUNTRY_CONFIG[country];
            if (config) {
                symbolsToFetch = config.symbols;
                const res = await axios.get(`${API_BASE}/api/news/${encodeURIComponent(config.query)}`, { 
                    params: { limit: 40, language: config.lang, hours: 72, country: country.toLowerCase(), trusted_only: true } 
                });
                if (!mounted) return;
                merged = res.data?.news || [];
            } else {
                // Fallback
                const res = await axios.get(`${API_BASE}/api/news/${encodeURIComponent(EN_QUERY)}`, { 
                    params: { limit: 40, language: "en", hours: 72, country: country.toLowerCase(), trusted_only: true } 
                });
                if (!mounted) return;
                merged = res.data?.news || [];
            }
        }

        merged.sort((a, b) => {
          const da = a.published_at ? new Date(a.published_at) : new Date(0);
          const db = b.published_at ? new Date(b.published_at) : new Date(0);
          return db - da;
        });

        // Load Default Updates (Optimized Batch Fetch)
        try {
            const batchParams = {
                symbols: symbolsToFetch,
                hours: 72,
                limit: 2
            };
            
            // Pass country context if specific country is selected
            if (country !== "all") {
                const config = COUNTRY_CONFIG[country];
                if (config) {
                    batchParams.country = country.toLowerCase();
                    batchParams.language = config.lang;
                }
            }

            const batchRes = await axios.post(`${API_BASE}/api/batch-ticker-data`, batchParams);
            
            if (mounted) {
                const updates = batchRes.data?.data || [];
                setDefaultUpdates(updates);

                const toMs = (v) => typeof v === "number" ? v * 1000 : (new Date(v).getTime() || 0);

                // Merge general news and company updates for "Top Stories"
                const combinedNews = [
                  ...merged.map(item => ({ news: item })), // Wrap general news
                  ...updates // Company news already has { news, ticker, quote }
                ];

                combinedNews.sort((a, b) => toMs(b.news.published_at) - toMs(a.news.published_at));
                
                const newCacheData = {
                  marketNews: combinedNews,
                  defaultUpdates: updates
                };

                // Check if data actually changed to avoid unnecessary re-renders
                let hasChanged = true;
                if (cached) {
                    // Simple string comparison for deep equality
                    // Note: This assumes deterministic ordering, which JSON.stringify usually provides for simple objects
                    const cachedStr = JSON.stringify({ marketNews: cached.marketNews, defaultUpdates: cached.defaultUpdates });
                    const newStr = JSON.stringify(newCacheData);
                    if (cachedStr === newStr) {
                        hasChanged = false;
                    }
                }
                
                if (hasChanged) {
                    setMarketNews(combinedNews);
                    setDefaultUpdates(updates);
                    // Save to Cache
                    setCache(currentCacheKey, newCacheData);
                }
            }
        } catch (e) {
            console.error("Failed to load batch updates", e);
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
  }, [selected, country]);

  // Fetch Search Data
  useEffect(() => {
    if (!selected) return;

    let mounted = true;
    async function loadSymbol() {
      const cacheKey = `${CACHE_KEY_SEARCH_PREFIX}${selected}`;

      // 1. Try Valid Cache First (Strict TTL)
      const fresh = getCache(cacheKey, false);
      if (fresh) {
        setQuote(fresh.quote);
        setSymbolNews(fresh.symbolNews);
        setErrorSearch("");
        setLoadingSearch(false);
        return;
      }

      // 2. Fallback to Stale Cache (Stale-While-Revalidate)
      const cached = getCache(cacheKey, true); // Get stale data
      if (cached) {
        setQuote(cached.quote);
        setSymbolNews(cached.symbolNews);
        setErrorSearch("");
      } else {
        setLoadingSearch(true);
      }
      
      setErrorSearch("");

      // Determine query symbol (append .BK for Thai stocks if missing)
      let querySymbol = selected;
      const match = allSymbols.find(s => s.symbol === selected);
      
      // If backend already provides .BK (which it does now), we don't need to add it again.
      // But if the user manually typed "DELTA" and it matched a SET stock that hasn't been suffixed yet (unlikely with new backend),
      // we might need logic. 
      // Safe logic: Add .BK only if exchange is SET/mai AND it doesn't already end with .BK
      if (match && (match.exchange === 'SET' || match.exchange === 'mai') && !querySymbol.endsWith(".BK")) {
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

        const newCacheData = {
          quote: newQuote,
          symbolNews: newNews
        };

        let hasChanged = true;
        if (cached) {
             const cachedStr = JSON.stringify({ quote: cached.quote, symbolNews: cached.symbolNews });
             const newStr = JSON.stringify(newCacheData);
             if (cachedStr === newStr) {
                 hasChanged = false;
             }
        }

        if (hasChanged) {
            setQuote(newQuote);
            setSymbolNews(newNews);
            setCache(cacheKey, newCacheData);
        }

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

  const topStory = useMemo(() => marketNews.find(item => item.ticker), [marketNews]);
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
    if (country !== "all") {
      filtered = filtered.filter(s => s.country === country);
      
      // Strict filter for Thailand: Show ONLY Thai Stock Market symbols (ending with .BK)
      // This excludes DRs (which might be tagged as TH but lack .BK suffix)
      if (country === "TH") {
        filtered = filtered.filter(s => s.symbol.endsWith(".BK"));
      }
    }
    
    if (value.length > 0) {
      filtered = filtered.filter(s => s.symbol.startsWith(value));
    }

    // Prioritize configured symbols (e.g. for Thailand)
    if (country !== "all" && COUNTRY_CONFIG[country] && COUNTRY_CONFIG[country].symbols) {
        const preferredTickers = COUNTRY_CONFIG[country].symbols; // Ordered list
        const preferredSet = new Set(preferredTickers);
        
        const preferred = [];
        const others = [];
        
        filtered.forEach(s => {
            if (preferredSet.has(s.symbol)) {
                preferred.push(s);
            } else {
                others.push(s);
            }
        });

        // Sort preferred by index in preferredTickers to maintain specific order
        preferred.sort((a, b) => {
            return preferredTickers.indexOf(a.symbol) - preferredTickers.indexOf(b.symbol);
        });

        filtered = [...preferred, ...others];
    }
    
    setSuggestions(filtered.slice(0, 100));
    setShowSuggestions(true);
  };

  const handleSearchChange = (e) => {
    const newSearch = e.target.value.toUpperCase();
    setSearch(newSearch);
    updateSuggestions(newSearch);
  };

  const handleSearchFocus = () => {
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
            {/* Country Select */}
            <div className="relative w-full md:w-56" ref={countryMenuRef}>
              <button
                type="button"
                onClick={() => setShowCountryMenu(!showCountryMenu)}
                className="w-full bg-white border border-gray-200 text-[#0B102A] py-2.5 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B102A] text-sm font-medium cursor-pointer hover:border-gray-300 transition-colors shadow-sm flex items-center gap-3 text-left"
              >
                <div className="w-5 flex-shrink-0 flex items-center justify-center">
                  {country !== 'all' ? (
                    <img src={getFlagUrl(country)} alt={country} className="w-5 h-3.5 object-cover rounded-[2px] shadow-sm" />
                  ) : (
                    <i className="bi bi-globe text-gray-400"></i>
                  )}
                </div>
                <span className="truncate">{COUNTRY_OPTIONS.find(o => o.code === country)?.label}</span>
                
                <div className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 pointer-events-none">
                  <i className={`bi bi-chevron-down text-xs transition-transform ${showCountryMenu ? "rotate-180" : ""}`}></i>
                </div>
              </button>

              {showCountryMenu && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
                  {COUNTRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.code}
                      onClick={() => {
                        setCountry(opt.code);
                        setShowCountryMenu(false);
                      }}
                      className={`w-full px-4 py-2.5 hover:bg-gray-50 cursor-pointer flex items-center gap-3 text-sm transition-colors text-left ${
                        country === opt.code ? "bg-gray-50 font-semibold text-[#0B102A]" : "text-gray-700"
                      }`}
                    >
                      <div className="w-5 flex-shrink-0 flex items-center justify-center">
                        {opt.code !== 'all' ? (
                          <img src={getFlagUrl(opt.code)} alt={opt.code} className="w-5 h-3.5 object-cover rounded-[2px] shadow-sm" />
                        ) : (
                          <i className="bi bi-globe text-gray-400 text-lg"></i>
                        )}
                      </div>
                      <span className="flex-1 truncate">{opt.label}</span>
                      {country === opt.code && (
                         <i className="bi bi-check-lg text-[#0B102A]"></i>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-[300px]" ref={searchContainerRef}>
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                onKeyDown={onSearchKey}
                onFocus={handleSearchFocus}
                placeholder={country === 'all' ? "Search stocks..." : `Search ${country} stocks...`}
                className="w-full bg-white pl-4 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B102A] text-sm shadow-sm"
              />
              {search ? (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <i className="bi bi-x-lg"></i>
                </button>
              ) : (
                <i className="bi bi-chevron-down absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none text-xs" />
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
                        <div className="text-3xl font-bold">${quote.price?.toFixed(2)}</div>
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
                        {topStory.ticker && topStory.quote && (
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
                            </div>
                          </div>
                        )}
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
                      <div className="absolute right-4 sm:right-6 md:right-8 top-1/2 transform -translate-y-1/2">
                        {topStory.quote && topStory.quote.logo_url ? (
                          <img
                            src={topStory.quote.logo_url}
                            alt="background"
                            className="w-[64px] h-[64px] sm:w-[80px] sm:h-[80px] md:w-[96px] md:h-[96px] object-contain"
                          />
                        ) : (
                          <i className="bi bi-newspaper text-[48px] sm:text-[72px] md:text-[96px]"></i>
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
                  ) : defaultUpdates.length > 0 ? (
                    defaultUpdates.map((item, idx) => (
                      <NewsCard
                        key={idx}
                        ticker={item.ticker}
                        quote={item.quote}
                        news={item.news}
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
