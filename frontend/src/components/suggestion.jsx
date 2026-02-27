import React, { useState, useEffect, useMemo, useRef } from "react";
import { trackPageView, trackFilter, trackSearch } from "../utils/tracker";
import { HistorySkeleton, TableSkeleton, CardSkeleton } from "./SkeletonLoader";


const API_URL = import.meta.env.VITE_DR_LIST_API;
const RATINGS_API = import.meta.env.VITE_RATINGS_API;

// 🔧 MOCK DATA FLAG - ตั้งเป็น true เพื่อใช้ mock data สำหรับทดสอบ winrate
// เมื่อต้องการใช้ข้อมูลจริง ให้เปลี่ยนกลับเป็น false
const USE_MOCK_DATA = false;
// const MOCK_RATINGS_API = "http://172.18.1.56:8335/api/mock-rating-history/aapl";

// --- Constants & Helpers ---
const countryOptions = [
  { code: "All", label: "All Markets", flag: null },
  { code: "US", label: "US United States", flag: "us" },
  { code: "HK", label: "HK Hong Kong", flag: "hk" },
  { code: "DK", label: "DK Denmark", flag: "dk" },
  { code: "NL", label: "NL Netherlands", flag: "nl" },
  { code: "FR", label: "FR France", flag: "fr" },
  { code: "IT", label: "IT Italy", flag: "it" },
  { code: "JP", label: "JP Japan", flag: "jp" },
  { code: "SG", label: "SG Singapore", flag: "sg" },
  { code: "TW", label: "TW Taiwan", flag: "tw" },
  { code: "CN", label: "CN China", flag: "cn" },
  { code: "VN", label: "VN Vietnam", flag: "vn" },
];

const RATING_SCORE = {
  "strong buy": 5,
  "buy": 4,
  "neutral": 3,
  "sell": 2,
  "strong sell": 1,
  "unknown": 0
};

const getCountryFromExchange = (exchange = "") => {
  if (!exchange) return "OTHER";
  const ex = exchange.toUpperCase();
  if (ex.includes("MILAN")) return "IT";
  if (ex.includes("COPENHAGEN")) return "DK";
  if (ex.includes("EURONEXT") || ex.includes("PARIS") || ex.includes("AMSTERDAM")) {
    if (ex.includes("PARIS")) return "FR";
    if (ex.includes("AMSTERDAM")) return "NL";
    return "FR";
  }
  if (ex.includes("HONG KONG")) return "HK";
  if (ex.includes("VIETNAM") || ex.includes("HOCHIMINH")) return "VN";
  if (ex.includes("TOKYO") || ex.includes("JAPAN")) return "JP";
  if (ex.includes("SINGAPORE")) return "SG";
  if (ex.includes("TAIWAN")) return "TW";
  if (ex.includes("CHINA") || ex.includes("SHENZHEN")) return "CN";
  return "US";
};

const getRatingStyle = (rating) => {
  if (!rating) return "bg-gray-100 dark:bg-white/5 text-gray-400";
  const r = rating.toLowerCase();
  if (r === "strong buy") return "bg-[#E6F4EA] text-[#137333] dark:bg-[#4CE60F]/10 dark:text-[#4CE60F] dark:border dark:border-[#4CE60F]/20";
  if (r === "buy") return "text-[#137333] dark:text-[#4CE60F]";
  if (r === "neutral") return "text-[#3C4043] dark:text-white/70";
  if (r === "sell") return "text-[#A50E0E] dark:text-[#EB5757]";
  if (r === "strong sell") return "bg-[#FCE8E6] text-[#A50E0E] dark:bg-[#EB5757]/10 dark:text-[#EB5757] dark:border dark:border-[#EB5757]/20";
  return "bg-transparent text-gray-400";
};

const getRatingTextColor = (rating) => {
  if (!rating) return "text-[#9CA3AF]";
  const r = rating.toLowerCase();
  if (r === "strong buy" || r === "buy") return "text-[#137333] dark:text-[#4CE60F]";
  if (r === "neutral") return "text-[#5F6368] dark:text-white/60";
  if (r === "sell" || r === "strong sell") return "text-[#A50E0E] dark:text-[#EB5757]";
  return "text-[#9CA3AF]";
};

// Helper function to filter out Neutral and Unknown from history
const filterNeutralFromHistory = (history) => {
  if (!history || history.length === 0) return [];
  return history.filter(item => {
    const rating = item.rating?.toLowerCase();
    const prev = item.prev?.toLowerCase();
    // Skip Neutral or Unknown ratings
    if (rating === "neutral" || rating === "unknown" || prev === "unknown") {
      return false;
    }
    return true;
  });
};

const formatSmartTime = (isoString) => {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (isNaN(date)) return "-";

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

const getShortName = (item) => {
  let name = item.underlyingName && item.underlyingName !== "-" ? item.underlyingName : (item.name || "");
  name = name.replace(/[\u0E00-\u0E7F]/g, "").replace(/\s*\(.*?\)/g, "").replace(/Depositary Receipt on /i, "").split(" Issued by")[0].replace(/[-.]+$/, "");
  return name.replace(/\s+/g, " ").trim();
};

const formatPrice = (n) => {
  const num = Number(n);
  if (!isFinite(num)) return "0.00";
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPct = (n) => {
  const num = Number(n);
  if (!isFinite(num)) return "0.00";
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatInt = (n) => {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  return Math.round(num).toLocaleString();
};

const renderPriceWithCurrency = (price, currency) => {
  return (
    <div className="flex items-baseline justify-end gap-0.5">
      <span className="font-medium text-gray-800 dark:text-white text-xs sm:text-[14.4px] font-mono">{formatPrice(price)}</span>
      <span className="text-xs sm:text-[14.4px] text-gray-600 dark:text-white/80 font-normal uppercase">{currency}</span>
    </div>
  );
};

// --- Components ---

const FilterDropdown = ({ label, value, options, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => { if (ref.current && !ref.current.contains(event.target)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const currentLabel = options.find(o => o.val === value)?.label || value;
  return (
    <div className="relative z-60 flex-1 sm:flex-initial sm:w-auto" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-white dark:bg-[#595959] dark:border-none dark:text-white border border-gray-200 rounded-xl text-xs sm:text-sm w-full sm:min-w-[140px] md:min-w-[180px] hover:border-gray-300 transition-colors shadow-sm h-[37.33px] dark:hover:bg-[#4A4A4A]">
        <span className="text-gray-800 dark:text-white font-medium truncate">{currentLabel}</span>
        <svg className={`h-4 w-4 shrink-0 transition-transform text-gray-500 dark:text-white ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-[#595959] dark:border-none dark:text-white border border-gray-100 rounded-xl shadow-lg z-200 py-1 overflow-auto hide-scrollbar max-h-60">
          {options.map((opt) => (
            <button key={opt.val} onClick={() => { onSelect(opt.val); setIsOpen(false); }} className={`w-full text-left px-4 py-1.5 text-xs sm:text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#4A4A4A] ${value === opt.val ? "text-[#0B102A] font-semibold bg-gray-50 dark:bg-[#4A4A4A] dark:text-white" : "text-gray-800 dark:text-white"}`}>
              {opt.color && <span className={`w-2 h-2 rounded-full ${opt.color}`}></span>}{opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const RatingChangeCell = ({ prev, current, showChange }) => {
  if (!current || current === "Unknown") return <span className="text-gray-300 text-xs sm:text-sm">-</span>;
  const prevDisplay = prev && prev !== "Unknown" ? prev : "-";
  const prevTextColor = prev && prev !== "Unknown" ? getRatingTextColor(prev) : "text-gray-400";
  const shouldShowPrev = showChange;

  return (
    <div className="flex items-center justify-center h-full relative">
      <div className={`flex items-center gap-1.5 sm:gap-2.5 transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${shouldShowPrev ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}>
        <div className={`text-[11px] sm:text-[14.4px] font-bold text-center ${prevTextColor}`} style={{ minWidth: '80px', width: '80px' }}>
          <span className="whitespace-nowrap text-[10px] sm:text-sm">
            {prevDisplay}
          </span>
        </div>
        <div className="flex items-center justify-center mx-1 sm:mx-1.5" style={{ minWidth: '20px', width: '20px' }}>
          <svg className="w-3 h-3 sm:w-4 sm:h-4 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
      </div>
      <div className="flex justify-center ml-1.5 sm:ml-2.5" style={{ minWidth: '80px', width: '80px' }}>
        <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-[14.4px] font-bold whitespace-nowrap text-center transition-all duration-500 ${getRatingStyle(current)}`}>
          {current}
        </span>
      </div>
    </div>
  );
};

// --- Tooltip Component ---
const Tooltip = ({ show, position, children }) => {
  if (!show || !position) return null;

  return (
    <div
      className="fixed z-5000 pointer-events-none transition-opacity duration-200 hidden sm:block"
      style={{
        left: `${position.x}px`,
        top: `${position.y - 10}px`,
        transform: 'translate(-50%, -100%)',
        opacity: show ? 1 : 0
      }}
    >
      <div className="bg-[#0B102A] text-white text-xs font-medium px-3 py-2 rounded-lg shadow-xl border border-white/10 backdrop-blur-sm whitespace-nowrap relative">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-blue-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-blue-50">{children}</span>
        </div>
        <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-6 border-l-transparent border-r-6 border-r-transparent border-t-6 border-t-[#0B102A]"></div>
      </div>
    </div>
  );
};

// --- RatingHistoryModal ---
const RatingHistoryModal = ({ item, timeframe, onClose }) => {
  const [mode, setMode] = useState('intraday'); // Default to 'intraday'
  const [filterRating, setFilterRating] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [accuracy, setAccuracy] = useState({ accuracy: 0, correct: 0, incorrect: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  // Initialize header values from the table's selected row (use the processed/display fields)
  const [currentPrice, setCurrentPrice] = useState(item?.sortPrice ?? item?.last ?? 0);
  const [currentChange, setCurrentChange] = useState(item?.displayChange ?? item?.change ?? 0);
  const [currentChangePercent, setCurrentChangePercent] = useState(item?.displayPct ?? item?.percentChange ?? 0);
  const [currentRating, setCurrentRating] = useState(
    timeframe === "1W" ? (item?.ratingWeek ?? item?.technicalRating ?? "Unknown") : (item?.ratingDay ?? item?.technicalRating ?? "Unknown")
  );
  const [logoError, setLogoError] = useState(false);

  // Store raw history data (unfiltered)
  const [rawHistoryData, setRawHistoryData] = useState([]);

  // Function to convert company name to TradingView logo format
  const getLogoSlug = (name) => {
    if (!name) return '';

    let cleanName = name;

    // Remove Thai text (บริษัท or หุ้นสามัญของบริษัท)
    cleanName = cleanName.replace(/^(บริษัท|หุ้นสามัญของบริษัท)\s*/i, '');

    // Extract company name before parentheses (AMZN) or other markers
    // "AMAZON.COM, INC. (AMZN)" -> "AMAZON.COM, INC."
    cleanName = cleanName.replace(/\s*\([^)]+\)\s*$/g, '');

    // Special handling for company names with multiple parts separated by comma
    // "BECTON, DICKINSON AND COMPANY" -> keep "BECTON, DICKINSON"
    // "AMAZON.COM, INC." -> "AMAZON"

    // First, check if it has .COM or .INC before comma
    const comMatch = cleanName.match(/^([A-Z][A-Z0-9&]*?)\.(?:COM|INC)/i);
    if (comMatch) {
      // For "AMAZON.COM, INC." -> "AMAZON" (remove .COM/.INC)
      cleanName = comMatch[1];
    } else {
      // For other cases, check for comma pattern
      const commaMatch = cleanName.match(/^([A-Z][A-Z0-9&\s]*?),\s*([A-Z][A-Z0-9&\s]*?)(?:,|\s+(?:AND|&)\s+)/i);
      if (commaMatch) {
        // For "BECTON, DICKINSON AND COMPANY" -> "BECTON, DICKINSON"
        cleanName = commaMatch[1] + ', ' + commaMatch[2];
      } else {
        // For simple cases, extract first word before comma or space
        const simpleMatch = cleanName.match(/^([A-Z][A-Z0-9&]*?)(?:\s*,|\s+)/i);
        if (simpleMatch) {
          cleanName = simpleMatch[1];
        }
      }
    }

    // Quick special-cases for TradingView
    try {
      const up = String(name || '').toUpperCase();
      if (/LAOPU\s*GOLD/i.test(up)) return 'laopu-gold-co-ltd';
      if (/MOBILE\s*WORLD/i.test(up)) return 'mobile-world-investment-corporation';
      if (/TRIP\.COM|CTRIP/i.test(up)) return 'ctrip-com-international';
      if (/HONG\s*KONG\s*EXCHANGES|HKEX/i.test(up)) return 'hkex';
      if (/MONSTER\s*BEVERAGE/i.test(up)) return 'monster-beverage';
      if (/PALO\s*ALTO/.test(up) || /PALOALTO/.test(up)) return 'palo-alto-networks';
    } catch (e) { /* ignore */ }

    // Convert to lowercase
    let slug = cleanName.toLowerCase();

    // Remove common suffixes (iterative removal for nested cases)
    const suffixes = [
      'incorporated', 'incorporation', 'corporation', 'corp',
      'company', 'limited', 'ltd', 'plc', 'group', 'holdings', 'holding',
      'international', 'technologies', 'technology', 'tech',
      'systems', 'solutions', 'software', 'inc', 'co'
    ];

    for (let i = 0; i < 3; i++) {
      suffixes.forEach(suffix => {
        const regex = new RegExp(`\\b${suffix}\\.?\\b`, 'gi');
        slug = slug.replace(regex, ' ');
      });
      slug = slug.replace(/\s+/g, ' ').trim();
    }

    // Clean up: replace spaces with hyphens, remove special characters
    slug = slug
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug;
  };

  useEffect(() => {
    if (!item) return;

    async function fetchHistory() {
      setLoading(true);
      try {
        const ticker = item.displaySymbol || item.symbol;
        let data = null;
        if (mode === "intraday") {
          // ดึงจาก /api/intraday-history/{ticker}?timeframe=...
          const baseUrl = import.meta.env.VITE_HISTORY_API;
          const url = `${baseUrl}/api/intraday-history/${ticker}?timeframe=${timeframe}`;
          console.log("🔍 Fetching INTRADAY from URL:", url);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const apiData = await response.json();
          data = { history: apiData.intraday_history };
        } else {
          // ดึงแบบเดิม (daily)
          const baseUrl = import.meta.env.VITE_HISTORY_API;// http://localhost:8000/ratings
          const tf = timeframe === "1W" ? "1W" : "1D";
          // Use relative path from the base URL (which already contains /ratings prefix if configured)
          // If baseUrl is http://localhost:8000/ratings, we just need /history-with-accuracy/...
          // But to be safe and avoid double slash, lets just check.
          // Correct endpoint is http://localhost:8000/ratings/history-with-accuracy/{ticker}

          // Since VITE_HISTORY_API is now http://localhost:8000/ratings
          // We should append /history-with-accuracy

          // const url = `${baseUrl}/ratings/history-with-accuracy/${ticker}?timeframe=${tf}&mode=${mode}`;
          const url = `${baseUrl}/history-with-accuracy/${ticker}?timeframe=${tf}`;
          console.log("🔍 Fetching from URL:", url);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          data = await response.json();
        }

        if (data && Array.isArray(data.history) && data.history.length > 0) {
          setRawHistoryData(data.history);
          setAccuracy(data.accuracy ?? { accuracy: 0, correct: 0, incorrect: 0, total: 0 });
        } else {
          setRawHistoryData([]);
          setAccuracy(data?.accuracy ?? { accuracy: 0, correct: 0, incorrect: 0, total: 0 });
        }
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [item, timeframe, mode]);

  // Filter history data based on filterRating (client-side filtering)
  // Use the same strength+threshold logic as backend (CHANGE_THRESHOLD=2.0)
  useEffect(() => {
    if (!rawHistoryData || rawHistoryData.length === 0) {
      setHistoryData([]);
      setAccuracy({ accuracy: 0, correct: 0, incorrect: 0, total: 0 });
      return;
    }

    // สร้าง enriched history โดยคำนวณค่า open-based change percent
    // Important: build ordered array newest-first so pairing (Exit = newest, Entry = previous) aligns correctly
    // Use explicit sort by timestamp/date descending to avoid depending on API order
    const ordered = (rawHistoryData || []).slice().sort((a, b) => {
      const at = new Date(a.timestamp ?? a.date).getTime() || 0;
      const bt = new Date(b.timestamp ?? b.date).getTime() || 0;
      return bt - at; // newest first
    });
    const enriched = ordered.map((curr, idx, arr) => {
      const next = arr[idx + 1] || {}; // next is older item (Entry)
      // Include price as a fallback so Entry shows correct value when 'open' is null
      const prev_open = (next && (next.at_price ?? next.open ?? next.prev_close ?? next.result_price ?? next.price)) ?? null;
      // Normalize rating fields so UI can show Signal: prev -> curr
      const ratingNow = curr.daily_rating ?? curr.rating ?? curr.dailyRating ?? curr.rating_day ?? null;
      // Prefer the explicit 'prev' value on the current record if provided,
      // otherwise fall back to the next (older) record's rating.
      const ratingPrev = curr.prev ?? next.daily_rating ?? next.rating ?? next.dailyRating ?? next.rating_day ?? null;
      // DEBUG: log prev value for troubleshooting
      // console.log('DEBUG prev:', ratingPrev, 'raw:', next);
      const prev_timestamp = next.timestamp ?? next.date ?? null;
      const curr_open = (curr.at_price ?? curr.open ?? curr.result_price ?? curr.price) ?? null;
      let change_pct_open = null;
      let change_abs_open = null;
      if (prev_open != null && curr_open != null && Number(prev_open) !== 0) {
        change_abs_open = Number(curr_open) - Number(prev_open);
        change_pct_open = (change_abs_open / Number(prev_open)) * 100;
      }

      return {
        ...curr,
        // signal fields used by UI
        rating: ratingNow,
        prev: ratingPrev,
        prev_timestamp: prev_timestamp,
        prev_open: prev_open,
        result_open: curr_open,
        change_pct_open: change_pct_open, // may be null
        change_abs_open: change_abs_open,
      };
    });

    // Filter out neutral/unknown as before (works because fields preserved)
    let filtered = filterNeutralFromHistory(enriched);

    // If in intraday mode, only show items from the latest timestamp's date (use overall newest item)
    if (mode === 'intraday' && enriched.length > 0) {
      const latestOverall = enriched[0]; // enriched is sorted newest-first
      const latestDate = new Date(latestOverall.timestamp ?? latestOverall.date);
      if (!isNaN(latestDate.getTime())) {
        const latestDay = latestDate.toDateString();
        filtered = filtered.filter(it => {
          const d = new Date(it.timestamp ?? it.date);
          return !isNaN(d.getTime()) && d.toDateString() === latestDay;
        });
      }
    }

    // Remove entries where prev_open is missing or zero — frontend should skip these
    // (backend uses 0 when prev_open is not available). Keep only items
    // where prev_open is present and non-zero to allow open-to-open comparisons.
    filtered = filtered.filter(item => (item.prev_open != null) && Number(item.prev_open) !== 0);

    // Apply rating filter after restricting to the day's entries so filters only consider that day
    if (filterRating) filtered = filtered.filter(item => item.rating === filterRating);

    // `enriched` is newest-first and `filtered` now contains only same-day items when in intraday mode
    setHistoryData(filtered);

    // คำนวณ accuracy โดยใช้ข้อมูลที่จะแสดง (filtered)
    const acc = calculateAccuracy(filtered, 2.0);
    setAccuracy(acc);
  }, [rawHistoryData, filterRating]);

  // Calculate accuracy based on history rows
  const calculateAccuracy = (historyRows, changeThreshold = 2.0) => {
    if (!historyRows || historyRows.length === 0) {
      return { accuracy: 0, correct: 0, incorrect: 0, total: 0 };
    }

    let correct = 0;
    let incorrect = 0;

    const strengthMap = {
      "strong sell": -2,
      "sell": -1,
      "neutral": 0,
      "buy": 1,
      "strong buy": 2
    };

    const ratingStrength = (rtext) => {
      if (!rtext) return null;
      const rl = String(rtext).toLowerCase().trim();
      if (rl in strengthMap) return strengthMap[rl];
      if (rl.includes("strong") && rl.includes("sell")) return strengthMap["strong sell"];
      if (rl.includes("strong") && rl.includes("buy")) return strengthMap["strong buy"];
      if (rl.includes("sell")) return strengthMap["sell"];
      if (rl.includes("buy")) return strengthMap["buy"];
      if (rl.includes("neutral")) return strengthMap["neutral"];
      return null;
    };

    // Use index-based iteration to allow open-based calculation from consecutive rows
    for (let i = 0; i < historyRows.length; i++) {
      const row = historyRows[i];
      // support different key names from API / storage
      const ratingRaw = row.daily_rating ?? row.rating ?? row.dailyRating ?? row.rating_day ?? null;
      const prevRaw = row.daily_prev ?? row.prev ?? row.dailyPrev ?? row.prev_rating ?? null;

      // Prefer open-based change if available; otherwise fallback to existing change_pct
      let changeVal = null;
      if (row.change_pct_open != null && !Number.isNaN(Number(row.change_pct_open))) {
        changeVal = Number(row.change_pct_open);
      } else if (row.change_pct != null && !Number.isNaN(Number(row.change_pct))) {
        changeVal = Number(row.change_pct);
      } else if (row.changePct != null && !Number.isNaN(Number(row.changePct))) {
        changeVal = Number(row.changePct);
      } else if (row.change != null && !Number.isNaN(Number(row.change))) {
        changeVal = Number(row.change);
      } else {
        // If no reliable change value, try to compute from this row and next row open values
        const next = historyRows[i + 1] || {};
        const prev_open = next.open ?? next.prev_close ?? next.result_price ?? next.prev_open ?? null;
        const curr_open = row.open ?? row.result_price ?? row.price ?? null;
        if (prev_open != null && curr_open != null && Number(prev_open) !== 0) {
          changeVal = ((Number(curr_open) - Number(prev_open)) / Number(prev_open)) * 100;
        }
      }

      if (changeVal === null || changeVal === undefined) continue;

      if (!ratingRaw || !prevRaw) continue;

      const strNow = ratingStrength(ratingRaw);
      const strPrev = ratingStrength(prevRaw);

      if (strNow === null || strPrev === null) continue;

      const delta = strNow - strPrev;

      // ข้ามถ้า rating ไม่เปลี่ยนและ price ไม่เปลี่ยน (threshold 0.01% เหมือน backend)
      const ratingNotChanged = String(ratingRaw).toLowerCase().trim() === String(prevRaw).toLowerCase().trim();
      const priceNotChanged = Math.abs(changeVal) < 0.01;
      if (ratingNotChanged && priceNotChanged) continue;

      let isCorrect = false;
      if (delta > 0) {
        isCorrect = (changeVal >= changeThreshold);
      } else if (delta < 0) {
        isCorrect = (changeVal <= -changeThreshold);
      } else {
        if (strNow > 0) {
          isCorrect = (changeVal >= changeThreshold);
        } else if (strNow < 0) {
          isCorrect = (changeVal <= -changeThreshold);
        } else {
          continue;
        }
      }

      if (isCorrect) correct += 1; else incorrect += 1;
    }

    const total = correct + incorrect;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;

    return {
      accuracy: Math.round(accuracy),
      correct,
      incorrect,
      total,
    };
  };

  if (!item) return null;

  const handleRatingFilterClick = (rating) => {
    setFilterRating(filterRating === rating ? null : rating);
  };

  const formatModalDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;

      const day = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const year = d.getFullYear();
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();

      return `${day} ${month} ${year}${isToday ? " • Today" : ""}`;
    } catch {
      return dateStr;
    }
  };

  const formatModalTime = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-2000 flex items-center justify-center p-2 sm:p-4 pt-20 sm:pt-24 overflow-y-auto hide-scrollbar">
      <div className="fixed inset-0 bg-[#0B102A]/40 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-[#10172A] dark:border-white/10 dark:text-white w-full max-w-[600px] max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl shadow-2xl mx-auto">

        {/* Header Section - Dark Theme */}
        <div className="bg-[#0B102A] px-3 sm:px-6 py-3 sm:py-5">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 sm:w-14 sm:h-14 flex items-center justify-center shrink-0 overflow-hidden">
                {!logoError ? (
                  <img
                    src={(() => {
                      const companyName = item.underlyingName || item.displayName || item.description || '';
                      const slug = getLogoSlug(companyName);
                      const url = `https://s3-symbol-logo.tradingview.com/${slug}.svg`;
                      console.log('📸 Company:', companyName);
                      console.log('📸 Logo Slug:', slug);
                      console.log('📸 Logo URL:', url);
                      return url;
                    })()}
                    alt={item.displaySymbol}
                    className="w-full h-full object-contain rounded-xl"
                    onError={() => {
                      console.log('❌ Logo failed to load for:', item.displaySymbol);
                      setLogoError(true);
                    }}
                    onLoad={() => console.log('✅ Logo loaded successfully for:', item.displaySymbol)}
                  />
                ) : (
                  <span className="text-white text-base sm:text-xl font-bold">{item.displaySymbol?.[0] || "?"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg sm:text-[26px] font-bold text-white truncate">{item.displaySymbol}</h3>
                <p className="text-[11px] sm:text-sm text-gray-400 mt-0 truncate">{item.displayName}</p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className="text-base sm:text-[22px] font-bold text-white">${formatPrice(currentPrice)}</div>
              <div className={`text-[10px] sm:text-sm font-medium mt-0 ${currentChangePercent >= 0 ? "text-[#27AE60] dark:text-[#4CE60F]" : "text-[#EB5757] dark:text-[#EB5757]"}`}>
                {currentChange >= 0 ? "+" : ""}{formatPrice(currentChange)} ({currentChangePercent >= 0 ? "+" : ""}{formatPct(currentChangePercent)}%)
              </div>
            </div>
          </div>



          {/* Filter Accuracy Section */}
          <div>

            {/* Rating Buttons */}
            <div className="flex gap-1.5 sm:gap-2 mb-2 overflow-x-auto pb-1">
              {["Strong Sell", "Sell", "Buy", "Strong Buy"].map((rating) => {
                const isSelected = filterRating === rating;
                const isSell = rating === "Sell" || rating === "Strong Sell";
                const isBuy = rating === "Buy" || rating === "Strong Buy";

                let selectedClasses = "";
                if (isSelected) {
                  if (isSell) {
                    selectedClasses = "bg-[#EB5757]/20 border-[#EB5757] text-[#EB5757] dark:border-[#EB5757] dark:text-[#EB5757]";
                  } else if (isBuy) {
                    selectedClasses = "bg-[#27AE60]/20 border-[#27AE60] text-[#27AE60] dark:bg-[#4CE60F]/20 dark:border-[#4CE60F] dark:text-[#4CE60F]";
                  }
                } else {
                  selectedClasses = "bg-transparent border-gray-600 text-gray-300 hover:border-gray-500";
                }

                return (
                  <button
                    key={rating}
                    onClick={() => handleRatingFilterClick(rating)}
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold border-2 transition-all whitespace-nowrap ${selectedClasses}`}
                  >
                    {rating}
                  </button>
                );
              })}
            </div>

            {/* Accuracy Metrics */}
            <div className="border border-gray-600 rounded-lg p-2 sm:p-3 bg-gray-800/50">
              <div className="flex items-center gap-4 sm:gap-8">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="text-center px-2 sm:px-4">
                    <div className="text-2xl sm:text-3xl font-bold text-[#EB5757]">{Math.round(accuracy.accuracy)}%</div>
                    <div className="text-[10px] sm:text-xs text-white mt-0.5 sm:mt-1">accuracy</div>
                  </div>
                  <div className="h-8 sm:h-12 w-px bg-gray-50 dark:bg-[#0B102A]0"></div>
                </div>
                <div className="flex flex-col gap-1.5 sm:gap-2 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#27AE60] dark:bg-[#4CE60F]"></div>
                    <span className="text-white font-medium text-[11px] sm:text-sm">Correct : {accuracy.correct}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-[#EB5757] dark:bg-[#EB5757]"></div>
                    <span className="text-white font-medium text-[11px] sm:text-sm">Incorrect : {accuracy.incorrect}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Section - Light Theme */}
        <div className="bg-white dark:bg-[#2D3136] dark:border-white/10 dark:text-white p-3 sm:p-6 pb-20 sm:pb-24 max-h-[50vh] sm:max-h-[50vh] overflow-y-auto hide-scrollbar">
          <div className="sm:mb-7 mb-4 flex items-center justify-center">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setMode('intraday')}
                className={`w-1/2 sm:w-[263px] h-9 sm:h-[47px] rounded-lg text-[10px] sm:text-sm font-semibold px-0 py-0 sm:px-4 sm:py-0 shadow-md transition ${mode === 'intraday' ? 'bg-[#0B102A] text-white' : 'bg-white dark:bg-white/10 dark:border-white/20 dark:text-white text-gray-700 border border-gray-200'}`}
              >
                Intraday (time)
              </button>
              <button
                onClick={() => setMode('daily')}
                className={`w-1/2 sm:w-[263px] h-9 sm:h-[47px] rounded-lg text-[10px] sm:text-sm font-semibold px-0 py-0 sm:px-4 sm:py-0 shadow-md transition ${mode === 'daily' ? 'bg-[#0B102A] text-white' : 'bg-white dark:bg-white/10 dark:border-white/20 dark:text-white text-gray-700 border border-gray-200'}`}
              >
                Daily (Open-to-Open)
              </button>
            </div>
          </div>
          {loading ? (
            <HistorySkeleton />
          ) : historyData.length > 0 ? (
            <div className="relative">
              <div className="space-y-6 sm:space-y-8 relative">
                {/* Vertical timeline line (behind the dots) */}
                <div className="absolute left-3.5 sm:left-4 top-0 bottom-30 sm:top-0 sm:bottom-35 w-px bg-gray-200" style={{ transform: 'translateX(-50%)' }} />
                {/* Limit daily (Open-to-Open) view to at most 10 rows */}
                {
                  (() => {
                    const displayed = (mode === 'daily') ? (historyData || []).slice(0, 10) : (historyData || []);
                    return (
                      <div>
                        {displayed.map((log, idx) => {
                          const scorePrev = RATING_SCORE[(log.prev || "").toLowerCase()] || 0;
                          const scoreCurr = RATING_SCORE[(log.rating || "").toLowerCase()] || 0;
                          const isPositive = (scoreCurr > scorePrev);
                          const isNegative = (scoreCurr < scorePrev);

                          let dotColor = "bg-gray-400";
                          if (isPositive) dotColor = "bg-[#27AE60] dark:bg-[#4CE60F]";
                          else if (isNegative) dotColor = "bg-[#EB5757] dark:bg-[#EB5757]";

                          const changePct = (log.change_pct_open ?? log.change_pct ?? log.changePct ?? log.change ?? 0);

                          return (
                            <div key={idx} className="relative pl-9 sm:pl-12">
                              {/* Timeline Dot and Date */}
                              <div className="flex items-center mb-1.5 sm:mb-2">
                                <div className={`absolute left-3.5 sm:left-4 w-7 h-7 sm:w-9 sm:h-9 rounded-full ${dotColor} flex items-center justify-center`} style={{ transform: 'translateX(-50%)' }}>
                                  <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white dark:bg-[#2D3136] dark:border-white/10 dark:text-white"></div>
                                </div>
                                <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">{formatModalDate(log.timestamp || log.date)}</span>
                              </div>

                              {/* Content Card */}
                              <div className="bg-white dark:bg-white/10 dark:border-white/10 dark:text-white rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-4 shadow-[0_10px_25px_rgba(0,0,0,0.3)]">
                                {/* Signal Change */}
                                <div className="mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                  <div className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-100 dark:bg-white/10 rounded text-[10px] sm:text-xs text-gray-600 dark:text-white font-medium">Signal</div>
                                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-bold whitespace-nowrap ${getRatingStyle(log.prev)}`}>{log.prev ?? log.rating ?? "Unknown"}</span>
                                  <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                  </svg>
                                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-bold whitespace-nowrap ${getRatingStyle(log.rating)}`}>{log.rating}</span>
                                </div>

                                {/* Horizontal Divider */}
                                <div className="border-b border-gray-300 mb-1.5 sm:mb-2"></div>

                                {/* Price Info */}
                                <div className="flex items-start justify-between text-xs sm:text-base">
                                  <div className="flex flex-col">
                                    <div className="text-[10px] sm:text-sm text-gray-500 dark:text-white/60 mb-0">{mode === 'intraday' ? 'Entry' : 'Open Price'}</div>
                                    <div className="text-[10px] sm:text-xs text-gray-700 dark:text-gray-200 mb-1">
                                      {mode === 'intraday' ? (
                                        <>
                                          {formatModalDate(log.prev_timestamp ?? historyData[idx + 1]?.timestamp ?? historyData[idx + 1]?.date ?? null)}{' '}
                                          {formatModalTime(log.prev_timestamp ?? historyData[idx + 1]?.timestamp ?? historyData[idx + 1]?.date ?? null)}
                                        </>
                                      ) : (
                                        formatModalDate(log.prev_timestamp ?? historyData[idx + 1]?.timestamp ?? historyData[idx + 1]?.date ?? log.timestamp ?? log.date ?? null)
                                      )}
                                    </div>
                                    <div className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white font-mono">${formatPrice(log.prev_open ?? log.prev_close ?? 0)}</div>
                                  </div>
                                  <div className="flex items-center -space-x-2 sm:-space-x-3 text-gray-500 dark:text-white/60 pt-3 sm:pt-5">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </div>
                                  <div className="text-right flex flex-col">
                                    <div className="text-[10px] sm:text-sm text-gray-500 dark:text-white/60 mb-0">{mode === 'intraday' ? 'Exit' : 'Open Price'}</div>
                                    <div className="text-[10px] sm:text-xs text-gray-700 dark:text-gray-200 mb-1">{mode === 'intraday' ? formatModalTime(log.timestamp ?? log.date) : formatModalDate(log.timestamp ?? log.date)}</div>
                                    <div className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white font-mono">${formatPrice(log.result_open ?? log.result_price ?? 0)}</div>
                                    <div className={`text-xs sm:text-sm font-semibold mt-0 font-mono ${changePct >= 0 ? "text-[#27AE60] dark:text-[#4CE60F]" : "text-[#EB5757] dark:text-[#EB5757]"}`}>
                                      ({changePct >= 0 ? "+" : ""}{formatPct(changePct)}%)
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                }
              </div>
            </div>
          ) : (
            <div className="py-12 sm:py-20 text-center">
              <div className="bg-blue-50 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-gray-900 dark:text-white font-bold text-base sm:text-lg">No signal changes yet</h4>
              <p className="text-gray-400 text-xs sm:text-sm mt-2">We'll notify you as soon as the technical trend shifts.</p>
            </div>
          )}

          {/* Close Button (absolute footer) */}
          <div className="absolute left-0 right-0 bottom-5 flex justify-end z-20 px-4 sm:px-6 pointer-events-none">
            <div className="pointer-events-auto">
              <button
                onClick={onClose}
                className="px-4 sm:px-6 py-1.5 sm:py-2 bg-gray-200 hover:bg-gray-300 dark:bg-[#595959] text-gray-700 dark:text-white rounded-lg text-xs sm:text-sm font-medium transition-colors"
              >
                close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Suggestion() {
  const [timeframe, setTimeframe] = useState("1D");
  const [searchTerm, setSearchTerm] = useState("");
  const [data, setData] = useState([]);
  const [filterRating, setFilterRating] = useState(null);
  const [changeFilter, setChangeFilter] = useState("All");
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  const [showCountryMenu, setShowCountryMenu] = useState(false);
  const countryDropdownRef = useRef(null);
  const [selectedCountries, setSelectedCountries] = useState(["All"]); // Array for multi-select
  const selectedCountryLabel = selectedCountries.length === 1 && selectedCountries[0] === "All" 
    ? "All Markets" 
    : selectedCountries.length === 0 
    ? "All Markets"
    : `${selectedCountries.length} Markets`;

  const [hoveredRow, setHoveredRow] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const tableRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target)) setShowCountryMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);



  // Track search with debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        trackSearch(searchTerm.trim());
      }
    }, 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      try {
        const ratingsApiUrl = USE_MOCK_DATA ? MOCK_RATINGS_API : RATINGS_API;
        const [resDR, resRating] = await Promise.all([fetch(API_URL), fetch(ratingsApiUrl)]);

        if (!resDR.ok) {
          throw new Error(`DR API error: ${resDR.status} ${resDR.statusText}`);
        }
        if (!resRating.ok) {
          throw new Error(`Ratings API error: ${resRating.status} ${resRating.statusText}`);
        }

        const jsonDR = await resDR.json();
        const jsonRating = await resRating.json();
        if (!isMounted) return;

        // Get updated_at from API response
        if (jsonRating.updated_at) {
          const apiDate = new Date(jsonRating.updated_at);
          if (!isNaN(apiDate.getTime())) {
            setLastUpdateTime(apiDate);
          } else {
            // Fallback to current time if API date is invalid
            setLastUpdateTime(new Date());
          }
        } else {
          // Fallback to current time if API doesn't provide updated_at
          setLastUpdateTime(new Date());
        }

        const ratingMap = {};
        (jsonRating.rows || []).forEach((r) => { if (r.ticker) ratingMap[r.ticker.toUpperCase()] = r; });

        // Build a map of all DRs grouped by underlying
        const drByUnderlying = new Map();
        (jsonDR.rows || []).forEach((item) => {
          // Preserve numeric-only symbols (e.g., '9999') by falling back to raw symbol
          const rawSym = (item.symbol || "").toUpperCase().trim();
          const strippedSym = rawSym.replace(/\d+$/, "");
          const uName = (item.underlying || (strippedSym || rawSym)).toUpperCase().trim();

          if (USE_MOCK_DATA && uName !== "AAPL") {
            return;
          }

          if (!drByUnderlying.has(uName)) {
            drByUnderlying.set(uName, []);
          }
          drByUnderlying.get(uName).push(item);
        });

        const underlyingMap = new Map();
        drByUnderlying.forEach((drList, uName) => {

          let mostPopularDR = null;
          let maxVolume = -1;
          drList.forEach((dr) => {
            const vol = Number(dr.totalVolume) || 0;
            if (vol > maxVolume) {
              maxVolume = vol;
              mostPopularDR = {
                symbol: dr.symbol || "",
                volume: vol
              };
            }
          });

          if (!mostPopularDR && drList.length > 0) {
            mostPopularDR = {
              symbol: drList[0].symbol || "",
              volume: 0
            };
          }

          let highSensitivityDR = null;
          let minBid = Infinity;
          drList.forEach((dr) => {
            const bid = Number(dr.bidPrice) || 0;
            if (bid > 0 && bid < minBid) {
              minBid = bid;
              highSensitivityDR = {
                symbol: dr.symbol || "",
                bid: bid
              };
            }
          });

          if (drList.length === 1 && drList[0]) {
            const singleDR = drList[0];
            const vol = Number(singleDR.totalVolume) || 0;
            const bid = Number(singleDR.bidPrice) || 0;

            if (!mostPopularDR) {
              mostPopularDR = { symbol: singleDR.symbol || "", volume: vol };
            }
            if (!highSensitivityDR && bid > 0) {
              highSensitivityDR = { symbol: singleDR.symbol || "", bid: bid };
            }
          }

          const firstItem = drList[0];
          const rt = ratingMap[uName];
          underlyingMap.set(uName, {
            ...firstItem,
            last: rt?.price || 0,
            percentChange: rt?.changePercent || 0,
            change: rt?.change || 0,
            high: rt?.high || 0,
            low: rt?.low || 0,
            displaySymbol: uName,
            displayName: getShortName(firstItem),
            ratingDay: rt?.daily?.rating ?? "Unknown",
            prevDay: rt?.daily?.prev ?? "Unknown",
            timeDay: rt?.daily?.changed_at,
            ratingWeek: rt?.weekly?.rating ?? "Unknown",
            prevWeek: rt?.weekly?.prev ?? "Unknown",
            timeWeek: rt?.weekly?.changed_at,
            ratingDayHistory: rt?.daily?.history || [],
            ratingWeekHistory: rt?.weekly?.history || [],
            currency: rt?.currency || "",
            exchangeCountry: getCountryFromExchange(firstItem.underlyingExchange),
            mostPopularDR: mostPopularDR,
            highSensitivityDR: highSensitivityDR
          });
        });
        const arr = Array.from(underlyingMap.values());
        try {
          // debug: built underlyingMap entries (removed noisy console output)
        } catch (err) {
          // ignore
        }
        setData(arr);
        setLoading(false);
      } catch (err) {
        if (isMounted) {
          console.error('Error fetching data:', err);
          setLoading(false);
        }
      }
    }
    const timeoutId = setTimeout(fetchData, 100);
    const intervalId = setInterval(fetchData, 60000);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" };
        return { key: null, direction: "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  const handleRatingCellMouseEnter = (e, row) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top
    });
    setHoveredRow(row);
  };

  const handleRatingCellMouseLeave = () => {
    setHoveredRow(null);
  };

  const processedData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    let mapped = data.map((row) => {
      let currentRating = timeframe === "1W" ? row.ratingWeek : row.ratingDay;
      let prevRating = timeframe === "1W" ? row.prevWeek : row.prevDay;
      let changeTime = timeframe === "1W" ? row.timeWeek : row.timeDay;

      const currScore = RATING_SCORE[currentRating.toLowerCase()] || 0;
      const prevScore = RATING_SCORE[prevRating.toLowerCase()] || 0;
      return {
        ...row,
        displayPct: row.percentChange,
        displayChange: row.change,
        technicalRating: currentRating,
        prevTechnicalRating: prevRating,
        displayTime: formatSmartTime(changeTime),
        changeDirection: currScore > prevScore ? "Positive" : currScore < prevScore ? "Negative" : "Neutral",
        sortPrice: Number(row.last) || 0,
        hasData: row.percentChange !== undefined
      };
    });

    if (term) mapped = mapped.filter(row =>
      row.displaySymbol.toLowerCase().includes(term) ||
      row.displayName.toLowerCase().startsWith(term)
    );

    if (filterRating) mapped = mapped.filter(row => row.technicalRating.toLowerCase() === filterRating.toLowerCase());
    if (changeFilter !== "All") {
      if (changeFilter === "Positive") mapped = mapped.filter(row => row.changeDirection === "Positive");
      else if (changeFilter === "Negative") mapped = mapped.filter(row => row.changeDirection === "Negative");
    }
    if (selectedCountries.length > 0 && !selectedCountries.includes("All")) {
  mapped = mapped.filter(row => selectedCountries.includes(row.exchangeCountry));
}

    mapped = mapped.filter(row => {
      const rating = row.technicalRating.toLowerCase();
      return rating !== "neutral";
    });
    if (sortConfig.key) {
      mapped.sort((a, b) => {
        const key = sortConfig.key;
        let valA, valB;
        switch (key) {
          case "symbol": valA = a.displaySymbol; valB = b.displaySymbol; break;
          case "rating": valA = RATING_SCORE[a.technicalRating.toLowerCase()]; valB = RATING_SCORE[b.technicalRating.toLowerCase()]; break;
          case "time": valA = new Date(a.timeDay || a.timeWeek).getTime(); valB = new Date(b.timeDay || b.timeWeek).getTime(); break;
          case "popularDR": valA = a.mostPopularDR?.volume || 0; valB = b.mostPopularDR?.volume || 0; break;
          case "sensitivityDR": valA = a.highSensitivityDR?.bid || Infinity; valB = b.highSensitivityDR?.bid || Infinity; break;
          case "price": valA = a.sortPrice; valB = b.sortPrice; break;
          case "pct": valA = a.displayPct; valB = b.displayPct; break;
          case "chg": valA = a.displayChange; valB = b.displayChange; break;
          case "high": valA = a.high; valB = b.high; break;
          case "low": valA = a.low; valB = b.low; break;
          default: return 0;
        }
        const dir = sortConfig.direction === "asc" ? 1 : -1;
        return (typeof valA === "string" ? valA.localeCompare(valB) : valA - valB) * dir;
      });
    }
    return mapped;
  }, [data, searchTerm, timeframe, sortConfig, filterRating, changeFilter, selectedCountries]);

  const SortIndicator = ({ colKey }) => {
    const active = sortConfig.key === colKey;
    const direction = sortConfig.direction;
    const upColor = active && direction === "asc" ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)";
    const downColor = active && direction === "desc" ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)";
    return (
      <div className="flex items-center ml-0 shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-2.5 sm:w-3 h-2.5 sm:h-3 transition-all duration-200">
          <path d="M14 2.256V30c-2.209 0-4-1.791-4-4V13H4.714c-.633 0-.949-.765-.502-1.212l9.607-9.607C13.886 2.114 14 2.162 14 2.256z" fill={upColor} />
          <path d="M27.788 20.212l-9.6 9.6C18.118 29.882 18 29.832 18 29.734V2c2.209 0 4 1.791 4 4v13h5.286C27.918 19 28.235 19.765 27.788 20.212z" fill={downColor} />
        </svg>
      </div>
    );
  };

  const handleRatingFilterClick = (rating) => {
    if (filterRating === rating) {
      setFilterRating(null);
    } else {
      setFilterRating(rating);
      trackFilter('rating', rating);
    }
  };
  const RATINGS_OPTIONS = ["Strong Buy", "Buy", "Sell", "Strong Sell"];
  const CHANGE_OPTIONS = [{ label: "Latest Only", val: "All" }, { label: "Show Changes", val: "ShowChanges", color: "bg-blue-500" }, { label: "Positive", val: "Positive", color: "bg-[#137333] dark:bg-[#4CE60F]" }, { label: "Negative", val: "Negative", color: "bg-[#C5221F] dark:bg-[#EB5757]" }];
  const shouldShowChange = filterRating !== null || changeFilter !== "All";

  return (
    <div className="h-screen w-full bg-[#F5F5F5 dark:bg-[#151D33]] overflow-hidden flex justify-center">
      <div className="w-full max-w-[1248px] flex flex-col h-full">
        <div className="pt-6 md:pt-10 pb-0 px-4 md:px-0 shrink-0" style={{ overflow: 'visible', zIndex: 100 }}>
          <div className="w-full md:w-[1040px] max-w-full mx-auto md:scale-[1.2] md:origin-top" style={{ overflow: 'visible' }}>
            <h1 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3 text-black dark:text-white">Suggestion</h1>
            <p className="text-[#6B6B6B] dark:text-white/70 mb-6 md:mb-8 text-sm md:text-base">Technical Ratings (Underlying Assets)</p>

            {/* Filters Row */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 mb-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
                <div className="flex bg-white dark:bg-[#595959] dark:border-none dark:text-white p-1 rounded-xl border border-gray-200 shadow-sm h-[37.33px] w-full sm:w-auto">
                  <button onClick={() => { setTimeframe("1D"); trackFilter('timeframe', '1D'); }} className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-all h-full ${timeframe === "1D" ? "bg-[#0B102A] text-white shadow-md dark:bg-[#10172A]" : "text-gray-800 hover:bg-gray-50 dark:text-white dark:hover:bg-[#4A4A4A]"}`}>1 Day</button>
                  <button onClick={() => { setTimeframe("1W"); trackFilter('timeframe', '1W'); }} className={`flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-all h-full ${timeframe === "1W" ? "bg-[#0B102A] text-white shadow-md dark:bg-[#10172A]" : "text-gray-800 hover:bg-gray-50 dark:text-white dark:hover:bg-[#4A4A4A]"}`}>1 Week</button>
                </div>
                <div className="flex items-center gap-2 md:gap-4 w-full sm:w-auto">
                  <div className="relative z-200 flex-1 sm:flex-initial w-1/2" ref={countryDropdownRef} style={{ isolation: 'isolate', overflow: 'visible' }}>
                    <button
                      type="button"
                      onClick={() => setShowCountryMenu((prev) => !prev)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-none bg-white dark:bg-[#595959] dark:text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-[#4A4A4A] focus:outline-none focus:ring-2 focus:ring-[#0B102A] dark:focus:ring-0 w-full md:w-[202.5px]"
                      style={{ height: '37.33px', width: undefined }}
                    >
                      <span className="truncate flex items-center gap-2">
                        {selectedCountries.length === 1 && selectedCountries[0] === "All" ? (
                          <i className="bi bi-globe text-gray-400 dark:text-white" style={{ fontSize: '16px', lineHeight: '16px' }}></i>
                        ) : selectedCountries.length === 1 && countryOptions.find(c => c.code === selectedCountries[0])?.flag ? (
                          <img
                            src={`https://flagcdn.com/${countryOptions.find(c => c.code === selectedCountries[0]).flag}.svg`}
                            srcSet={`https://flagcdn.com/w40/${countryOptions.find(c => c.code === selectedCountries[0]).flag}.png 2x, https://flagcdn.com/w20/${countryOptions.find(c => c.code === selectedCountries[0]).flag}.png 1x`}
                            alt="flag"
                            className="w-5 h-5 object-contain rounded-sm"
                            onError={(e) => { if (!e.target.dataset.fallback) { e.target.dataset.fallback = '1'; e.target.src = `https://flagcdn.com/w40/${countryOptions.find(c => c.code === selectedCountries[0]).flag}.png`; } }}
                          />
                        ) : null}
                        <span>{selectedCountryLabel}</span>
                      </span>
                      <svg className={`h-4 w-4 shrink-0 transition-transform text-gray-500 dark:text-white ${showCountryMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showCountryMenu && (
                      <div className="absolute left-0 top-full z-9999 mt-2 w-full sm:w-56 max-h-72 overflow-auto hide-scrollbar rounded-2xl border border-gray-200 dark:border-none bg-white dark:bg-[#595959] dark:text-white shadow-[0_10px_30px_rgba(15,23,42,0.15)] py-1" style={{ transform: 'translateZ(0)' }}>
                        {countryOptions.map((opt) => {
                          const isSelected = selectedCountries.includes(opt.code);
                          const isAll = opt.code === "All";
                          return (
                            <button 
                              key={opt.code} 
                              onClick={() => {
                                let newSelection;
                                if (isAll) {
                                  // If "All" is selected, clear everything else
                                  newSelection = ["All"];
                                } else if (isSelected) {
                                  // Remove this country
                                  newSelection = selectedCountries.filter(c => c !== opt.code);
                                  // If no countries left, select "All"
                                  if (newSelection.length === 0) {
                                    newSelection = ["All"];
                                  } else {
                                    // Remove "All" if other countries are selected
                                    newSelection = newSelection.filter(c => c !== "All");
                                  }
                                } else {
                                  // Add this country and remove "All"
                                  newSelection = selectedCountries.filter(c => c !== "All");
                                  newSelection.push(opt.code);
                                }
                                setSelectedCountries(newSelection);
                                // Don't close the menu - let user continue selecting
                                trackFilter('country', opt.label);
                              }} 
                              className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-xs sm:text-sm transition-colors ${isSelected ? "bg-[#EEF2FF] text-[#0B102A] font-semibold dark:bg-[#4A4A4A] dark:text-white" : "text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-[#4A4A4A]"}`}
                            >
                              <span className="flex items-center gap-2">
                                {opt.flag ? (
                                  <img
                                    src={`https://flagcdn.com/w20/${opt.flag}.png`}
                                    alt=""
                                    className="h-4 w-4 rounded-full object-cover"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                ) : null}
                                <span>{opt.label}</span>
                              </span>
                              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${isSelected ? "bg-[#0B102A] border-[#0B102A]" : "border-gray-300 dark:border-gray-500"}`}>
                                {isSelected && (
                                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 w-1/2">
                    <FilterDropdown label="Rating change" value={changeFilter} options={CHANGE_OPTIONS} onSelect={(val) => { setChangeFilter(val); trackFilter('change', val); }} />
                  </div>
                </div>
              </div>
              <div className="relative w-full md:w-auto">
                <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-white dark:bg-[#595959] dark:border-none text-gray-900 dark:text-white placeholder:text-gray-400 placeholder:dark:text-white/70 pl-4 pr-10 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B102A] dark:focus:ring-0 w-full md:w-64 text-sm shadow-sm h-[37.33px]" />
                <i className="bi bi-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-white" style={{ fontSize: 14 }} />
              </div>
            </div>

            {/* Rating Select Row */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-2 gap-0 md:gap-2">
              <div className="overflow-x-auto pb-1 w-full md:w-auto">
                <div className="flex md:inline-flex items-center gap-3 bg-white dark:bg-[#595959] dark:border-none dark:text-white rounded-xl px-2 py-1.5 shadow-sm border border-gray-100 w-full md:w-auto h-[37.33px]">
                  <span className="text-sm font-semibold text-gray-700 dark:text-white whitespace-nowrap">Ratings</span>
                  <div className="flex gap-2 flex-1 md:flex-initial h-full">
                    {RATINGS_OPTIONS.map((rating) => (
                      <button key={rating} onClick={() => handleRatingFilterClick(rating)} className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex-1 md:flex-initial h-full whitespace-nowrap ${getRatingStyle(rating)} ${filterRating === rating ? "ring-2 ring-offset-1 ring-black/10 shadow-md scale-105" : ""}`}>{rating}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-xs text-gray-500 pr-1 mt-1">
                <div>Found {processedData.length.toLocaleString()} results</div>
                {lastUpdateTime && (
                  <div>Last Updated: {lastUpdateTime.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-hidden pb-6 md:pb-10 mt-0 md:mt-9 px-4 md:px-0">
          <div className="h-full dark:bg-[#0B0E14] dark:border-white/0 dark:text-white rounded-xl overflow-auto">
            {loading ? (
              <>
                {/* Desktop - Table Skeleton */}
                <div className="hidden lg:block">
                  <TableSkeleton rows={12} cols={8} showHeader={true} />
                </div>
                {/* Mobile - Card Skeleton */}
                <div className="lg:hidden">
                  <CardSkeleton count={8} />
                </div>
              </>
            ) : (
              <>
            {/* Mobile Card View */}
            <div className="lg:hidden ">
              <div className="space-y-3 dark:bg-[#0B0E14]">
                {processedData.map((row, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedItem(row)}
                    className="bg-white dark:bg-[#23262A] dark:border-white/10 dark:text-white rounded-xl shadow-sm border border-gray-200 dark:border-white/10 p-3 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="font-bold text-[#2F80ED] text-sm truncate">{row.displaySymbol}</div>
                        <div className="text-xs text-gray-600 dark:text-white/80 truncate">{row.displayName}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="font-medium text-gray-800 dark:text-white text-sm font-mono">{formatPrice(row.sortPrice)}</span>
                          <span className="text-xs text-gray-600 dark:text-white/80 uppercase">{row.currency}</span>
                        </div>
                        <div className={`text-xs font-medium ${row.displayPct > 0 ? "text-[#27AE60] dark:text-[#4CE60F]" : row.displayPct < 0 ? "text-[#EB5757] dark:text-[#EB5757]" : "text-gray-800 dark:text-white"}`}>
                          {row.hasData ? <span className="font-mono">{row.displayPct > 0 ? "+" : ""}{formatPct(row.displayPct)}%</span> : "-"}
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="mb-2 py-2 border-y border-gray-400 dark:border-gray-400">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">Technical Rating</div>
                        <div className="ml-2">
                          <RatingChangeCell prev={row.prevTechnicalRating} current={row.technicalRating} showChange={shouldShowChange} />
                        </div>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500 text-[10px] dark:text-gray-400">Last Update</div>
                        <div className="text-gray-800 dark:text-white font-medium">{row.displayTime}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-500 text-[10px] dark:text-gray-400">Change</div>
                        <div className={`font-medium ${row.displayChange > 0 ? "text-[#27AE60] dark:text-[#4CE60F]" : row.displayChange < 0 ? "text-[#EB5757] dark:text-[#EB5757]" : "text-gray-800 dark:text-white"}`}>
                          {row.hasData ? (row.displayChange > 0 ? `+${formatPrice(row.displayChange)}` : formatPrice(row.displayChange)) : "-"}
                        </div>
                      </div>
                      {row.mostPopularDR ? (
                        <div>
                          <div className="text-gray-500 text-[10px] dark:text-white/60">Popular DR</div>
                          <div className="font-bold text-[#50B728] dark:text-[#4CE60F] truncate">{row.mostPopularDR.symbol}</div>
                          <div className="text-[10px] text-gray-600 dark:text-white/80">Vol: {row.mostPopularDR.volume > 0 ? formatInt(row.mostPopularDR.volume) : "-"}</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-gray-500 text-[10px] dark:text-white/60">Popular DR</div>
                          <div className="font-bold text-gray-400 truncate">-</div>
                          <div className="text-[10px] text-gray-600 dark:text-white/80">Vol: -</div>
                        </div>
                      )}
                      {row.highSensitivityDR ? (
                        <div className="text-right">
                          <div className="text-gray-500 text-[10px] dark:text-white/60">Sensitivity DR</div>
                          <div className="font-bold text-[#0007DE] dark:text-blue-400 truncate">{row.highSensitivityDR.symbol}</div>
                          <div className="text-[10px] text-gray-600 dark:text-white/80">Bid: {row.highSensitivityDR.bid > 0 ? formatPrice(row.highSensitivityDR.bid) : "-"}</div>
                        </div>
                      ) : (
                        <div className="text-right">
                          <div className="text-gray-500 text-[10px] dark:text-white/60">Sensitivity DR</div>
                          <div className="font-bold text-gray-400 truncate">-</div>
                          <div className="text-[10px] text-gray-600 dark:text-white/80">Bid: -</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop Table View */}
            <table className="hidden lg:table w-full text-left border-collapse text-[14.4px]">
              <thead className="bg-[#0B102A] text-white font-semibold sticky top-0" style={{ zIndex: 50 }}>
                <tr className="h-[50px]">
                  {[{ key: 'symbol', label: 'Symbol', align: 'left' }, { key: 'rating', label: 'Technical Rating', align: 'center', width: '240px' }, { key: 'time', label: 'Last Update', align: 'center' }, { key: 'popularDR', label: 'Most Popular DR', align: 'center' }, { key: 'sensitivityDR', label: 'High Sensitivity DR', align: 'center' }, { key: 'price', label: 'Price', align: 'right' }, { key: 'pct', label: '%Change', align: 'right' }, { key: 'chg', label: 'Change', align: 'right' }, { key: 'high', label: 'High', align: 'right' }, { key: 'low', label: 'Low', align: 'right' }].map(h => (
                    <th
                      key={h.key}
                      className={`px-4 cursor-pointer text-${h.align} whitespace-nowrap relative`}
                      style={h.width ? { minWidth: h.width, width: h.width } : {}}
                      onClick={() => handleSort(h.key)}
                    >
                      <div className={`flex items-center justify-${h.align === 'left' ? 'start' : h.align === 'center' ? 'center' : 'end'} gap-0.5`}>{h.label} <SortIndicator colKey={h.key} /></div>
                      {sortConfig.key === h.key && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2F80ED] z-50">
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-[#2F80ED]"></div>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-transparent" ref={tableRef}>
                {processedData.map((row, idx) => {
                  const rowBg = idx % 2 === 0 ? "bg-[#FFFFFF] dark:bg-[#2D3136]" : "bg-[#F3F4F6] dark:bg-[#24272B]";
                  return (
                    <tr
                      key={idx}
                      onClick={() => setSelectedItem(row)}
                      className={`transition-colors ${rowBg} hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer relative`}
                      style={{ height: "53.6px" }}
                    >
                      <td className="px-4 align-middle overflow-hidden max-w-[130px]">
                        <div className="flex flex-col w-full">
                          <span className="font-bold text-[#2F80ED] truncate block">{row.displaySymbol}</span>
                          <span className="text-[12.4px] text-gray-600 dark:text-white/80 truncate block" title={row.displayName}>{row.displayName}</span>
                        </div>
                      </td>
                      <td
                        className="px-3 align-middle text-center"
                        style={{ minWidth: '190px', width: '190px' }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          handleRatingCellMouseEnter(e, row);
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation();
                          handleRatingCellMouseLeave();
                        }}
                      >
                        <RatingChangeCell prev={row.prevTechnicalRating} current={row.technicalRating} showChange={shouldShowChange} />
                      </td>
                      <td className="px-4 align-middle text-center whitespace-nowrap text-gray-800 dark:text-white font-medium">{row.displayTime}</td>
                      <td className="px-4 align-middle text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {row.mostPopularDR ? (
                            <>
                              <span className="font-bold text-[#50B728] dark:text-[#4CE60F]">{row.mostPopularDR.symbol}</span>
                              <span className="text-gray-600 dark:text-white/80 text-[13.4px]">Vol: <span className="font-mono">{row.mostPopularDR.volume > 0 ? formatInt(row.mostPopularDR.volume) : "-"}</span></span>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-600 dark:text-white/80">-</span>
                              <span className="text-gray-600 dark:text-white/80 text-[13.4px]">Vol: -</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 align-middle text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {row.highSensitivityDR ? (
                            <>
                              <span className="font-bold text-[#0007DE] dark:text-blue-400">{row.highSensitivityDR.symbol}</span>
                              <span className="text-gray-600 dark:text-white/80 text-[13.4px]">Bid: <span className="font-mono">{row.highSensitivityDR.bid > 0 ? formatPrice(row.highSensitivityDR.bid) : "-"}</span></span>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-600 dark:text-white/80">-</span>
                              <span className="text-gray-600 dark:text-white/80 text-[13.4px]">Bid: -</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 align-middle text-right">{renderPriceWithCurrency(row.sortPrice, row.currency)}</td>
                      <td className={`px-4 align-middle text-right font-medium ${row.displayPct > 0 ? "text-[#27AE60] dark:text-[#4CE60F]" : row.displayPct < 0 ? "text-[#EB5757]" : "text-gray-800 dark:text-white"}`}>{row.hasData ? <span className="font-mono">{row.displayPct > 0 ? "+" : ""}{formatPct(row.displayPct)}%</span> : "-"}</td>
                      <td className={`px-4 align-middle text-right font-medium ${row.displayChange > 0 ? "text-[#27AE60] dark:text-[#4CE60F]" : row.displayChange < 0 ? "text-[#EB5757]" : "text-gray-800 dark:text-white"}`}>
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="font-mono">{row.hasData ? (row.displayChange > 0 ? `+${formatPrice(row.displayChange)}` : formatPrice(row.displayChange)) : "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 align-middle text-right">{renderPriceWithCurrency(row.high, row.currency)}</td>
                      <td className="px-4 align-middle text-right">{renderPriceWithCurrency(row.low, row.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <Tooltip show={hoveredRow !== null} position={tooltipPosition}>
        Click to view rating history
      </Tooltip>

      {/* Rating History Modal */}
      {selectedItem && <RatingHistoryModal item={selectedItem} timeframe={timeframe} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
