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
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-800 font-medium">
                {news.source}
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
      // 1. Try Cache First (Stale-While-Revalidate)
      const cached = getCache(CACHE_KEY_HOME, true); // Get stale data if available
      if (cached) {
        setMarketNews(cached.marketNews);
        setDefaultUpdates(cached.defaultUpdates);
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
        const merged = [...enNews, ...thNews].sort((a, b) => {
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
        const updates = updatesResults.flat();

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

  const topStory = useMemo(() => marketNews.find(item => item.ticker), [marketNews]);
  const topStorySentiment = useMemo(() => {
    if (!topStory) return "neutral";
    const textSentiment = analyzeSentiment(topStory.news.title + " " + topStory.news.summary);

    // Conflict Resolution for Top Story
    if (topStory.quote) {
      const isPositive = topStory.quote.change_pct >= 0;
      if (isPositive && textSentiment === "negative") return "neutral";
      if (!isPositive && textSentiment === "positive") return "neutral";
    }

    return textSentiment;
  }, [topStory]);


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
    if (value.length > 0) {
      const filtered = allSymbols.filter(s => s.symbol.startsWith(value));
      setSuggestions(filtered.slice(0, 100));
    } else {
      setSuggestions(allSymbols.slice(0, 100));
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

  // Close suggestions when clicking outside would be ideal, 
  // but for now we'll rely on selection or blur (careful with blur vs click)
  // A simple way is to delay hiding on blur to allow click to register
  const handleSearchBlur = () => {
    // Delay hiding to allow item click to register
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

  console.log('suggestionsContent', suggestionsContent);

  return (
    <div className="min-h-screen w-full bg-[#F5F5F5] flex justify-center">
      <div className="w-full max-w-[1248px] px-4 md:px-8 flex flex-col h-full py-10">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-6 mb-4 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-[#0B102A]">News</h1>
            <p className="text-[#6B6B6B] text-xs sm:text-sm">Latest market updates, earnings reports, and insights for Underlying Assets</p>
          </div>
          <div className="relative w-full md:w-[300px]">
            <input
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