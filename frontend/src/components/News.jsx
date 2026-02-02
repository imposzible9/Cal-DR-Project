import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

// Read API base from Vite environment variables. Support multiple names
// (some projects use VITE_NEWS_API, others VITE_NEWS_API_URL or VITE_API_BASE)
const API_BASE = import.meta.env.VITE_NEWS_API || import.meta.env.VITE_NEWS_API_URL || import.meta.env.VITE_API_BASE || '';
const TH_QUERY = "ตลาดหุ้น OR หุ้น OR ดัชนี";
const EN_QUERY = "stock market";
const DEFAULT_SYMBOLS = ["NVDA", "TSLA", "GOOG", "AAPL", "MSFT", "AMZN", "META", "BABA"];
const CACHE_KEY_HOME = "caldr_news_home_v2";
const CACHE_KEY_SEARCH_PREFIX = "caldr_news_search_v2_";
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

const NewsCard = ({ ticker, quote, news }) => {
  const isPositive = quote && quote.change_pct >= 0;

  // Check if news object is valid to prevent crashes
  if (!news) return null;

  // Define classes based on sentiment
  const containerClasses = "bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow flex flex-row gap-4 items-stretch h-full";

  return (
    <a href={news.url} target="_blank" rel="noreferrer" className="block group h-full">
      <div className={containerClasses}>
        {ticker && quote && (
          <div className="flex-shrink-0 w-[85px] sm:w-[100px] bg-[#F3F4F6] rounded-xl border border-gray-200 p-2 flex flex-col items-center justify-center text-center gap-1">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white flex items-center justify-center overflow-hidden shadow-sm p-1">
              {quote.logo_url ? (
                <img src={quote.logo_url} alt={ticker} className="w-full h-full object-contain" />
              ) : (
                <span className="text-sm font-bold text-gray-900">{ticker[0]}</span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">{ticker}</div>
              <div className={`text-[10px] sm:text-xs font-bold ${isPositive ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                {isPositive ? '+' : ''}{quote.change_pct?.toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h3 className="text-sm sm:text-[15px] font-bold text-gray-900 mb-1.5 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2 break-words">
              {news.title}
            </h3>
            <p className="text-xs sm:text-[13px] text-gray-500 line-clamp-3 leading-relaxed hidden sm:block break-words">
              {news.summary}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-400 mt-2">
            {news.source && (
              <>
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                  {news.source}
                </span>
                <span>•</span>
              </>
            )}
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
      // 1. Try Cache First (Stale-While-Revalidate)
      const cached = getCache(CACHE_KEY_HOME, true); // Get stale data if available
      if (cached && Array.isArray(cached.marketNews)) {
        setMarketNews(cached.marketNews);
        setDefaultUpdates(cached.defaultUpdates || []);
        // If cache is fresh, stop here (optional: can always revalidate if you want "live" feel)
        const isFresh = getCache(CACHE_KEY_HOME);
        if (isFresh) {
          setLoadingHome(false);
          return;
        }
        // If stale, we continue to fetch but don't show full loading spinner if we have data
      } else {
        setLoadingHome(true);
      }

      try {
        const [enRes, thRes] = await Promise.all([
          axios.get(`${API_BASE}/api/news/${encodeURIComponent(EN_QUERY)}`, { params: { limit: 20, language: "en", hours: 72 } }),
          axios.get(`${API_BASE}/api/news/${encodeURIComponent(TH_QUERY)}`, { params: { limit: 20, language: "th", hours: 72 } })
        ]);
        if (!mounted) return;
        const enNews = enRes.data?.news || [];
        const thNews = thRes.data?.news || [];

        // Filter out invalid items
        const merged = [...enNews, ...thNews].filter(item => item && item.published_at);
        merged.sort((a, b) => {
          const da = a.published_at ? new Date(a.published_at) : new Date(0);
          const db = b.published_at ? new Date(b.published_at) : new Date(0);
          return db - da;
        });

        // Load Default Updates (Mocking the "Latest Updates" list with specific tickers)
        // We fetch quote + news for DEFAULT_SYMBOLS in Parallel
        const updatesPromises = DEFAULT_SYMBOLS.map(async (sym) => {
          try {
            const [qRes, nRes] = await Promise.all([
              axios.get(`${API_BASE}/api/finnhub/quote/${sym}`),
              axios.get(`${API_BASE}/api/finnhub/company-news/${sym}`, { params: { hours: 72, limit: 2 } })
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

        const updatesResults = await Promise.all(updatesPromises);
        const updates = updatesResults.flat().filter(u => u && u.news);

        const toMs = (v) => typeof v === "number" ? v * 1000 : (new Date(v).getTime() || 0);
        updates.sort((a, b) => toMs(b.news.published_at) - toMs(a.news.published_at));

        // Merge general news and company updates for "Top Stories"
        const combinedNews = [
          ...merged.map(item => ({ news: item })), // Wrap general news
          ...updates // Company news already has { news, ticker, quote }
        ];

        combinedNews.sort((a, b) => toMs(b.news.published_at) - toMs(a.news.published_at));

        if (mounted) {
          setDefaultUpdates(updates);
          setMarketNews(combinedNews);

          // Save to Cache
          setCache(CACHE_KEY_HOME, {
            marketNews: combinedNews,
            defaultUpdates: updates
          });
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
  }, [selected]);

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
        setSymbolNews(cached.symbolNews || []);
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

  const topStory = useMemo(() => (marketNews || []).find(item => item.ticker && item.news), [marketNews]);

  /* SEARCH LOGIC REFACTOR */
  const performSearch = (overrideValue) => {
    // If overrideValue is provided (e.g. from suggestion), use it.
    // Otherwise use current search state.
    const raw = (overrideValue !== undefined ? overrideValue : search).trim();

    // Priority 1: If suggestions are visible and user hits enter without specific text,
    // they might mean the first suggestion?
    // Current logic: If Enter is pressed, check suggestions.
    // BUT if we click the button, we probably just want to search the string.

    // Let's stick to: If specific value passed, use it. If not, validate 'search' state.

    if (!raw) {
      setSearchParams({});
      setErrorSearch("");
      return;
    }

    // Validation
    const isValid = /^[A-Za-z0-9]+$/.test(raw);
    if (!isValid) {
      setSearchParams({});
      setErrorSearch("กรุณากรอกรหัส Underlying หรือ Ticker เป็นตัวอักษร/ตัวเลขเท่านั้น");
      return;
    }

    setErrorSearch("");
    setSearchParams({ symbol: raw.toUpperCase() });
    setShowSuggestions(false);
  };

  const onSearchKey = (e) => {
    if (e.key === "Enter") {
      performSearch();
    }
  };

  /* SEARCH SUGGESTIONS LOGIC */
  const updateSuggestions = (value) => {
    // Static fallback data to ensure dropdown always shows recommended stocks
    const fallbackStatic = [
      { symbol: "NVDA", name: "NVIDIA Corporation" },
      { symbol: "GOOG", name: "Alphabet Inc." },
      { symbol: "GOOGL", name: "Alphabet Inc." },
      { symbol: "AAPL", name: "Apple Inc." },
      { symbol: "MSFT", name: "Microsoft Corporation" },
      { symbol: "AMZN", name: "Amazon.com Inc." },
      { symbol: "META", name: "Meta Platforms Inc." },
      { symbol: "TSLA", name: "Tesla Inc" }
    ];

    // Map for quick name lookup if API missing name
    const nameMap = fallbackStatic.reduce((acc, curr) => {
      acc[curr.symbol] = curr.name;
      return acc;
    }, {});

    if (value.length > 0) {
      const filtered = allSymbols.filter(s => s.symbol.startsWith(value));
      setSuggestions(filtered.slice(0, 100));
    } else {
      let newsSuggestions = [];

      // 1. Try Market News
      if (marketNews && marketNews.length > 0) {
        const uniqueTickers = new Set();
        marketNews.forEach(item => {
          if (item.ticker && !uniqueTickers.has(item.ticker)) {
            uniqueTickers.add(item.ticker);
            const enriched = allSymbols.find(s => s.symbol === item.ticker);
            // Use Name from Map if available, else API, else Ticker
            const name = nameMap[item.ticker] || (enriched ? enriched.name : item.ticker);

            newsSuggestions.push({
              symbol: item.ticker,
              name: name,
              logo: (item.quote && item.quote.logo_url) || (enriched ? enriched.logo : null),
              exchange: enriched ? enriched.exchange : ''
            });
          }
        });
      }

      if (newsSuggestions.length > 0) {
        setSuggestions(newsSuggestions.slice(0, 10));
      } else {
        // 2. Try Default List with API data but FORCE Names from static map
        let apiDefaults = DEFAULT_SYMBOLS.map(sym => {
          const found = allSymbols.find(s => s.symbol === sym);
          // Even if found in API, prefer our nice static name if available, or fallback to API name
          const name = nameMap[sym] || (found ? found.name : sym);
          // Use found logo or null
          return {
            symbol: sym,
            name: name,
            logo: found ? found.logo : null,
            exchange: found ? found.exchange : ''
          };
        });

        if (apiDefaults.length > 0) {
          setSuggestions(apiDefaults);
        } else {
          setSuggestions(fallbackStatic);
        }
      }
    }
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

  const handleSearchBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
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
    setShowSuggestions(false);
  };

  let suggestionsContent = null;
  if (showSuggestions && suggestions.length > 0) {
    suggestionsContent = (
      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl mt-2 shadow-2xl z-50 max-h-[300px] overflow-y-auto custom-scrollbar">
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: #D1D5DB;
            border-radius: 20px;
          }
        `}</style>
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center transition-colors border-b border-gray-100 last:border-0"
            onClick={() => selectSuggestion(s)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-white border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                {s.logo ? (
                  <img
                    src={s.logo}
                    alt={s.symbol}
                    className="w-full h-full object-contain p-1"
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
              <div className="flex flex-col">
                <span className="font-bold text-[#0B102A] text-sm md:text-base leading-none">{s.symbol}</span>
              </div>
            </div>
            <span className="text-xs md:text-sm text-gray-400 font-medium truncate ml-4 text-right flex-shrink max-w-[180px]">
              {s.name}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] flex justify-center pb-20">
      <div className="w-full max-w-[500px] md:max-w-[1248px] px-4 md:px-8 flex flex-col h-full py-6 md:py-10">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2 text-[#0B102A]">News</h1>
            <p className="text-[#6B7280] text-sm md:text-base">Latest market updates, earnings reports, and insights for Underlying Assets</p>
          </div>
          <div className="relative w-full md:w-[320px]">
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              onKeyDown={onSearchKey}
              onFocus={handleSearchFocus}
              onClick={handleSearchFocus}
              onBlur={handleSearchBlur}
              placeholder="Search"
              className="w-full bg-white pl-4 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B102A] text-sm shadow-sm font-sans"
            />
            {selected ? (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                title="Clear Search"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            ) : (
              <button
                onClick={() => performSearch()}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-[#0B102A] w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                title="Search"
              >
                <i className="bi bi-search" />
              </button>
            )}
            {suggestionsContent}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-8">

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
                          <div key={idx} className="h-[120px]">
                            <NewsCard news={news} />
                          </div>
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
            <div className="space-y-6">
              {/* Top Stories Banner */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-[#0B102A]">Top Stories</h2>
                {loadingHome ? (
                  <div className="animate-pulse h-64 bg-gray-200 rounded-2xl" />
                ) : topStory && topStory.news ? (
                  <a href={topStory.news.url} target="_blank" rel="noreferrer" className="block group">
                    <div className="bg-[#0B102A] rounded-2xl p-6 md:p-8 text-white relative overflow-hidden shadow-lg min-h-[280px] flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="relative z-10 flex-1 max-w-3xl">
                        {topStory.ticker && topStory.quote && (
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                              {topStory.quote.logo_url ? (
                                <img src={topStory.quote.logo_url} alt={topStory.ticker} className="w-full h-full object-contain" />
                              ) : (
                                <span className="text-[10px] font-bold text-white">{topStory.ticker[0]}</span>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-blue-100">{topStory.ticker}</span>
                          </div>
                        )}

                        <h3 className="text-2xl md:text-3xl font-bold leading-tight mb-4 group-hover:text-blue-200 transition-colors break-words">
                          {topStory.news.title}
                        </h3>
                        <p className="text-blue-100/80 text-sm md:text-base line-clamp-2 mb-6 max-w-2xl break-words">
                          {topStory.news.summary}
                        </p>

                        <div className="flex items-center gap-3 text-xs md:text-sm text-blue-200/60">
                          {topStory.news.source && (
                            <span className="px-2 py-1 rounded bg-white/10 border border-white/5 font-medium text-blue-100">
                              {topStory.news.source}
                            </span>
                          )}
                          <span>•</span>
                          <span>{timeAgo(topStory.news.published_at)}</span>
                        </div>
                      </div>

                      {/* Large Right Image/Logo Placeholder */}
                      <div className="relative z-10 hidden md:flex w-[130px] h-[130px] bg-white rounded-xl items-center justify-center p-4 flex-shrink-0 shadow-2xl shadow-black/20">
                        {topStory.quote && topStory.quote.logo_url ? (
                          <img src={topStory.quote.logo_url} className="w-full h-full object-contain" alt="Logo" />
                        ) : (
                          <i className="bi bi-newspaper text-5xl text-gray-300"></i>
                        )}
                      </div>
                    </div>
                  </a>
                ) : (
                  <div className="text-gray-500">No top stories available</div>
                )}
              </div>

              {/* Latest Updates */}
              <div className="space-y-3">
                <h2 className="text-[18px] font-bold text-[#0B102A]">Latest Updates</h2>
                <div className="flex flex-col gap-3">
                  {loadingHome ? (
                    Array.from({ length: 3 }).map((_, i) => <div key={i} className="animate-pulse h-24 bg-gray-100 rounded-xl" />)
                  ) : defaultUpdates.length > 0 ? (
                    defaultUpdates.map((item, idx) => (
                      <div key={idx} className="h-auto">
                        <NewsCard
                          ticker={item.ticker}
                          quote={item.quote}
                          news={item.news}
                        />
                      </div>
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