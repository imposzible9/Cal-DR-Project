import React, { useState, useEffect, useMemo, useCallback, useTransition, useRef } from "react";
import swipeImg from "../assets/swipe.png";
import { trackFilter, trackSearch, trackStockView } from "../utils/tracker";

// const API_URL = "http://172.17.1.85:8333/dr";
const API_URL = "http://api.ideatrade1.com:8002/dr";
const CACHE_KEY = "dr_cache_v3";

/* ───────────────────────────────────────────────
    FORMAT HELPERS
─────────────────────────────────────────────── */
const formatNum = (n) => {
  // Check if value is null, undefined, empty string, or "-" (no data)
  if (n === null || n === undefined || n === "" || n === "-") return "-";

  const num = Number(n);

  if (!isFinite(num)) return "-";
  if (num === 0) return "-";

  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatChange = (n) => {
  if (n === null || n === undefined || n === "" || n === "-") return "-";

  const num = Number(n);

  if (!isFinite(num)) return "-";

  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatInt = (n) => {
  if (n === null || n === undefined || n === "" || n === "-") return "-";

  const num = Number(n);

  if (!isFinite(num)) return "-";

  if (num === 0) return "-";

  return Math.round(num).toLocaleString();
};

const formatRatio = (raw) => {
  if (!raw) return "0:1";
  const s = String(raw);
  const parts = s.split(":");
  const leftRaw = parts[0] ? parts[0].replace(/[^\d.-]/g, "") : "0";
  const right = parts[1] ? parts[1].trim() : "1";
  const leftNum = Number(leftRaw) || 0;
  return `${Math.round(leftNum).toLocaleString()}:${right}`;
};

const extractSymbol = (str) => {
  if (!str) return "-";
  const match = String(str).match(/\(([^)]+)\)$/);
  return match ? match[1] : str;
};

const countryOptions = [
  { code: "all", label: "All Markets" },
  { code: "US", label: "US United States" },
  { code: "HK", label: "HK Hong Kong" },
  { code: "DK", label: "DK Denmark" },
  { code: "NL", label: "NL Netherlands" },
  { code: "FR", label: "FR France" },
  { code: "IT", label: "IT Italy" },
  { code: "JP", label: "JP Japan" },
  { code: "SG", label: "SG Singapore" },
  { code: "TW", label: "TW Taiwan" },
  { code: "CN", label: "CN China" },
  { code: "VN", label: "VN Vietnam" },
];

/* ───────────────────────────────────────────────
    GET COUNTRY FROM EXCHANGE (STRICT MAPPING)
─────────────────────────────────────────────── */
const getCountryFromExchange = (exchange = "") => {
  if (!exchange) return "OTHER";
  const ex = String(exchange).toLowerCase();

  if (ex.includes("euronext amsterdam")) return "NL";
  if (ex.includes("euronext milan")) return "IT";
  if (ex.includes("euronext paris")) return "FR";
  if (ex.includes("hochiminh") || ex.includes("hanoi") || ex.includes("hnx")) return "VN";
  if (ex.includes("nasdaq copenhagen")) return "DK";
  if (ex.includes("shenzhen") || ex.includes("shanghai")) return "CN";
  if (ex.includes("singapore exchange") || ex.includes("sgx")) return "SG";
  if (ex.includes("taiwan stock exchange")) return "TW";
  if (ex.includes("stock exchange of hong kong") || ex.includes("hkex")) return "HK";
  if (ex.includes("tokyo stock exchange")) return "JP";
  if (
    ex.includes("nasdaq global select market") ||
    ex.includes("nasdaq stock market") ||
    ex.includes("new york stock exchange") ||
    ex.includes("nyse") ||
    ex.includes("nasdaq")
  ) return "US";

  return "OTHER";
};

export default function DRList() {
  const [tab, setTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();

  /* DR FILTER */
  const [drFilter, setDrFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");

  /* WATCHLIST */
  const [watchlist, setWatchlist] = useState([]);

  /* SETTINGS MODAL */
  const [showSettings, setShowSettings] = useState(false);

  /* DETAIL MODAL */
  const [detailRow, setDetailRow] = useState(null);

  /* TAB TOOLTIP */
  const [hoveredTab, setHoveredTab] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  /* LAST UPDATED */
  const [lastUpdated, setLastUpdated] = useState(null);

  /* VISIBLE COLUMNS */
  const [visibleColumns, setVisibleColumns] = useState({
    star: true,
    dr: true,
    open: true,
    high: true,
    low: true,
    last: true,
    change: false,
    pct: true,
    bid: true,
    offer: true,
    vol: true,
    value: true,
    tradingSession: false,
    issuerName: false,
    marketCap: true,
    ytdChange: false,
    ytdPercentChange: false,
    underlyingName: true,
    conversionRatio: true,
    divYield: true,
    securityTypeName: true,
    exchange: true,
    outstandingShare: true,
  });

  const [showScrollHint, setShowScrollHint] = useState(true);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDir, setSwipeDir] = useState(1);

  const selectedCountryOption = useMemo(
    () => countryOptions.find((opt) => opt.code === countryFilter) || countryOptions[0],
    [countryFilter]
  );

  /* SEARCH DEBOUNCE */
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmedSearch = searchTerm.trim();
      setSearch(trimmedSearch);
      // Track search only when there's meaningful input (at least 2 chars)
      if (trimmedSearch.length >= 2) {
        trackSearch(trimmedSearch);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  /* LOAD WATCHLIST */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dr_watchlist");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setWatchlist(parsed);
      }
    } catch { }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("dr_watchlist", JSON.stringify(watchlist));
    } catch { }
  }, [watchlist]);

  useEffect(() => {
    if (!showScrollHint) return;
    const timer = setTimeout(() => setShowScrollHint(false), 10 * 1000);
    return () => clearTimeout(timer);
  }, [showScrollHint]);

  useEffect(() => {
    if (!showScrollHint) return;
    const id = setInterval(() => {
      setSwipeOffset((prev) => {
        const max = 8;
        let next = prev + swipeDir * 3;

        if (next > max) {
          next = max;
          setSwipeDir(-1);
        } else if (next < -max) {
          next = -max;
          setSwipeDir(1);
        }

        return next;
      });
    }, 40);
    return () => clearInterval(id);
  }, [showScrollHint, swipeDir]);

  // Handle click outside for country dropdown
  const countryDropdownRef = useRef(null);
  const dropdownMenuRef = useRef(null);
  const [showCountryMenu, setShowCountryMenu] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (
        countryDropdownRef.current &&
        dropdownMenuRef.current &&
        !countryDropdownRef.current.contains(e.target) &&
        !dropdownMenuRef.current.contains(e.target)
      ) {
        setShowCountryMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isStarred = useCallback((s) => watchlist.includes(s), [watchlist]);
  const toggleWatchlist = useCallback(
    (s) => setWatchlist((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])),
    []
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.rows && mounted) {
            setData(parsed.rows);
            setLoading(false);
          }
        }
      } catch { }

      try {
        setIsRefreshing(true);
        const res = await fetch(API_URL);
        const json = await res.json();
        const rows = json.rows || [];

        if (json.updated_at) {
          const date = new Date(json.updated_at * 1000);
          setLastUpdated(date);
        }

        const formatted = rows.map((x) => ({
          dr: x.symbol ?? "-",
          open: x.open ?? 0,
          high: x.high ?? 0,
          low: x.low ?? 0,
          last: x.last ?? 0,
          change: x.change ?? 0,
          pct: x.percentChange ?? 0,
          bid: x.bidPrice ?? 0,
          offer: x.offerPrice ?? 0,
          vol: x.totalVolume ?? 0,
          value: (x.totalValue ?? 0) / 1000,
          tradingSession: x.tradingSession ?? "",
          issuer: x.issuer ?? "",
          issuerName: x.issuerName ?? "",
          marketCap: x.marketCap ?? null,
          ytdChange: x.ytdChange ?? null,
          ytdPercentChange: x.ytdPercentChange ?? null,
          underlying: extractSymbol(x.underlying || x.underlyingName),
          underlyingName: x.underlyingName ?? "",
          conversionRatio: x.conversionRatio ?? "",
          divYield: x.dividendYield12M ?? null,
          securityTypeName: x.underlyingClassName ?? "",
          exchange: x.underlyingExchange ?? "",
          outstandingShare: x.outstandingShare ?? null,
          country: getCountryFromExchange(x.underlyingExchange),
          full: x,
          ratio: formatRatio(x.conversionRatio),
        }));

        if (!mounted) return;
        setData(formatted);

        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: formatted }));
        } catch { }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  /* ───────────────────────────────────────────────
      UI SECTION – CONTROL BAR
  ─────────────────────────────────────────────── */
  const renderControlBar = () => {
    return (
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative z-[200]" ref={countryDropdownRef} style={{ isolation: 'isolate', overflow: 'visible' }}>
            <button
              type="button"
              onClick={() => setShowCountryMenu((prev) => !prev)}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0B102A] min-w-[180px] h-[37.33px]"
            >
              <span>{selectedCountryOption.label}</span>
              <svg
                className={`h-4 w-4 transition-transform ${showCountryMenu ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showCountryMenu && (
              <div
                ref={dropdownMenuRef}
                className="absolute left-0 top-full z-[9999] mt-2 w-56 max-h-72 overflow-auto rounded-2xl border border-gray-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.15)] py-1"
                style={{ transform: 'translateZ(0)' }}
              >
                {countryOptions.map((opt) => (
                  <button
                    key={opt.code}
                    onClick={() => {
                      setCountryFilter(opt.code);
                      setShowCountryMenu(false);
                      trackFilter("country", opt.label);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm transition-colors ${opt.code === countryFilter ? "bg-[#EEF2FF] text-[#0B102A] font-semibold" : "text-gray-700 hover:bg-gray-50"
                      }`}
                  >
                    <span>{opt.label}</span>
                    {opt.code === countryFilter && <i className="bi bi-check-lg text-[#0B102A] text-base"></i>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDrFilter((prev) => (prev === "watchlist" ? "all" : "watchlist"))}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium shadow-sm border transition-colors ${drFilter === "watchlist"
              ? "bg-[#0B102A] border-[#0B102A] text-white"
              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
          >
            <i
              className={drFilter === "watchlist" ? "bi bi-star-fill text-yellow-400" : "bi bi-star text-gray-400"}
            />
            <span>Watchlist</span>
          </button>
        </div>

        <div className="flex items-center w-full md:w-auto gap-3">
          <div className="relative flex-1 md:flex-initial">
            <input
              type="text"
              placeholder="Search DR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white pl-4 pr-10 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B102A] focus:border-transparent w-full md:w-64 text-sm shadow-sm"
            />
            <i
              className="bi bi-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              style={{ fontSize: 14 }}
            />
          </div>
          <div className="shrink-0">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition-all"
            >
              <span>Customize</span>
              <i className="bi bi-sliders2" style={{ '--bi-stroke-width': '1.8px' }}></i>
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ───────────────────────────────────────────────
      FILTER PIPELINE
  ─────────────────────────────────────────────── */

  const filteredByCountry = useMemo(() => {
    if (countryFilter === "all") return data;
    return data.filter((r) => r.country === countryFilter);
  }, [data, countryFilter]);

  const filteredByDRFilter = useMemo(() => {
    if (drFilter === "all") return filteredByCountry;
    if (drFilter === "watchlist") return filteredByCountry.filter((r) => watchlist.includes(r.dr));
    if (drFilter === "lt10") return filteredByCountry.filter((r) => Number(r.last) < 10);
    return filteredByCountry;
  }, [filteredByCountry, drFilter, watchlist]);

  const filteredTab = useMemo(() => {
    if (tab === "all") return filteredByDRFilter;

    if (tab === "popular") {
      const groups = {};
      filteredByDRFilter.forEach(r => {
        if (!groups[r.underlying]) groups[r.underlying] = [];
        groups[r.underlying].push(r);
      });
      const winners = Object.values(groups).map(group =>
        group.reduce((prev, curr) => (Number(curr.vol) || 0) > (Number(prev.vol) || 0) ? curr : prev)
      );
      return winners.sort((a, b) => (Number(b.vol) || 0) - (Number(a.vol) || 0));
    }

    if (tab === "sensitivity") {
      const groups = {};
      filteredByDRFilter.forEach(r => {
        if (!groups[r.underlying]) groups[r.underlying] = [];
        groups[r.underlying].push(r);
      });
      const winners = Object.values(groups).map(group =>
        group.reduce((prev, curr) => {
          const bPrev = Number(prev.bid) || 0;
          const bCurr = Number(curr.bid) || 0;
          if (bCurr > 0 && (bPrev === 0 || bCurr < bPrev)) return curr;
          return prev;
        })
      );
      return winners.sort((a, b) => (Number(a.bid) || 0) - (Number(b.bid) || 0));
    }

    return filteredByDRFilter;
  }, [filteredByDRFilter, tab]);

  const filteredSearch = useMemo(() => {
    if (!search) return filteredTab;
    const t = search.toLowerCase();
    const source = filteredTab;

    return source.filter(
      (x) =>
        x.dr.toLowerCase().includes(t) ||
        x.issuer.toLowerCase().includes(t) ||
        x.issuerName.toLowerCase().includes(t) ||
        x.underlyingName.toLowerCase().includes(t) ||
        x.exchange.toLowerCase().includes(t)
    );
  }, [search, filteredTab]);

  /* BADGES */
  const badges = useMemo(() => {
    const popularIds = new Set();
    const sensitivityIds = new Set();

    if (tab !== "all" || !search) return { popularIds, sensitivityIds };

    const groups = {};
    filteredByDRFilter.forEach(r => {
      const key = r.underlying;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    Object.values(groups).forEach(group => {
      if (group.length <= 1) return;
      let maxVol = -1;
      let popDr = null;
      group.forEach(r => {
        const v = Number(r.vol) || 0;
        if (v > maxVol) { maxVol = v; popDr = r.dr; }
      });
      if (popDr && maxVol > 0) popularIds.add(popDr);

      let minBid = Infinity;
      let sensDr = null;
      group.forEach(r => {
        const b = Number(r.bid) || 0;
        if (b > 0 && b < minBid) { minBid = b; sensDr = r.dr; }
      });
      if (sensDr) sensitivityIds.add(sensDr);
    });

    return { popularIds, sensitivityIds };
  }, [filteredByDRFilter, tab, search]);

  /* SORT */
  const sortedData = useMemo(() => {
    let arr = [...filteredSearch];

    if (sortConfig.key) {
      arr.sort((a, b) => {
        if (sortConfig.key === "conversionRatio") {
          const parseRatio = (ratioStr) => {
            if (!ratioStr || ratioStr === "-") return 0;
            const str = String(ratioStr);
            const parts = str.split(":");
            if (parts.length === 0) return 0;
            const numStr = parts[0].replace(/[^\d.-]/g, "");
            return Number(numStr) || 0;
          };

          const A = parseRatio(a[sortConfig.key]);
          const B = parseRatio(b[sortConfig.key]);
          return sortConfig.direction === "asc" ? A - B : B - A;
        }

        const A = Number(a[sortConfig.key]);
        const B = Number(b[sortConfig.key]);

        if (!isNaN(A) && !isNaN(B))
          return sortConfig.direction === "asc" ? A - B : B - A;

        const Sa = String(a[sortConfig.key] ?? "");
        const Sb = String(b[sortConfig.key] ?? "");
        return sortConfig.direction === "asc"
          ? Sa.localeCompare(Sb)
          : Sb.localeCompare(Sa);
      });
    }

    const starred = arr.filter((x) => isStarred(x.dr));
    const others = arr.filter((x) => !isStarred(x.dr));
    return [...starred, ...others];
  }, [filteredSearch, sortConfig, isStarred]);

  /* ───────────────────────────────────────────────
      TABLE HEADER & ROWS
  ─────────────────────────────────────────────── */

  const renderHeaderCell = (key, label) => {
    if (!visibleColumns[key]) return null;
    const isActive = sortConfig.key === key;
    const direction = sortConfig.direction;
    const numericCols = ["open", "high", "low", "last", "change", "pct", "bid", "offer", "vol", "value", "marketCap"];
    const basicDrCols = ["issuerName", "marketCap", "underlyingName", "ytdChange", "ytdPercentChange", "conversionRatio", "divYield", "exchange", "securityTypeName", "outstandingShare"];
    const rightAlignCols = [...numericCols, ...basicDrCols];
    const alignClass = rightAlignCols.includes(key) ? "text-right justify-end" : "text-left";
    const extraStyle = key === "dr" ? "sticky left-0 z-20 bg-[#f4f4f4]" : "";

    return (
      <th
        key={key}
        className={`py-4 px-6 whitespace-nowrap ${alignClass} text-sm font-bold cursor-pointer select-none ${extraStyle}`}
        onClick={() => {
          let dir = "asc";
          if (sortConfig.key === key && sortConfig.direction === "asc") dir = "desc";
          setSortConfig({ key, direction: dir });
        }}
      >
        <div className={`flex gap-1 w-full ${rightAlignCols.includes(key) ? "justify-end" : "justify-start"}`}>
          {label}
          {isActive && <span>{direction === "asc" ? "▲" : "▼"}</span>}
        </div>
      </th>
    );
  };

  const renderRow = (row, index) => {
    const fundamentalKeys = ["issuerName", "marketCap", "underlyingName", "ytdChange", "ytdPercentChange", "conversionRatio", "divYield", "exchange", "securityTypeName", "outstandingShare"];
    const firstVisibleFundamentalKey = fundamentalKeys.find(k => visibleColumns[k]);
    const isPop = badges.popularIds.has(row.dr);
    const isSens = badges.sensitivityIds.has(row.dr);
    const rowBg = index % 2 === 0 ? "bg-white" : "bg-[#F5F5F5]";

    return (
      <tr key={row.dr} className={`${rowBg} cursor-pointer`} onClick={() => { setDetailRow(row); trackStockView(row.dr, row.underlying || row.underlyingName); }} style={{ height: "52px" }}>
        {visibleColumns.star && (
          <td className={`py-4 px-1 text-center sticky left-0 ${rowBg}`} style={{ width: "35px", minWidth: "35px", zIndex: 20 }} onClick={(e) => { e.stopPropagation(); toggleWatchlist(row.dr); }}>
            {isStarred(row.dr) ? <i className="bi bi-star-fill text-yellow-500 text-sm"></i> : <i className="bi bi-star text-gray-400 text-sm hover:text-yellow-500"></i>}
          </td>
        )}
        {visibleColumns.dr && (
          <td className={`py-4 px-4 text-left font-bold text-[#2F80ED] sticky ${rowBg} relative dr-shadow-right`} style={{ left: visibleColumns.star ? "35px" : "0px", width: "155px", minWidth: "155px", zIndex: 20 }}>
            <div className="flex items-center gap-2">
              <span>{row.dr}</span>
              {(isSens || isPop) && (
                <div className="flex flex-col gap-1">
                  {isSens && <span className="text-[10px] font-bold bg-gradient-to-r from-[#0007DE] to-[#00035A] bg-clip-text text-transparent whitespace-nowrap">Sensitivity</span>}
                  {isPop && <span className="text-[10px] font-bold bg-gradient-to-r from-[#50B728] to-[#316D19] bg-clip-text text-transparent whitespace-nowrap">Most Popular</span>}
                </div>
              )}
            </div>
          </td>
        )}
        {visibleColumns.open && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.open)}</td>}
        {visibleColumns.high && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.high)}</td>}
        {visibleColumns.low && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.low)}</td>}
        {visibleColumns.last && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.last)}</td>}
        {visibleColumns.change && (
          <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono" style={{ color: row.change > 0 ? "#27AE60" : row.change < 0 ? "#EB5757" : undefined }}>
            {(() => {
              // Check if trading data exists (if any of these are missing/0, show "-")
              const hasData = row.open && row.high && row.low && row.last &&
                row.open !== 0 && row.high !== 0 && row.low !== 0 && row.last !== 0;

              if (!hasData) return "-";

              // Has trading data, show change (can be 0.00 if no change)
              const changeValue = formatChange(row.change);
              return row.change > 0 ? `+${changeValue}` : changeValue;
            })()}
          </td>
        )}
        {visibleColumns.pct && (
          <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono" style={{ color: row.pct > 0 ? "#27AE60" : row.pct < 0 ? "#EB5757" : undefined }}>
            {(() => {
              // Check if trading data exists (if any of these are missing/0, show "-")
              const hasData = row.open && row.high && row.low && row.last &&
                row.open !== 0 && row.high !== 0 && row.low !== 0 && row.last !== 0;

              if (!hasData) return "-";

              // Has trading data, show pct change (can be 0.00 if no change)
              const pctValue = formatChange(row.pct);
              return row.pct > 0 ? `+${pctValue}` : pctValue;
            })()}
          </td>
        )}
        {visibleColumns.bid && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.bid)}</td>}
        {visibleColumns.offer && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.offer)}</td>}
        {visibleColumns.vol && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.vol)}</td>}
        {visibleColumns.value && <td className="py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono">{formatNum(row.value)}</td>}
        {visibleColumns.tradingSession && <td className="py-4 px-4 text-left text-gray-800 text-[14.4px] font-medium whitespace-nowrap">{row.tradingSession || "-"}</td>}
        {visibleColumns.issuerName && <td className={`py-4 px-4 text-left text-gray-800 text-[14.4px] font-medium ${firstVisibleFundamentalKey === 'issuerName' ? 'border-l border-gray-200' : ''}`} style={{ whiteSpace: "normal", wordBreak: "keep-all", overflowWrap: "anywhere", minWidth: 100 }}>{row.issuer || "-"}</td>}
        {visibleColumns.marketCap && <td className={`py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono ${firstVisibleFundamentalKey === 'marketCap' ? 'border-l-2 border-gray-200' : ''}`}>{row.marketCap ? formatNum(row.marketCap / 1000000) : "-"}</td>}
        {visibleColumns.underlyingName && <td className={`py-4 px-4 text-left font-bold text-[#2F80ED] text-[14.4px] ${firstVisibleFundamentalKey === 'underlyingName' ? 'border-l-2 border-gray-200' : ''}`} style={{ whiteSpace: "nowrap", minWidth: 180 }}>{row.underlying || "-"}</td>}
        {visibleColumns.ytdChange && <td className={`py-4 px-3 text-right ${firstVisibleFundamentalKey === 'ytdChange' ? 'border-l-2 border-gray-200' : ''}`} style={{ color: row.ytdChange > 0 ? "#27AE60" : row.ytdChange < 0 ? "#EB5757" : "#6B7280", fontWeight: 500 }}>{row.ytdChange !== null ? `${row.ytdChange > 0 ? '+' : ''}${formatNum(row.ytdChange)}` : "-"}</td>}
        {visibleColumns.ytdPercentChange && <td className={`py-4 px-3 text-right ${firstVisibleFundamentalKey === 'ytdPercentChange' ? 'border-l-2 border-gray-200' : ''}`} style={{ color: row.ytdPercentChange > 0 ? "#27AE60" : row.ytdPercentChange < 0 ? "#EB5757" : "#6B7280", fontWeight: 500 }}>{row.ytdPercentChange !== null ? `${row.ytdPercentChange > 0 ? '+' : ''}${formatNum(row.ytdPercentChange)}%` : "-"}</td>}
        {visibleColumns.conversionRatio && <td className={`py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium ${firstVisibleFundamentalKey === 'conversionRatio' ? 'border-l border-gray-200' : ''}`} style={{ minWidth: 100 }}>{row.ratio}</td>}
        {visibleColumns.divYield && <td className={`py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono ${firstVisibleFundamentalKey === 'divYield' ? 'border-l border-gray-200' : ''}`}>{row.divYield ? formatNum(row.divYield) : "-"}</td>}
        {visibleColumns.exchange && <td className={`py-4 px-4 text-left text-gray-800 text-[14.4px] font-medium ${firstVisibleFundamentalKey === 'exchange' ? 'border-l border-gray-200' : ''}`} style={{ whiteSpace: "nowrap", minWidth: 180 }}>{row.exchange || "-"}</td>}
        {visibleColumns.securityTypeName && (
          <td
            className={`py-4 px-4 text-left text-gray-800 text-[14.4px] font-medium ${firstVisibleFundamentalKey === "securityTypeName" ? "border-l border-gray-200" : ""
              } whitespace-nowrap truncate`}
            style={{ minWidth: 220, maxWidth: 260 }}
          >
            {row.securityTypeName || "-"}
          </td>
        )}
        {visibleColumns.outstandingShare && <td className={`py-4 px-4 text-right text-gray-800 text-[14.4px] font-medium font-mono ${firstVisibleFundamentalKey === 'outstandingShare' ? 'border-l border-gray-200' : ''}`} style={{ minWidth: 120 }}>{row.outstandingShare ? formatInt(row.outstandingShare) : "-"}</td>}
      </tr>
    );
  };

  const renderTable = () => {
    const tradingKeys = ["open", "high", "low", "last", "change", "pct", "bid", "offer", "vol", "value", "tradingSession"];
    const fundamentalKeys = ["issuerName", "marketCap", "underlyingName", "ytdChange", "ytdPercentChange", "conversionRatio", "divYield", "exchange", "securityTypeName", "outstandingShare"];
    const textCols = ["tradingSession", "issuerName", "underlyingName", "exchange", "securityTypeName"];
    const visibleTradingCount = tradingKeys.filter(k => visibleColumns[k]).length;
    const visibleFundamentalCount = fundamentalKeys.filter(k => visibleColumns[k]).length;
    const firstVisibleFundamentalKey = fundamentalKeys.find(k => visibleColumns[k]);

    const SortIndicator = ({ colKey }) => {
      const active = sortConfig.key === colKey;
      const direction = sortConfig.direction;
      const upColor = active && direction === "asc" ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)";
      const downColor = active && direction === "desc" ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)";
      return (
        <div className="flex items-center ml-0 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-[12px] h-[12px] transition-all duration-200">
            <path d="M14 2.256V30c-2.209 0-4-1.791-4-4V13H4.714c-.633 0-.949-.765-.502-1.212l9.607-9.607C13.886 2.114 14 2.162 14 2.256z" fill={upColor} />
            <path d="M27.788 20.212l-9.6 9.6C18.118 29.882 18 29.832 18 29.734V2c2.209 0 4 1.791 4 4v13h5.286C27.918 19 28.235 19.765 27.788 20.212z" fill={downColor} />
          </svg>
        </div>
      );
    };

    const handleSort = (key) => {
      setSortConfig((prev) => {
        if (prev.key === key) {
          if (prev.direction === "asc") return { key, direction: "desc" };
          return { key: null, direction: "asc" };
        }
        return { key, direction: "asc" };
      });
    };

    return (
      <div className="relative">
        {showScrollHint && (
          <div className="pointer-events-none absolute right-4 top-3 z-20 flex items-center justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_8px_18px_rgba(15,23,42,0.45)] ring-1 ring-black/5" style={{ transform: `translateX(${swipeOffset}px)` }}>
              <img src={swipeImg} alt="scroll hint" className="h-4 w-4" />
            </div>
          </div>
        )}
        <table className="min-w-[1300px] w-full text-left border-collapse text-[14.4px]">
          <thead className="bg-[#0B102A] text-white font-bold sticky top-0" style={{ zIndex: 50 }}>
            <tr className="h-[50px]">
              {visibleColumns.dr && (
                <th rowSpan={2} colSpan={visibleColumns.star ? 2 : 1} className="py-4 px-3 text-left sticky top-0 bg-[#0B102A] align-middle cursor-pointer relative" style={{ left: "0px", width: visibleColumns.star ? "195px" : "155px", minWidth: visibleColumns.star ? "195px" : "155px", zIndex: 110 }} onClick={() => handleSort("dr")}>
                  <div className="flex items-center gap-0.5">
                    <span className={visibleColumns.star ? "pl-8" : ""}>DR</span>
                    <SortIndicator colKey="dr" />
                  </div>
                  {sortConfig.key === "dr" && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2F80ED]" style={{ zIndex: 120 }}>
                      <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-[#2F80ED]"></div>
                    </div>
                  )}
                </th>
              )}
              {visibleTradingCount > 0 && <th colSpan={visibleTradingCount} className="py-3 text-center bg-[#020323]">Trading information</th>}
              {visibleFundamentalCount > 0 && <th colSpan={visibleFundamentalCount} className="py-3 text-center bg-[#020323] border-l border-gray-200">Basic DR information</th>}
            </tr>
            <tr className="h-[50px]">
              {[...tradingKeys, ...fundamentalKeys].map(key => visibleColumns[key] && (
                <th key={key} className={`py-3 px-4 ${textCols.includes(key) ? "text-left" : "text-right"} bg-[#1C1D39] border-b border-gray-200 whitespace-nowrap cursor-pointer relative ${fundamentalKeys.includes(key) && key === firstVisibleFundamentalKey ? 'border-l border-gray-200' : ''}`} onClick={() => handleSort(key)}>
                  <div className={`flex items-center ${textCols.includes(key) ? "justify-start" : "justify-end"} gap-0.5`}>
                    {key === "open" && "Open"}{key === "high" && "High"}{key === "low" && "Low"}{key === "last" && "Last"}{key === "change" && "Change"}{key === "pct" && "%Change"}{key === "bid" && "Bid"}{key === "offer" && "Offer"}{key === "vol" && "Volume"}{key === "value" && "Value('000)"}{key === "tradingSession" && "Trading Session"}
                    {key === "issuerName" && "Issuer"}{key === "marketCap" && "Market Cap (M)"}{key === "ytdChange" && "Change (YTD)"}{key === "ytdPercentChange" && "%Change (YTD)"}{key === "underlyingName" && "Underlying"}{key === "conversionRatio" && "Ratio"}{key === "divYield" && "Div. Yield"}{key === "exchange" && "Underlying Exchange"}{key === "securityTypeName" && "Foreign Security Type"}{key === "outstandingShare" && "Outstanding Share"}
                    <SortIndicator colKey={key} />
                  </div>
                  {sortConfig.key === key && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2F80ED]" style={{ zIndex: 120 }}>
                      <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-[#2F80ED]"></div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sortedData.map((row, index) => renderRow(row, index))}
          </tbody>
        </table>
      </div>
    );
  };

  /* ───────────────────────────────────────────────
      SETTINGS MODAL
  ─────────────────────────────────────────────── */
  const [showAllChecked, setShowAllChecked] = useState(false);
  const toggleAllColumns = () => {
    const newState = !showAllChecked;
    setShowAllChecked(newState);
    const next = {};
    const allColumnKeys = ["star", "dr", "open", "high", "low", "last", "change", "pct", "bid", "offer", "vol", "value", "tradingSession", "issuerName", "marketCap", "underlyingName", "ytdChange", "ytdPercentChange", "conversionRatio", "divYield", "exchange", "securityTypeName", "outstandingShare"];
    allColumnKeys.forEach((k) => (next[k] = newState));
    setVisibleColumns(next);
  };
  const resetToDefault = () => {
    setVisibleColumns({
      star: true, dr: true, open: true, high: true, low: true, last: true, change: false, pct: true, bid: true, offer: true, vol: true, value: true,
      tradingSession: false, issuerName: false, marketCap: true, ytdChange: false, ytdPercentChange: false, underlyingName: true, conversionRatio: true,
      divYield: true, securityTypeName: true, exchange: true, outstandingShare: true,
    });
    setShowAllChecked(false);
  };
  const toggleColumn = (key) => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderSettingsModal = () => {
    if (!showSettings) return null;
    const tradingKeys = ["dr", "open", "high", "low", "last", "change", "pct", "bid", "offer", "vol", "value", "tradingSession"];
    const basicDrKeys = ["issuerName", "marketCap", "underlyingName", "ytdChange", "ytdPercentChange", "conversionRatio", "divYield", "exchange", "securityTypeName", "outstandingShare"];
    const renderColumnLabel = (key) => ({ star: "Star", dr: "DR", open: "Open", high: "High", low: "Low", last: "Last", change: "Change", pct: "%Change", bid: "Bid", offer: "Offer", vol: "Volume", value: "Value('000)", tradingSession: "Trading Session", issuerName: "Issuer", marketCap: "Market Cap (M)", underlyingName: "Underlying", ytdChange: "Change (YTD)", ytdPercentChange: "%Change (YTD)", conversionRatio: "Ratio", divYield: "Div. Yield", exchange: "Underlying Exchange", securityTypeName: "Foreign Security Type", outstandingShare: "Outstanding Share" }[key] || key);

    return (
      <div className="fixed inset-0 flex items-center justify-center z-[2000]" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setShowSettings(false)}>
        <div className="bg-white rounded-lg shadow-lg p-6 w-[520px] max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold text-black">Customize</h2><button onClick={() => setShowSettings(false)} className="text-2xl font-light text-gray-600 hover:text-black transition-colors">✕</button></div>
          <label className="flex items-center gap-3 mb-4 cursor-pointer"><input type="checkbox" checked={showAllChecked} onChange={toggleAllColumns} className="w-4 h-4 rounded border-gray-300" style={{ accentColor: '#0B102A' }} /><span className="text-sm font-medium text-gray-700">Show all</span></label>
          <div className="grid grid-cols-2 gap-6">
            <div><h3 className="text-sm font-bold text-black mb-3">Trading information</h3><div className="space-y-2">{tradingKeys.map((key) => (<label key={key} className={`flex items-center gap-2 ${key === 'dr' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}><input type="checkbox" checked={visibleColumns[key]} onChange={() => toggleColumn(key)} disabled={key === 'dr'} className={`w-4 h-4 rounded border-gray-300 ${key === 'dr' ? 'cursor-not-allowed' : ''}`} style={{ accentColor: key === 'dr' ? '#CCCCCC' : '#0B102A' }} /><span className={`text-xs ${key === 'dr' ? 'text-gray-400' : 'text-gray-700'}`}>{renderColumnLabel(key)}</span></label>))}</div></div>
            <div><h3 className="text-sm font-bold text-black mb-3">Basic DR information</h3><div className="space-y-2">{basicDrKeys.map((key) => (<label key={key} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={visibleColumns[key]} onChange={() => toggleColumn(key)} className="w-4 h-4 rounded border-gray-300" style={{ accentColor: '#0B102A' }} /><span className="text-xs text-gray-700">{renderColumnLabel(key)}</span></label>))}</div></div>
          </div>
          <div className="mt-6 flex justify-between items-center"><button onClick={resetToDefault} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors text-xs"><i className="bi bi-arrow-clockwise" style={{ fontSize: '16px', fontWeight: 'bold' }}></i><span>Reset to Default</span></button><div className="flex gap-2"><button onClick={() => setShowSettings(false)} className="px-4 py-1.5 bg-gray-300 text-gray-700 rounded font-medium text-xs hover:bg-gray-400 transition-colors w-20">Cancel</button><button onClick={() => setShowSettings(false)} className="px-4 py-1.5 bg-blue-500 text-white rounded font-medium text-xs hover:bg-blue-600 transition-colors w-20">OK</button></div></div>
        </div>
      </div>
    );
  };

  const renderTabs = () => {
    const handleMouseEnter = (tabType, e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top });
      setHoveredTab(tabType);
    };

    const handleMouseLeave = () => {
      setHoveredTab(null);
    };

    return (
      <div className="flex gap-4 mb-2 justify-between items-center">
        <div className="flex gap-4 relative">
          <button className={`pb-1 ${tab === "all" ? "border-b-2 border-black" : ""}`} onClick={() => { setTab("all"); trackFilter("tab", "All"); }}>All</button>
          <button
            className={`pb-1 relative flex items-center gap-1.5 ${tab === "popular" ? "border-b-2 border-black" : ""}`}
            onClick={() => { setTab("popular"); trackFilter("tab", "Most Popular"); }}
            onMouseEnter={(e) => handleMouseEnter("popular", e)}
            onMouseLeave={handleMouseLeave}
          >
            Most Popular
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-gray-500 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            className={`pb-1 relative flex items-center gap-1.5 ${tab === "sensitivity" ? "border-b-2 border-black" : ""}`}
            onClick={() => { setTab("sensitivity"); trackFilter("tab", "High Sensitivity"); }}
            onMouseEnter={(e) => handleMouseEnter("sensitivity", e)}
            onMouseLeave={handleMouseLeave}
          >
            High Sensitivity
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-gray-500 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-xs text-gray-500">
          <div>Found {sortedData.length.toLocaleString()} results</div>
          {lastUpdated && <div>Last Updated: {lastUpdated.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>}
        </div>
      </div>
    );
  };

  const renderDetailModal = () => {
    if (!detailRow) return null;
    const safe = (v, d = "-") => (v !== null && v !== undefined && v !== "" ? v : d);
    const symbolText = safe(detailRow.underlying || detailRow.underlyingName);
    const issuerShortText = safe(detailRow.issuer || detailRow.issuerName);

    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-[#0B102A]/40 backdrop-blur-md transition-opacity"
          onClick={() => setDetailRow(null)}
        ></div>

        <div className="relative w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-[0_18px_45px_rgba(0,0,0,0.25)] transform scale-[1.2]" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-3 border-b border-gray-200 px-6 pb-3 pt-5 md:flex-row md:items-start md:justify-between">
            <div className="pr-4">
              <h2 className="text-[22px] font-semibold leading-tight text-[#111827]">{safe(detailRow.dr)}</h2>
              <div className="mt-0.5 text-[12px] font-medium text-gray-800">Depositary Receipt on {symbolText} Issued by {issuerShortText}</div>
              <div className="mt-1 text-[11px] text-gray-500">ตราสารแสดงสิทธิในหลักทรัพย์ต่างประเทศ (DR) • {safe(detailRow.full?.underlyingName)}</div>
            </div>
            <div className="flex min-w-[190px] flex-col items-start gap-1 pt-1 text-left">
              <div className="flex w-full items-baseline justify-between"><span className="text-[11px] text-gray-500 w-[50px]">Last</span><span className="text-right text-[23px] font-semibold leading-none text-[#E53935]">{formatNum(detailRow.last)}</span></div>
              <div className="flex w-full items-baseline justify-between"><span className="text-[11px] text-gray-500 w-[50px]">Change</span><span className={`text-right text-[12px] font-semibold ${detailRow.change > 0 ? "text-[#27AE60]" : detailRow.change < 0 ? "text-[#E53935]" : "text-gray-700"}`}>{detailRow.change > 0 ? "+" : ""}{formatNum(detailRow.change)} ({detailRow.pct > 0 ? "+" : ""}{formatNum(detailRow.pct)}%)</span></div>
            </div>
          </div>
          <div className="space-y-3 bg-[#F5F5F5] px-6 pb-5 pt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm md:row-span-2">
                <div className="mb-2 text-[14px] font-semibold text-gray-900">Trading Snapshot</div>
                <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-y-1 text-[11px] text-gray-700">
                  <div>Open</div><div className="text-right text-gray-800 tabular-nums">{formatNum(detailRow.open)}</div>
                  <div>High</div><div className="text-right text-gray-800 tabular-nums">{formatNum(detailRow.high)}</div>
                  <div>Low</div><div className="text-right text-gray-800 tabular-nums">{formatNum(detailRow.low)}</div>
                  <div>Last</div><div className="text-right text-gray-800 tabular-nums">{formatNum(detailRow.last)}</div>
                  <div>Change</div><div className={`text-right tabular-nums font-semibold ${detailRow.change > 0 ? "text-[#27AE60]" : detailRow.change < 0 ? "text-[#E53935]" : "text-gray-800"}`}>{detailRow.change > 0 ? "+" : ""}{formatNum(detailRow.change)}</div>
                  <div>%Change</div><div className={`text-right tabular-nums font-semibold ${detailRow.pct > 0 ? "text-[#27AE60]" : detailRow.pct < 0 ? "text-[#E53935]" : "text-gray-800"}`}>{detailRow.pct > 0 ? "+" : ""}{formatNum(detailRow.pct)}</div>
                  <div>Bid</div><div className="text-right text-gray-800 tabular-nums">{formatNum(detailRow.bid)}</div>
                  <div>Offer</div><div className="text-right text-gray-800 tabular-nums">{formatNum(detailRow.offer)}</div>
                  <div>Volume</div><div className="text-right text-gray-800 tabular-nums">{formatInt(detailRow.vol)}</div>
                  <div>Value</div><div className="text-right text-gray-800 tabular-nums">{formatNum(detailRow.value)}('000)</div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                <div className="mb-2 text-[14px] font-semibold text-gray-900">DR Fundamental</div>
                <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-y-1 text-[11px] text-gray-700">
                  <div>Issuer</div><div className="text-left text-gray-900">{safe(detailRow.issuerName)}</div>
                  <div>Market Cap</div><div className="text-left text-gray-900">{detailRow.marketCap ? formatInt(detailRow.marketCap) : "-"}</div>
                  <div>Outstanding</div><div className="text-left text-gray-900">{detailRow.outstandingShare ? formatInt(detailRow.outstandingShare) : "-"}</div>
                  <div>IPO</div><div className="text-left text-gray-900">{safe(detailRow.full?.ipo)}</div>
                  <div>Conversion</div><div className="text-left text-gray-900">{safe(detailRow.ratio)}</div>
                  <div>Dividend Yield</div><div className="text-left text-gray-900">{detailRow.divYield ? `${formatNum(detailRow.divYield)}%` : "-"}</div>
                  <div>Security Type</div><div className="text-left text-gray-900">{safe(detailRow.securityTypeName)}</div>
                  <div>Trading Session</div><div className="text-left text-gray-900">{safe(detailRow.tradingSession)}</div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                <div className="mb-2 text-[14px] font-semibold text-gray-900">Reference &amp; Links</div>
                <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-y-1 text-[11px] text-gray-700">
                  <div>Underlying</div><div className="text-left text-gray-900">{safe(detailRow.full?.underlyingName)}</div>
                  <div>Underlying Exchange</div><div className="text-left text-gray-900">{safe(detailRow.exchange)}</div>
                  <div>First Trade</div><div className="text-left text-gray-900">{detailRow.full?.firstTradeDate ? new Date(detailRow.full.firstTradeDate).toLocaleDateString('en-GB') : "-"}</div>
                  <div>composite Ref</div><div className="text-left text-gray-900">{safe(detailRow.full?.compositeRef)}</div>
                </div>
              </div>
            </div>
            <div className="mt-1 flex justify-end">
              <button className="rounded-md bg-[#E5E7EB] px-6 py-1.5 text-[12px] font-medium text-gray-800 transition-colors hover:bg-[#D1D5DB]" onClick={() => setDetailRow(null)}>close</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-[#f5f5f5] overflow-hidden flex justify-center">
      <div className="w-full max-w-[1248px] flex flex-col h-full">
        <div className="pt-10 pb-0 px-0 flex-shrink-0" style={{ overflow: 'visible', zIndex: 100 }}>
          <div className="w-[1040px] max-w-full mx-auto scale-[1.2] origin-top" style={{ overflow: 'visible' }}>
            <h1 className="text-3xl font-bold mb-3 text-black">DR List</h1>
            <p className="text-[#6B6B6B] mb-8 text-left text-sm md:text-base">
              Track latest DR movements and trading stats.
            </p>
            {renderControlBar()}
            {renderTabs()}
          </div>
        </div>

        {/* Main Table - Scrollable (ไม่ถูก scale แต่ขยายฟอนต์ให้ใหญ่ขึ้นแทน) */}
        <div className="flex-1 overflow-hidden pb-10 mt-10">
          <div className="h-full bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-gray-100 overflow-auto">
            {loading ? (
              <div className="p-10 text-center text-gray-600">Loading...</div>
            ) : (
              renderTable()
            )}
          </div>
        </div>
      </div>


      {/* ✅ ย้าย Modal ออกมานอกกล่องที่ถูก scale */}
      {renderSettingsModal()}
      {renderDetailModal()}

      {hoveredTab && (
        <div
          className="fixed z-[10000] pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-50%, calc(-100% - 12px))',
            animation: 'tooltipFadeIn 0.2s ease-out'
          }}
        >
          <div className={`absolute inset-0 blur-xl rounded-2xl ${hoveredTab === "popular"
            ? "bg-gradient-to-r from-black-500/15 via-emerald-500/15 to-black-500/15"
            : "bg-gradient-to-r from-black-500/15 via-cyan-500/15 to-black-500/15"
            }`}></div>

          {/* Main Tooltip */}
          <div className="relative px-5 py-4 rounded-xl backdrop-blur-md bg-gradient-to-br from-white/95 via-white/90 to-white/85 border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.12)] max-w-md">
            {/* Shine Effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent rounded-xl pointer-events-none"></div>

            {/* Content */}
            <div className="relative">
              {hoveredTab === "popular" && (
                <div className="text-center">
                  {/* Title */}
                  <div className="font-bold text-gray-900 mb-2 text-base bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Most Popular DR</div>
                  <div className="text-sm text-gray-700 leading-relaxed space-y-1">
                    <div>จัดอันดับ DR ที่ได้รับความนิยมสูงสุดในแต่ละ Underlying</div>
                    <div>โดยวัดจากปริมาณการซื้อขาย <span className="font-semibold text-green-600">(Volume)</span> ที่มากที่สุด</div>
                  </div>
                </div>
              )}
              {hoveredTab === "sensitivity" && (
                <div className="text-center">
                  {/* Title */}
                  <div className="font-bold text-gray-900 mb-2 text-base bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">High Sensitivity DR</div>
                  <div className="text-sm text-gray-700 leading-relaxed space-y-1">
                    <div>จัดอันดับ DR ที่มีความเคลื่อนไหวโดดเด่นที่สุดในแต่ละ Underlying</div>
                    <div>โดยวัดจากราคาเสนอซื้อ <span className="font-semibold text-blue-600">(Bid)</span> ที่ต่ำที่สุด</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px">
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white/90"></div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: translate(-50%, calc(-100% - 8px)) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translate(-50%, calc(-100% - 12px)) scale(1);
          }
        }
      `}</style>
    </div>
  );
}