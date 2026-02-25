import { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { trackPageView, trackFilter, trackSearch } from "../utils/tracker";
import { API_CONFIG } from "../config/api";
import { CalendarTableSkeleton, CalendarCardSkeleton } from "./SkeletonLoader";

// ================= CONSTANTS =================
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

const formatDate = (v) => {
  if (!v || v === "-") return "-";
  const d = new Date(v * 1000);
  if (isNaN(d)) return v;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}-${month}-${year}`;
};

const formatInt = (n) => {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  return Math.round(num).toLocaleString();
};

const formatPrice = (n) => {
  const num = Number(n);
  if (!isFinite(num)) return "0.00";
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Function to convert company name to TradingView logo format
const getLogoSlug = (name) => {
  if (!name) {
    return '';
  }

  // Quick special-case overrides for company names that TradingView uses different slugs for
  // e.g. Spotify should map to spotify-technology, DNOW/Now should map to now
  try {
    const nameStr = String(name || '').trim();
    const upper = nameStr.toUpperCase();
    // Overrides based on keyword match
    if (/LAOPU\s*GOLD/i.test(upper)) return 'laopu-gold-co-ltd';
    if (/MOBILE\s*WORLD/i.test(upper)) return 'mobile-world-investment-corporation';
    if (/TRIP\.COM|CTRIP/i.test(upper)) return 'ctrip-com-international';
    if (/HONG\s*KONG\s*EXCHANGES|HKEX/i.test(upper)) return 'hkex';
    if (/MONSTER\s*BEVERAGE/i.test(upper)) return 'monster-beverage';

    // special-case: Semiconductor Manufacturing International Corp. -> tradingview slug
    if (/SEMICONDUCTOR\s+MANUFACTURING\s+INTERNATIONAL/i.test(upper)) return 'semiconductor-manufacturing-international';
    if (/SPOTIFY/.test(upper)) return 'spotify-technology';
    // special-case: Palo Alto Networks -> tradingview uses palo-alto-networks
    if (/PALO\s*ALTO/.test(upper) || /PALOALTO/.test(upper)) return 'palo-alto-networks';
    if (/\bDNOW\b/.test(upper)) return 'now';
    // If company name starts with NOW or contains 'NOW INC' etc., prefer 'now'
    if (/\bNOW(\b|\s|,)/.test(upper)) return 'now';
    
    // Additional logo mappings for calendar page
    if (/^ON(\s|\.|$)|ON\s+HOLDING/i.test(upper)) return 'on-holding';
    if (/^COSTCO/i.test(upper)) return 'costar-group';
    if (/^MARVELL/i.test(upper)) return 'marvell-tech';
  } catch (e) {
    // fallback to normal logic below
  }

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

// Calendar-specific logo function that handles ticker-specific mappings
const getCalendarLogoSlug = (companyName, ticker) => {
  if (!companyName) return '';
  
  const upper = String(companyName).toUpperCase();
  
  // Handle ON mapping - this should be checked first
  if (/^ON(\s|\.|$)|ON\s+HOLDING/i.test(upper)) {
    return 'on-holding';
  }
  
  // Handle JD mappings based on ticker
  if (/^JD(\s|\.|$)|JD\.COM/i.test(upper)) {
    if (ticker === '9618') return 'jd-com';
    if (ticker === '6618') return 'jd-health-international-inc';
    // Default JD mapping if no specific ticker
    return 'jd-com';
  }
  if (upper === 'JD HEALTH INTERNATIONAL' || upper === 'JD HEALTH INTERNATIONAL INC') {
    return 'jd-health-international-inc';
  }
  
  // For all other cases, use the standard getLogoSlug function
  return getLogoSlug(companyName);
};

const extractSymbol = (str) => {
  if (!str) return "";
  const strUpper = String(str).toUpperCase().trim();

  const match = strUpper.match(/\(([^)]+)\)$/);
  if (match) {
    return match[1].trim();
  }

  if (strUpper.includes(" ") && strUpper.length > 10) {

    const words = strUpper.split(/\s+/);
    if (words[0] && /^[A-Z0-9.-]{1,6}$/.test(words[0])) {
      return words[0];
    }
  }

  return strUpper;
};

const formatMarketCapValue = (val, currency = "", isLargeNumber = false) => {
  if (val === null || val === undefined || val === "" || val === "-") return <span className="text-gray-600 dark:text-white text-xs sm:text-sm">-</span>;

  const num = Number(val);
  if (isNaN(num)) return <span className="text-gray-600 text-xs sm:text-sm">-</span>;

  let displayNum = num;
  let suffix = "";

  if (isLargeNumber) {
    if (Math.abs(num) >= 1.0e12) {
      displayNum = num / 1.0e12;
      suffix = "T";
    } else if (Math.abs(num) >= 1.0e9) {
      displayNum = num / 1.0e9;
      suffix = "B";
    } else if (Math.abs(num) >= 1.0e6) {
      displayNum = num / 1.0e6;
      suffix = "M";
    } else if (Math.abs(num) >= 1.0e3) {
      displayNum = num / 1.0e3;
      suffix = "K";
    }
  }

  const formattedNum = displayNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  let color = "";
  let bgColor = "";
  if (isLargeNumber) {
    switch (suffix) {
      case "T":
        color = "#ffffff"; // White text
        bgColor = "#0F172A"; // Very Dark Blue (Trillion - Highest)
        break;
      case "B":
        color = "#ffffff"; // White text
        bgColor = "#1E3A8A"; // Dark Blue (Billion - High)
        break;
      case "M":
        color = "#ffffff"; // White text
        bgColor = "#2563EB"; // Medium-Dark Blue (Million - Medium)
        break;
      case "K":
        color = "#ffffff"; // White text
        bgColor = "#60A5FA"; // Medium Blue (Thousand - Low)
        break;
      default:
        color = "#4B5563"; // Gray-600 text for lowest (no suffix)
        bgColor = "#CAE2FF"; // Light Blue (Lowest)
        break;
    }
  }

  return (
    <div className="flex items-center justify-center">
      <span
        className="font-medium tracking-tight text-xs sm:text-[14.4px] px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg inline-flex items-center justify-center gap-0.5 min-w-[90px] sm:min-w-[110px] font-mono"
        style={{ color, backgroundColor: bgColor }}
      >
        {formattedNum}
        {suffix && <span className="ml-0.5">{suffix}</span>}
        {currency && <span className="text-xs sm:text-[14.4px] font-normal uppercase ml-0.5">{currency}</span>}
      </span>
    </div>
  );
};

const formatValue = (val, currency = "", isLargeNumber = false) => {
  if (val === null || val === undefined || val === "" || val === "-") return <span className="text-gray-600 dark:text-white text-xs sm:text-sm">-</span>;

  const num = Number(val);
  if (isNaN(num)) return <span className="text-gray-600 text-xs sm:text-sm">-</span>;

  let displayNum = num;
  let suffix = "";

  if (isLargeNumber) {
    if (Math.abs(num) >= 1.0e9) {
      displayNum = num / 1.0e9;
      suffix = "B";
    } else if (Math.abs(num) >= 1.0e6) {
      displayNum = num / 1.0e6;
      suffix = "M";
    } else if (Math.abs(num) >= 1.0e3) {
      displayNum = num / 1.0e3;
      suffix = "K";
    }
  }

  const formattedNum = displayNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return (
    <div className="flex items-baseline justify-end gap-0.5">
      <span className="font-medium tracking-tight text-xs sm:text-[14.4px] dark:text-white font-mono">
        {formattedNum}
        {suffix && <span className="ml-0.5">{suffix}</span>}
      </span>
      {currency && <span className="text-xs sm:text-[14.4px] text-gray-600 dark:text-white/80 font-normal uppercase">{currency}</span>}
    </div>
  );
};

const formatColoredValue = (val, suffix = "", currency = "") => {
  if (val === null || val === undefined || val === "" || val === "-") return <span className="text-gray-600 dark:text-white text-xs sm:text-sm">-</span>;
  const num = Number(val);
  const colorClass = num > 0 ? "text-[#27AE60] dark:text-[#4CE60F]" : num < 0 ? "text-[#EB5757] dark:text-[#EB5757]" : "text-gray-500 dark:text-white/60";

  return (
    <div className="flex items-baseline justify-end gap-0.5">
      <span className={`font-medium ${colorClass} text-xs sm:text-[14.4px] font-mono`}>
        {num > 0 ? "+" : ""}{num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        {suffix && <span className="ml-0.5 text-xs sm:text-[14.4px] font-normal opacity-80">{suffix}</span>}
      </span>
      {currency && <span className={`text-xs sm:text-[14.4px] font-normal uppercase ${colorClass} dark:text-white/80 opacity-70`}>{currency}</span>}
    </div>
  );
};

export default function Calendar() {
  const [country, setCountry] = useState("All");
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");
  const [search, setSearch] = useState("");
  const [selectedDay, setSelectedDay] = useState("All");

  // Load seen earnings from localStorage once on initialization
  const [seenEarningsIds, setSeenEarningsIds] = useState(() => {
    try {
      const saved = localStorage.getItem('calendar_seen_earnings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch (e) {
      console.error('Error loading seen earnings:', e);
    }
    return new Set();
  });

  const [newEarningsCount, setNewEarningsCount] = useState(0);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [logoErrors, setLogoErrors] = useState({});
  const [showCountryMenu, setShowCountryMenu] = useState(false);

  const countryDropdownRef = useRef(null);

  const selectedCountryOption = useMemo(() => countryOptions.find((c) => c.code === country) || countryOptions[0], [country]);
  const selectedLabel = selectedCountryOption.label || "All Markets";

  // Save seen earnings to localStorage and update navbar
  useEffect(() => {
    try {
      localStorage.setItem('calendar_seen_earnings', JSON.stringify([...seenEarningsIds]));

      // Update global notification count for navbar
      const event = new CustomEvent('calendarNotificationUpdate', {
        detail: { count: newEarningsCount }
      });
      window.dispatchEvent(event);
    } catch (e) {
      console.error('Error saving seen earnings:', e);
    }
  }, [seenEarningsIds, newEarningsCount]);



  // Track search with debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim().length >= 2) {
        trackSearch(search.trim());
      }
    }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const flattenData = (responseData) => {
    if (!responseData) return [];
    if (Array.isArray(responseData)) return responseData;

    // Handle new structure with {data: {...}, updated_at: "..."}
    let dataToProcess = responseData;
    if (responseData.data) {
      dataToProcess = responseData.data;
    }

    let allRows = [];
    Object.values(dataToProcess).forEach(group => {
      if (group && Array.isArray(group.data)) {
        allRows.push(...group.data);
      }
    });
    return allRows;
  };

  // Close menu when route changes
  useEffect(() => {
    const controller = new AbortController();

    const loadData = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        let finalData = [];
        let apiUpdateTime = null;
        // ดึงข้อมูลจาก backend ตาม country ที่เลือก (หรือ All)
        // Note: Using a standard fetch/axios call. If StrictMode triggers twice, 
        // the second call will be blocked by the timestamp guard above if data already exists,
        // or they will both run but the guard ensures we don't spam.
        const res = await axios.get(API_CONFIG.endpoints.earnings.get(country), {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        const responseData = res.data;
        finalData = flattenData(responseData);
        if (responseData.updated_at) {
          const apiDate = new Date(responseData.updated_at);
          if (!isNaN(apiDate.getTime())) {
            apiUpdateTime = apiDate;
          }
        }
        if (!controller.signal.aborted) {
          try {
            // Debug: sample API data (disabled in production)
            // console.log("📥 Earnings API response sample:", responseData);
            // console.log("📥 Flattened earnings sample:", finalData.slice(0, 3));
          } catch (err) {
            // ignore logging errors
          }

          // Enrich earnings with DR-level info (mostPopularDR, highSensitivityDR)
          try {
            const drRes = await axios.get(import.meta.env.VITE_DR_LIST_API);
            const drRows = (drRes.data && drRes.data.rows) ? drRes.data.rows : (drRes.data || []);
            // normalize exchange strings to short codes to allow matching between DR feed and earnings feed
            const normalizeExchange = (s) => {
              if (!s) return "";
              const ss = s.toString().toUpperCase();
              const map = [
                ["NASDAQ GLOBAL SELECT", "NASDAQ"],
                ["NASDAQ GLOBAL", "NASDAQ"],
                ["NASDAQ", "NASDAQ"],
                ["NEW YORK STOCK EXCHANGE", "NYSE"],
                ["NYSE", "NYSE"],
                ["TOKYO", "TSE"],
                ["TSE", "TSE"],
                ["EURONEXT", "EURONEXT"],
                ["MIL", "EURONEXT"],
                ["HKEX", "HKEX"],
                ["HONG KONG", "HKEX"],
                ["STOCK EXCHANGE OF HONG KONG", "HKEX"],
                ["SHANGHAI", "SSE"],
                ["SSE", "SSE"],
                ["SZSE", "SZSE"],
                ["SET", "SET"],
                ["TWSE", "TWSE"],
                ["LSE", "LSE"],
                ["ASX", "ASX"]
              ];
              for (let i = 0; i < map.length; i++) {
                if (ss.includes(map[i][0])) return map[i][1];
              }
              return ss.replace(/\s+/g, " ").trim();
            };

            const drByUnderlying = new Map();
            (drRows || []).forEach((item) => {
              const rawSym = (item.symbol || "").toUpperCase().trim();
              const strippedSym = rawSym.replace(/\d+$/, "");
              const uName = (item.underlying || (strippedSym || rawSym)).toUpperCase().trim();
              const uExchangeRaw = (item.underlyingExchange || item.u_exch || item.exchange || "");
              const uExchange = normalizeExchange(uExchangeRaw);

              // Also extract numeric code from underlyingName if present, e.g. "NETEASE, INC. (9999)" -> 9999
              let numericUnderlying = null;
              try {
                const underlyingName = (item.underlyingName || "").toString();
                const m = underlyingName.match(/\((\d{2,6})\)$/);
                if (m) numericUnderlying = m[1];
              } catch (e) { /* ignore */ }

              // primary key: uName
              if (uName) {
                if (!drByUnderlying.has(uName)) drByUnderlying.set(uName, []);
                drByUnderlying.get(uName).push(item);
              }

              // primary key with exchange: uName|EX
              if (uName && uExchange) {
                const keyWithEx = `${uName}|${uExchange}`;
                if (!drByUnderlying.has(keyWithEx)) drByUnderlying.set(keyWithEx, []);
                drByUnderlying.get(keyWithEx).push(item);
              }

              // fallback key: numeric underlying code (e.g., 9999)
              if (numericUnderlying) {
                const key = numericUnderlying.toUpperCase();
                if (!drByUnderlying.has(key)) drByUnderlying.set(key, []);
                drByUnderlying.get(key).push(item);
              }
              // additional fallback: trailing digits from symbol (e.g., PREMIA3151 -> 3151)
              try {
                const m2 = rawSym.match(/(\d{2,6})$/);
                if (m2) {
                  const symNum = m2[1];
                  if (!drByUnderlying.has(symNum)) drByUnderlying.set(symNum, []);
                  drByUnderlying.get(symNum).push(item);
                  // also index numeric suffix with exchange
                  if (uExchange) {
                    const symNumEx = `${symNum}|${uExchange}`;
                    if (!drByUnderlying.has(symNumEx)) drByUnderlying.set(symNumEx, []);
                    drByUnderlying.get(symNumEx).push(item);
                  }
                }
              } catch (e) { /* ignore */ }
            });

            const drSummary = {};
            drByUnderlying.forEach((list, u) => {
              let mostPopularDR = null; let maxVol = -1;
              let highSensitivityDR = null; let minBid = Infinity;
              // pick a representative underlyingName for this group
              let repUnderlyingName = null;
              list.forEach(dr => {
                const vol = Number(dr.totalVolume) || 0;
                const bid = Number(dr.bidPrice) || 0;
                if (vol > maxVol) { maxVol = vol; mostPopularDR = { symbol: dr.symbol || "", volume: vol }; }
                if (bid > 0 && bid < minBid) { minBid = bid; highSensitivityDR = { symbol: dr.symbol || "", bid: bid }; }
                if (!repUnderlyingName && (dr.underlyingName || dr.underlying)) repUnderlyingName = (dr.underlyingName || dr.underlying);
              });
              if (!mostPopularDR && list.length > 0) {
                mostPopularDR = { symbol: list[0].symbol || "", volume: Number(list[0].totalVolume) || 0 };
              }
              // store representative exchange if available (normalized to short code)
              let repExchange = null;
              if (list && list.length > 0) {
                const repRaw = (list[0].underlyingExchange || list[0].u_exch || list[0].exchange || "");
                repExchange = normalizeExchange(repRaw);
              }
              drSummary[u] = { mostPopularDR, highSensitivityDR, underlyingName: repUnderlyingName, underlyingExchange: (repExchange || "") };
            });

            // Safer enrichment: prefer exact ticker match; otherwise use token-overlap on company name
            finalData = finalData.map(item => {
              try {
                const keyTicker = (item.ticker || "").toUpperCase().trim();
                const companyRaw = (item.company || "").toUpperCase().trim();
                const itemExchange = normalizeExchange(item.exchange || item.currency || "");

                // 0) Strict exact underlyingName + exchange match (highest priority)
                const normalizeName = s => {
                  if (!s) return '';
                  let t = s.toString().toUpperCase();
                  // remove Thai prefix 'บริษัท' and common parenthetical tickers
                  t = t.replace(/^(บริษัท|บริษัทจำกัด)\s+/i, '');
                  t = t.replace(/\([^)]*\)$/g, '');
                  // remove common legal suffix tokens
                  t = t.replace(/\b(INC|INCORPORATED|LTD|PLC|NV|N V|N\.V\.|SA|S\.A\.|CORP|COMPANY|LIMITED|HOLDINGS|HOLDING|GROUP)\b/g, ' ');
                  t = t.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
                  return t;
                };
                const normCompany = normalizeName(companyRaw);
                if (normCompany && itemExchange) {
                  try {
                    for (const k of Object.keys(drSummary)) {
                      const drEntry = drSummary[k];
                      if (drEntry && drEntry.underlyingName && drEntry.underlyingExchange) {
                        const uNorm = normalizeName((drEntry.underlyingName || '').toUpperCase());
                        if (uNorm === normCompany && drEntry.underlyingExchange === itemExchange) {
                          return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                        }
                      }
                    }
                  } catch (e) { /* ignore */ }
                }

                // 1) Exact ticker match
                if (keyTicker) {
                  // prefer same-exchange keyed DR if available
                  if (itemExchange && drSummary[`${keyTicker}|${itemExchange}`]) {
                    const drEntry = drSummary[`${keyTicker}|${itemExchange}`];
                    // numeric-only ticker guard: if ticker is numeric, ensure underlyingName overlaps with company
                    if (keyTicker.match(/^\d+$/)) {
                      const normalizeToken = s => s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
                      const compTokens = normalizeToken(companyRaw).split(' ').filter(t => t.length >= 2);
                      const underTokens = normalizeToken((drEntry.underlyingName || '').toUpperCase()).split(' ').filter(t => t.length >= 2);
                      const overlap = compTokens.filter(ct => underTokens.includes(ct)).length;
                      if (overlap === 0) {
                        // reject numeric-only match without underlying name overlap
                      } else {
                        return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                      }
                    } else {
                      return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                    }
                  }
                  if (drSummary[keyTicker]) {
                    const drEntry = drSummary[keyTicker];
                    if (keyTicker.match(/^\d+$/)) {
                      const normalizeToken = s => s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
                      const compTokens = normalizeToken(companyRaw).split(' ').filter(t => t.length >= 2);
                      const underTokens = normalizeToken((drEntry.underlyingName || '').toUpperCase()).split(' ').filter(t => t.length >= 2);
                      const overlap = compTokens.filter(ct => underTokens.includes(ct)).length;
                      if (overlap === 0) {
                        // reject
                      } else {
                        return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                      }
                    } else {
                      return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                    }
                  }
                }

                // 2) Exact company key match
                if (companyRaw) {
                  if (itemExchange && drSummary[`${companyRaw}|${itemExchange}`]) {
                    const drEntry = drSummary[`${companyRaw}|${itemExchange}`];
                    return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                  }
                  if (drSummary[companyRaw]) {
                    const drEntry = drSummary[companyRaw];
                    return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                  }
                }

                // 3) Token-overlap matching: compute best match among drSummary keys
                // Only consider DR entries whose exchange equals the earnings row exchange
                if (companyRaw) {
                  const normalize = (s) => s.replace(/[^A-Z0-9 ]/g, " ").replace(/\b(INC|LTD|PLC|NV|N V|N\.V\.|SA|S\.A\.)\b/g, " ").replace(/\s+/g, " ").trim();
                  const compNorm = normalize(companyRaw);
                  const compTokens = compNorm.split(' ').filter(t => t.length >= 2);
                  if (compTokens.length > 0) {
                    let bestKey = null;
                    let bestScore = 0;
                    Object.keys(drSummary).forEach(k => {
                      const kNorm = normalize(k);
                      const kTokens = kNorm.split(' ').filter(t => t.length >= 2);
                      if (kTokens.length === 0) return;
                      // require exchange equality to consider this dr entry
                      try {
                        const drEx = (drSummary[k] && drSummary[k].underlyingExchange) ? drSummary[k].underlyingExchange : "";
                        if (itemExchange && drEx && drEx !== itemExchange) return;
                      } catch (e) { /* ignore */ }
                      let score = 0;
                      compTokens.forEach(ct => { if (kTokens.includes(ct)) score += 1; });
                      // also give small bonus if one token startsWith the other (prefix)
                      compTokens.forEach(ct => { kTokens.forEach(kt => { if (kt.startsWith(ct) || ct.startsWith(kt)) score += 0.5; }); });
                      if (score > bestScore) { bestScore = score; bestKey = k; }
                    });

                    // Require reasonable confidence to avoid false positives
                    if (bestKey && (bestScore >= 2 || (bestScore >= 1 && compTokens.some(t => t.length > 4)))) {
                      const drEntry = drSummary[bestKey];
                      // If drEntry has an underlyingName and companyRaw has no token-overlap with it,
                      // then consider this a low-confidence numeric-only mapping and skip it to avoid false positives
                      if (drEntry && drEntry.underlyingName) {
                        const underlyingNorm = normalize((drEntry.underlyingName || "").toUpperCase());
                        const underTokens = underlyingNorm.split(' ').filter(t => t.length >= 2);
                        const overlap = compTokens.filter(ct => underTokens.includes(ct)).length;
                        if (overlap === 0 && bestKey.match(/^\d+$/)) {
                          // reject numeric mapping when company name doesn't match underlyingName
                          return item;
                        }
                      }
                      return { ...item, mostPopularDR: drEntry.mostPopularDR, highSensitivityDR: drEntry.highSensitivityDR };
                    }
                  }
                }

              } catch (e) { /* ignore */ }
              return item;
            });
          } catch (err) {
            console.warn('DR enrichment failed:', err);
          }

          // Filter out rows that do not have any DR mapped (mostPopularDR or highSensitivityDR)
          // Also exclude known false-positive tickers/companies (blacklist)
          const BLACKLIST_TICKERS = new Set(["3151", "3968", "8136"]);
          const BLACKLIST_COMPANY_KEYWORDS = ["VITAL KSK"];
          const finalFiltered = (finalData || []).filter(item => {
            if (!item) return false;
            if (BLACKLIST_TICKERS.has((item.ticker || "").toString())) return false;
            const companyUp = (item.company || "").toUpperCase();
            if (BLACKLIST_COMPANY_KEYWORDS.some(k => companyUp.includes(k))) return false;
            return (item.mostPopularDR || item.highSensitivityDR);
          });

          // Deduplicate earnings with same ticker and date but different currencies
          // Priority: VND > USD > JPY > CNY > TWD > SGD > HKD > EUR > THB > others
          const currencyPriority = {
            'VND': 10, 'USD': 9, 'JPY': 8, 'CNY': 7, 'CNH': 7,
            'TWD': 6, 'SGD': 5, 'HKD': 4, 'EUR': 3, 'THB': 1
          };

          const dedupMap = new Map();
          finalFiltered.forEach(item => {
            const key = `${item.ticker}-${item.date}`;
            const existing = dedupMap.get(key);

            if (!existing) {
              dedupMap.set(key, item);
            } else {
              // Compare currencies and keep the higher priority one
              const itemPriority = currencyPriority[item.currency] || 0;
              const existingPriority = currencyPriority[existing.currency] || 0;

              if (itemPriority > existingPriority) {
                dedupMap.set(key, item);
              } else if (itemPriority === existingPriority) {
                // If same priority, keep the one with larger market cap
                const itemMktCap = Number(item.marketCap) || 0;
                const existingMktCap = Number(existing.marketCap) || 0;
                if (itemMktCap > existingMktCap) {
                  dedupMap.set(key, item);
                }
              }
            }
          });

          const deduplicated = Array.from(dedupMap.values());
          setEarnings(deduplicated);
          setLastUpdateTime(apiUpdateTime || new Date());
          // Save all earnings for navbar badge persistence
          try {
            localStorage.setItem('calendar_all_earnings', JSON.stringify(deduplicated));
          } catch (e) { }
          const currentIds = new Set(deduplicated.map(e => `${e.ticker}-${e.date}`));

          // Load and use seen IDs from localStorage to count unseen items
          // This ensures "Mark all as read" persists after refresh
          try {
            const savedSeenIds = localStorage.getItem('calendar_seen_earnings');
            let seenSet = new Set();
            if (savedSeenIds) {
              const parsed = JSON.parse(savedSeenIds);
              if (Array.isArray(parsed)) {
                seenSet = new Set(parsed);
              }
            }

            // Update state to match localStorage
            setSeenEarningsIds(seenSet);

            const unseenIds = [...currentIds].filter(id => !seenSet.has(id));
            setNewEarningsCount(unseenIds.length);
          } catch (e) {
            // on error, count all as new
            setNewEarningsCount(currentIds.size);
          }

          // Do NOT mark as seen automatically on load. Only mark as seen when user clicks or marks all as read.
          setIsFirstLoad(false);
        }
      } catch (err) {
        if (!axios.isCancel(err)) {
          console.error(err);
          setEarnings([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    let fetchTimeoutId = setTimeout(() => {
      loadData(true);
    }, 100);

    // SSE Connection for real-time updates
    let eventSource = null;
    let reconnectTimeout = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseReconnectDelay = 1000;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(API_CONFIG.endpoints.earnings.stream);

        eventSource.onopen = () => {
          reconnectAttempts = 0;
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'new_earnings' && data.earnings) {
              // Process new earnings: do NOT auto-mark them as seen.
              const newEarnings = data.earnings;
              const newIds = new Set(newEarnings.map(e => `${e.ticker}-${e.date}`));

              // Update earnings list with only truly new items
              setEarnings(prev => {
                const existingIds = new Set(prev.map(e => `${e.ticker}-${e.date}`));
                const trulyNew = newEarnings.filter(e => !existingIds.has(`${e.ticker}-${e.date}`));
                if (trulyNew.length > 0) {
                  // increment unseen count by number of new items that are not in seen set
                  setNewEarningsCount(prevCount => {
                    // read persisted seen ids as fallback
                    let persistedSeen = new Set();
                    try {
                      const saved = localStorage.getItem('calendar_seen_earnings');
                      if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) persistedSeen = new Set(parsed);
                      }
                    } catch (e) { }

                    const newlyUnseen = trulyNew.filter(e => !persistedSeen.has(`${e.ticker}-${e.date}`)).length;
                    return prevCount + newlyUnseen;
                  });

                  if (data.updated_at) {
                    setLastUpdateTime(new Date(data.updated_at));
                  }

                  return [...prev, ...trulyNew];
                }
                return prev;
              });

            } else if (data.type === 'heartbeat') {
              return;
            } else if (data.type === 'connected') {
            }
          } catch (err) {
            // Silent error handling
          }
        };

        eventSource.onerror = (error) => {
          eventSource.close();

          // Attempt to reconnect with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectAttempts++;

            reconnectTimeout = setTimeout(() => {
              connectSSE();
            }, delay);
          } else {
            // Fallback to polling if SSE fails completely
            const fallbackInterval = setInterval(() => {
              loadData(false);
            }, 300000);

            return () => {
              clearInterval(fallbackInterval);
            };
          }
        };
      } catch (err) {
        // Silent error handling
      }
    };

    // Connect to SSE
    connectSSE();

    return () => {
      controller.abort();
      if (fetchTimeoutId) clearTimeout(fetchTimeoutId);
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [country]);

  const handleSort = (key) => {
    if (key === sortKey) {
      if (sortOrder === "asc") setSortOrder("desc");
      else { setSortKey(null); setSortOrder("asc"); }
    } else {
      setSortKey(key); setSortOrder("asc");
    }
  };

  const filtered = useMemo(() => {
    return earnings.filter((e) => {
      // Filter by search
      if (search.trim()) {
        const q = search.toUpperCase();
        const ticker = (e.ticker || "").toUpperCase();
        const company = (e.company || "").toUpperCase();
        const matchesSearch = ticker.includes(q) || company.includes(q);
        if (!matchesSearch) return false;
      }

      // Filter by day
      if (selectedDay !== "All") {
        const earningDate = new Date((e.date ?? 0) * 1000);
        if (isNaN(earningDate.getTime())) return false;
        const dayOfWeek = earningDate.getDay();
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const earningDayName = dayNames[dayOfWeek];
        if (earningDayName !== selectedDay) return false;
      }

      return true;
    });
  }, [earnings, search, selectedDay]);

  const sortedEarnings = useMemo(() => {
    // Backend already calculated DR metrics, just add isNew flag
    const withIsNew = filtered.map(e => {
      const earningId = `${e.ticker}-${e.date}`;
      const isNew = !seenEarningsIds.has(earningId);

      return {
        ...e,
        earningId,
        isNew
      };
    });

    let sorted;

    if (!sortKey) {
      sorted = withIsNew.sort((a, b) => {
        const dateA = new Date((a.date ?? 0) * 1000);
        const dateB = new Date((b.date ?? 0) * 1000);

        if (dateA.getTime() !== dateB.getTime()) {
          return dateA - dateB;
        }

        return String(a.ticker ?? "").localeCompare(String(b.ticker ?? ""));
      });
    } else {
      sorted = withIsNew.sort((a, b) => {
        const A = a[sortKey] ?? "";
        const B = b[sortKey] ?? "";

        if (sortKey === "date") {
          return sortOrder === "asc"
            ? new Date(A) - new Date(B)
            : new Date(B) - new Date(A);
        }

        if (sortKey === "popularDR") {
          return sortOrder === "asc"
            ? (a.mostPopularDR?.volume || 0) - (b.mostPopularDR?.volume || 0)
            : (b.mostPopularDR?.volume || 0) - (a.mostPopularDR?.volume || 0);
        }

        if (sortKey === "sensitivityDR") {
          const bidA = a.highSensitivityDR?.bid || Infinity;
          const bidB = b.highSensitivityDR?.bid || Infinity;
          return sortOrder === "asc" ? bidA - bidB : bidB - bidA;
        }

        const numA = parseFloat(String(A).replace(/[^0-9.-]+/g, ""));
        const numB = parseFloat(String(B).replace(/[^0-9.-]+/g, ""));

        if (!isNaN(numA) && !isNaN(numB) && !["ticker", "company", "period"].includes(sortKey)) {
          return sortOrder === "asc" ? numA - numB : numB - numA;
        }

        return sortOrder === "asc"
          ? String(A).localeCompare(String(B))
          : String(B).localeCompare(String(A));
      });
    }

    // Separate new and old earnings, then put new ones first
    const newEarnings = sorted.filter(e => e.isNew);
    const oldEarnings = sorted.filter(e => !e.isNew);

    return [...newEarnings, ...oldEarnings];
  }, [filtered, sortKey, sortOrder, seenEarningsIds]);

  // Function to mark earnings as seen
  const markAsSeen = (earningId) => {
    setSeenEarningsIds(prev => {
      const updated = new Set(prev);
      updated.add(earningId);
      try {
        localStorage.setItem('calendar_seen_earnings', JSON.stringify([...updated]));
      } catch (e) {
        // ignore storage errors
      }
      return updated;
    });
    setNewEarningsCount(prev => Math.max(0, prev - 1));
  };

  // Mark all as seen
  const markAllAsSeen = () => {
    try {
      const allIds = earnings.map(e => `${e.ticker}-${e.date}`);
      const allSet = new Set(allIds);
      setSeenEarningsIds(allSet);
      setNewEarningsCount(0);
      // Persist immediately so refresh retains the "read" state
      localStorage.setItem('calendar_seen_earnings', JSON.stringify(allIds));
    } catch (e) {
      // ignore storage errors
    }
  };

  // Force refresh earnings data
  const forceRefresh = async () => {
    try {
      setLoading(true);
      const response = await axios.post(API_CONFIG.endpoints.earnings.refresh || 'http://localhost:8000/earnings/api/earnings/refresh');
      if (response.data.success) {
        // Reload data after successful refresh
        window.location.reload();
      } else {
        console.error('Refresh failed:', response.data.error);
        alert('Failed to refresh data: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Refresh error:', error);
      alert('Failed to refresh data. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  const SortIndicator = ({ colKey }) => {
    const active = sortKey === colKey;
    const direction = sortOrder;
    const upColor = active && direction === "asc" ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)";
    const downColor = active && direction === "desc" ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)";

    return (
      <div className="flex items-center ml-0 shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-[10px] sm:w-[12px] h-[10px] sm:h-[12px] transition-all duration-200">
          <path d="M14 2.256V30c-2.209 0-4-1.791-4-4V13H4.714c-.633 0-.949-.765-.502-1.212l9.607-9.607C13.886 2.114 14 2.162 14 2.256z" fill={upColor} />
          <path d="M27.788 20.212l-9.6 9.6C18.118 29.882 18 29.832 18 29.734V2c2.209 0 4 1.791 4 4v13h5.286C27.918 19 28.235 19.765 27.788 20.212z" fill={downColor} />
        </svg>
      </div>
    );
  };

  return (
    <div className="h-screen w-full bg-[#F5F5F5 dark:bg-[#151D33]] overflow-hidden flex justify-center">
      <div className="w-full max-w-[1248px] flex flex-col h-full">
        <div className="pt-6 sm:pt-10 pb-0 px-4 sm:px-0 flex-shrink-0" style={{ overflow: 'visible', zIndex: 100 }}>
          <div className="w-full lg:w-[1040px] max-w-full mx-auto lg:scale-[1.2] lg:origin-top" style={{ overflow: 'visible' }}>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 sm:mb-3 text-black dark:text-white">Earnings Calendar</h1>
            <p className="text-[#6B6B6B] dark:text-white/70 mb-8 sm:mb-6 md:mb-8 text-xs sm:text-sm md:text-base">Earnings Schedule for Companies with DRs Traded in Thailand.</p>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4 mb-2">
              <div className="relative z-[200] w-full md:w-auto" ref={countryDropdownRef} style={{ isolation: 'isolate', overflow: 'visible' }}>
                <button
                  type="button"
                  onClick={() => setShowCountryMenu((prev) => !prev)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-none bg-white dark:bg-[#595959] dark:text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-[#4A4A4A] focus:outline-none focus:ring-2 focus:ring-[#0B102A] dark:focus:ring-0 w-full lg:w-[202.5px]"
                  style={{ height: '37.33px', width: undefined }}
                >
                  <span className="truncate flex items-center gap-2">
                    {selectedCountryOption.flag ? (
                      <img
                        src={`https://flagcdn.com/${selectedCountryOption.flag}.svg`}
                        srcSet={`https://flagcdn.com/w40/${selectedCountryOption.flag}.png 2x, https://flagcdn.com/w20/${selectedCountryOption.flag}.png 1x`}
                        alt="flag"
                        className="w-5 h-5 object-contain rounded-sm"
                        onError={(e) => { if (!e.target.dataset.fallback) { e.target.dataset.fallback = '1'; e.target.src = `https://flagcdn.com/w40/${selectedCountryOption.flag}.png`; } }}
                      />
                    ) : (selectedCountryOption.code === 'All' || selectedCountryOption.code === 'all') ? (
                      <i className="bi bi-globe text-gray-400 dark:text-white" style={{ fontSize: '16px', lineHeight: '16px' }}></i>
                    ) : null}
                    <span>{selectedLabel}</span>
                  </span>
                  <svg className={`h-4 w-4 flex-shrink-0 transition-transform text-gray-500 dark:text-white ${showCountryMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showCountryMenu && (
                  <div className="absolute left-0 top-full z-[9999] mt-2 w-full sm:w-56 max-h-72 overflow-auto hide-scrollbar rounded-2xl border border-gray-200 dark:border-none bg-white dark:bg-[#595959] dark:text-white shadow-[0_10px_30px_rgba(15,23,42,0.15)] py-1" style={{ transform: 'translateZ(0)' }}>
                    {countryOptions.map((opt) => (
                      <button
                        key={opt.code}
                        onClick={() => { setCountry(opt.code); setShowCountryMenu(false); trackFilter('country', opt.label); }}
                        className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-xs sm:text-sm transition-colors ${country === opt.code ? "bg-[#EEF2FF] text-[#0B102A] font-semibold dark:bg-[#4A4A4A] dark:text-white" : "text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-[#4A4A4A]"}`}
                      >
                        <span className="flex items-center gap-2">
                          {opt.flag ? (
                            <img
                              src={`https://flagcdn.com/${opt.flag}.svg`}
                              srcSet={`https://flagcdn.com/w40/${opt.flag}.png 2x, https://flagcdn.com/w20/${opt.flag}.png 1x`}
                              alt="flag"
                              className="w-5 h-5 object-contain rounded-sm"
                              onError={(e) => { if (!e.target.dataset.fallback) { e.target.dataset.fallback = '1'; e.target.src = `https://flagcdn.com/w40/${opt.flag}.png`; } }}
                            />
                          ) : (opt.code === 'all' || opt.code === 'All') ? (
                            <i className="bi bi-globe text-gray-400 dark:text-white" style={{ fontSize: '16px', lineHeight: '16px' }}></i>
                          ) : null}
                          <span>{opt.label}</span>
                        </span>
                        {/* Removed check icon per request */}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative w-full md:w-auto">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="bg-white dark:bg-[#595959] dark:border-none text-gray-900 dark:text-white placeholder:text-gray-400 placeholder:dark:text-white/70 pl-3 sm:pl-4 pr-10 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B102A] dark:focus:ring-0 w-full md:w-64 text-xs sm:text-sm shadow-sm h-[37.33px]" />
                <i className="bi bi-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-white" style={{ fontSize: 14 }} />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-2 gap-2">
              <div className="overflow-x-auto pb-1">
                <div className="inline-flex items-center gap-2 sm:gap-3 bg-white dark:bg-[#595959] dark:border-none dark:text-white rounded-xl px-2 py-1.5 shadow-sm border border-gray-100 min-w-full sm:min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-white whitespace-nowrap">Days</span>
                  <div className="flex justify-between flex-1 sm:gap-2">
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => {
                      const isSelected = selectedDay === day;
                      const shortDay = day.substring(0, 3);
                      return (
                        <button
                          key={day}
                          onClick={() => {
                            const nextDay = isSelected ? "All" : day;
                            setSelectedDay(nextDay);
                            trackFilter('day', nextDay);
                          }}
                          className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${isSelected
                            ? "bg-[#0B102A] text-white ring-2 ring-offset-1 ring-black/10 shadow-md scale-105 dark:bg-[#4A4A4A] dark:ring-white/20"
                            : "text-gray-600 opacity-60 hover:opacity-100 dark:text-white dark:opacity-60 dark:hover:opacity-100"
                            }`}
                        >
                          <span className="hidden sm:inline">{day}</span>
                          <span className="sm:hidden">{shortDay}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-[10px] sm:text-xs text-gray-500 pr-1 mt-0 md:mt-1">
                <div>Found {sortedEarnings.length.toLocaleString()} results</div>
                {lastUpdateTime && (
                  <div className="text-right">Last Updated: {lastUpdateTime.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-end gap-2 text-[10px] sm:text-xs text-gray-500 pr-1 mb-5">
              <button
                onClick={forceRefresh}
                disabled={loading}
                className="text-green-600 dark:text-[#4CE60F] hover:text-green-700 dark:hover:text-[#4CE60F]/80 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Refresh earnings data"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Data
              </button>
              {sortedEarnings.filter(e => e.isNew).length > 0 && (
                <button
                  onClick={markAllAsSeen}
                  className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  title="Mark all as read"
                >
                  Mark all as read ({sortedEarnings.filter(e => e.isNew).length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-hidden pb-6 sm:pb-10 -mt-2 md:mt-9 px-4 sm:px-0">
          <div className="h-full bg-white dark:bg-[#0B0E14] dark:border-white/10 dark:text-white rounded-xl shadow-[0_2px_10px_rgba(0,0,0,0.03)] overflow-auto hide-scrollbar">

            {/* Mobile Card View */}
            <div className="block lg:hidden">
              <div className="space-y-3">
                {loading ? (
                  <CalendarCardSkeleton count={8} />
                ) : sortedEarnings.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3 text-center text-gray-700 dark:text-gray-200">
                    <div className="empty-icon-wrapper">
                      <svg className="empty-icon empty-pulse w-28 h-28 ml-4" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <rect x="6" y="10" width="52" height="44" rx="6" fill="#F0F7FF" stroke="#D4E8FF" strokeWidth="1.5" />
                        <rect x="10" y="6" width="12" height="8" rx="2" fill="#2F80ED" />
                        <rect x="42" y="6" width="12" height="8" rx="2" fill="#2F80ED" />
                        <rect x="12" y="20" width="40" height="4" rx="2" fill="#E6F0FF" />
                        <g className="dot-group">
                          <circle className="dot dot-1" cx="20" cy="42" r="3.5" fill="#0B102A" />
                          <circle className="dot dot-2" cx="32" cy="42" r="3.5" fill="#0B102A" />
                          <circle className="dot dot-3" cx="44" cy="42" r="3.5" fill="#0B102A" />
                        </g>
                      </svg>
                    </div>
                    <div className="text-lg font-semibold">No upcoming earnings</div>
                    <div className="text-sm text-gray-500">You're all caught up — no scheduled earnings.</div>
                  </div>
                ) : (
                  sortedEarnings.map((e, i) => {
                    const isFuture = (e.date * 1000) > Date.now();
                    const displayEpsRep = isFuture ? "-" : e.epsReported;
                    const displaySurprise = isFuture ? "-" : e.surprise;
                    const displayPctSurprise = isFuture ? "-" : e.pctSurprise;
                    const displayRevAct = isFuture ? "-" : e.revenueActual;

                    const bgColor = e.isNew
                      ? "bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-600 dark:border-l-blue-500"
                      : "bg-white dark:bg-[#23262A] dark:border-white/10 dark:text-white";

                    return (
                      <div
                        key={i}
                        onClick={() => e.isNew && markAsSeen(e.earningId)}
                        className={`rounded-xl shadow-sm border border-gray-200 dark:border-white/10 p-3 cursor-pointer hover:shadow-md transition-shadow ${bgColor}`}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {!logoErrors[e.ticker] ? (
                                <img
                                  src={(() => {
                                    const companyName = e.company || '';
                                    const slug = getCalendarLogoSlug(companyName, e.ticker);
                                    return `https://s3-symbol-logo.tradingview.com/${slug}.svg`;
                                  })()}
                                  alt={e.ticker}
                                  className="w-full h-full object-contain rounded-lg"
                                  onError={() => setLogoErrors(prev => ({ ...prev, [e.ticker]: true }))}
                                />
                              ) : (
                                <span className="w-8 h-8 rounded-lg bg-slate-600/50 flex items-center justify-center text-xs font-bold text-white">
                                  {e.ticker?.[0] || "?"}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-[#2F80ED] text-sm truncate">{e.ticker}</div>
                              <div className="text-xs text-gray-600 truncate dark:text-gray-300">{e.company}</div>
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {formatMarketCapValue(e.marketCap, e.currency, true)}
                          </div>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-2 mb-2 pb-2 border-b border-gray-400">
                          <div className="text-left">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Earnings Date</div>
                            <div className="text-xs text-gray-900 dark:text-white font-medium">{formatDate(e.date)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Period End</div>
                            <div className="text-xs text-gray-900 dark:text-white font-medium">{formatDate(e.period)}</div>
                          </div>
                        </div>

                        {/* DR Info */}
                        {(e.mostPopularDR || e.highSensitivityDR) && (
                          <div className="grid grid-cols-2 gap-2 mb-2 pb-2 border-b border-gray-400">
                            {e.mostPopularDR && (
                              <div className="text-left">
                                <div className="text-[10px] text-gray-500 dark:text-white/60">Popular DR</div>
                                <div className="font-bold text-[#50B728] dark:text-[#4CE60F] text-xs truncate">{e.mostPopularDR.symbol}</div>
                                <div className="text-[10px] text-gray-600 dark:text-white/80">Vol: {e.mostPopularDR.volume > 0 ? formatInt(e.mostPopularDR.volume) : "-"}</div>
                              </div>
                            )}
                            {e.highSensitivityDR && (
                              <div className="text-right">
                                <div className="text-[10px] text-gray-500 dark:text-white/60">Sensitivity DR</div>
                                <div className="font-bold text-[#0007DE] text-xs truncate">{e.highSensitivityDR.symbol}</div>
                                <div className="text-[10px] text-gray-600 dark:text-white/80">Bid: {e.highSensitivityDR.bid > 0 ? formatPrice(e.highSensitivityDR.bid) : "-"}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* EPS & Revenue */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="text-left">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">EPS Est.</div>
                            <div className="flex justify-start">{formatColoredValue(e.epsEstimate, e.currency)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">EPS Rep.</div>
                            <div>{formatColoredValue(displayEpsRep, e.currency)}</div>
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Surprise</div>
                            <div className="flex justify-start">{formatColoredValue(displaySurprise, "", e.currency)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">%Surprise</div>
                            <div>{formatColoredValue(displayPctSurprise, "%")}</div>
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Rev Forecast</div>
                            <div className="flex justify-start">{formatValue(e.revenueForecast, e.currency, true)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">Rev Actual</div>
                            <div>{formatValue(displayRevAct, e.currency, true)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Desktop Table View */}
            <table className="hidden lg:table min-w-[1300px] w-full text-left border-collapse text-[14.4px]">
              <colgroup>
                <col style={{ width: '250px', maxWidth: '250px' }} />
                <col style={{ minWidth: '90px' }} />
                <col style={{ minWidth: '90px' }} />
                <col style={{ minWidth: '110px' }} />
                <col style={{ minWidth: '110px' }} />
                <col style={{ minWidth: '90px' }} />
                <col style={{ minWidth: '90px' }} />
                <col style={{ minWidth: '100px' }} />
                <col style={{ minWidth: '100px' }} />
                <col style={{ minWidth: '150px' }} />
              </colgroup>
              <thead className="bg-[#0B102A] text-white font-semibold sticky top-0" style={{ zIndex: 50 }}>
                <tr className="h-[50px]">
                  {[
                    { k: "ticker", l: "Symbol", a: "left" },
                    { k: "date", l: "Date", a: "right" },
                    { k: "period", l: "Period End", a: "right" },
                    { k: "popularDR", l: "Most Popular DR", a: "center" },
                    { k: "sensitivityDR", l: "High Sensitivity DR", a: "center" },
                    { k: "epsEstimate", l: "EPS Est.", a: "right" },
                    { k: "epsReported", l: "EPS Rep.", a: "right" },
                    { k: "revenueForecast", l: "Rev Forecast", a: "right" },
                    { k: "revenueActual", l: "Rev Actual", a: "right" },
                    { k: "marketCap", l: "Market Cap", a: "center" }
                  ].map((h) => (
                    <th key={h.k} onClick={() => handleSort(h.k)} className="cursor-pointer transition-colors relative whitespace-nowrap px-4">
                      <div className={`flex items-center ${h.a === "right" ? "justify-end" : h.a === "center" ? "justify-center" : "justify-start"} gap-0.5`}>
                        {h.l} <SortIndicator colKey={h.k} />
                      </div>
                      {sortKey === h.k && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2F80ED] z-50">
                          <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-[#2F80ED]"></div>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="">
                {loading ? (
                  <CalendarTableSkeleton rows={12} />
                ) : sortedEarnings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-0">
                      <div className="w-full h-[50vh] flex items-center justify-start pl-117">
                        <div className="text-center">
                          <div className="empty-icon-wrapper mb-4">
                            <svg className="empty-icon empty-pulse w-36 h-36 ml-20" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                              <rect x="6" y="10" width="52" height="44" rx="6" fill="#F0F7FF" stroke="#D4E8FF" strokeWidth="1.5" />
                              <rect x="10" y="6" width="12" height="8" rx="2" fill="#2F80ED" />
                              <rect x="42" y="6" width="12" height="8" rx="2" fill="#2F80ED" />
                              <rect x="12" y="20" width="40" height="4" rx="2" fill="#E6F0FF" />
                              <g className="dot-group">
                                <circle className="dot dot-1" cx="20" cy="42" r="4" fill="#0B102A" />
                                <circle className="dot dot-2" cx="32" cy="42" r="4" fill="#0B102A" />
                                <circle className="dot dot-3" cx="44" cy="42" r="4" fill="#0B102A" />
                              </g>
                            </svg>
                          </div>
                          <div className="text-2xl font-semibold text-gray-700 dark:text-gray-200">No upcoming earnings</div>
                          <div className="text-sm text-gray-500">You're all caught up — no scheduled earnings.</div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedEarnings.map((e, i) => {
                    const isFuture = (e.date * 1000) > Date.now();
                    const displayEpsRep = isFuture ? "-" : e.epsReported;
                    const displaySurprise = isFuture ? "-" : e.surprise;
                    const displayPctSurprise = isFuture ? "-" : e.pctSurprise;
                    const displayRevAct = isFuture ? "-" : e.revenueActual;

                    const rowBg = i % 2 === 0 ? "bg-[#FFFFFF] dark:bg-[#2D3136]" : "bg-[#F3F4F6] dark:bg-[#24272B]";
                    const highlightClass = e.isNew ? "bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-600 dark:border-l-blue-500" : rowBg;

                    return (
                      <tr
                        key={i}
                        className={`transition-colors duration-200 ${highlightClass} hover:bg-gray-50 dark:hover:bg-white/5 dark:text-white cursor-pointer`}
                        style={{ height: "53.6px" }}
                        onClick={() => e.isNew && markAsSeen(e.earningId)}
                      >
                        <td className="px-4 align-middle overflow-hidden" style={{ width: '250px', maxWidth: '250px' }}>
                          <div className="flex items-center gap-2 overflow-hidden w-full min-w-0">
                            <div className="w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden">
                              {!logoErrors[e.ticker] ? (
                                <img
                                  src={(() => {
                                    const companyName = e.company || '';
                                    const slug = getCalendarLogoSlug(companyName, e.ticker);
                                    return `https://s3-symbol-logo.tradingview.com/${slug}.svg`;
                                  })()}
                                  alt={e.ticker}
                                  className="w-full h-full object-contain rounded-xl"
                                  onError={() => setLogoErrors(prev => ({ ...prev, [e.ticker]: true }))}
                                />
                              ) : (
                                <span className="w-10 h-10 rounded-xl bg-slate-600/50 flex items-center justify-center text-sm font-bold text-white">
                                  {e.ticker?.[0] || "?"}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col overflow-hidden w-full min-w-0">
                              <span className="font-bold text-[#2F80ED] text-[14.4px] leading-tight truncate" title={e.ticker}>{e.ticker}</span>
                              <span className="text-[12.4px] text-gray-500 dark:text-white/80 truncate" title={e.company}>{e.company}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 align-middle text-right text-gray-800 dark:text-white font-medium whitespace-nowrap">
                          {formatDate(e.date)}
                        </td>
                        <td className="px-4 align-middle text-right text-gray-800 dark:text-white font-medium whitespace-nowrap">
                          {formatDate(e.period)}
                        </td>
                        <td className="px-4 align-middle text-center">
                          {e.mostPopularDR ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-bold text-[#50B728] dark:text-[#4CE60F]">{e.mostPopularDR.symbol}</span>
                              <span className="text-gray-600 dark:text-white/80 text-[13.4px]">Vol: {e.mostPopularDR.volume > 0 ? formatInt(e.mostPopularDR.volume) : "-"}</span>
                            </div>
                          ) : <span className="text-gray-600 dark:text-white/60">-</span>}
                        </td>
                        <td className="px-4 align-middle text-center">
                          {e.highSensitivityDR ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-bold text-[#0007DE] dark:text-[#4A90FF]">{e.highSensitivityDR.symbol}</span>
                              <span className="text-gray-600 dark:text-white/80 text-[13.4px]">Bid: {e.highSensitivityDR.bid > 0 ? <span className="font-mono">{formatPrice(e.highSensitivityDR.bid)}</span> : "-"}</span>
                            </div>
                          ) : <span className="text-gray-600 dark:text-white/60">-</span>}
                        </td>
                        <td className="px-4 align-middle text-right text-gray-800 dark:text-white font-medium">{formatColoredValue(e.epsEstimate, e.currency)}</td>
                        <td className="px-4 align-middle text-right text-gray-800 dark:text-white font-semibold">{formatColoredValue(displayEpsRep, e.currency)}</td>
                        {/* Surprise and %Surprise columns removed */}
                        <td className="px-4 align-middle text-right text-gray-800 dark:text-white font-medium">{formatValue(e.revenueForecast, e.currency, true)}</td>
                        <td className="px-4 align-middle text-right text-gray-800 dark:text-white font-semibold">{formatValue(displayRevAct, e.currency, true)}</td>
                        <td className="px-4 align-middle text-center text-gray-800 dark:text-white font-medium">{formatMarketCapValue(e.marketCap, e.currency, true)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
