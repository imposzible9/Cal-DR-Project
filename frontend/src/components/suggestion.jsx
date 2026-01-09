  import React, { useState, useEffect, useMemo, useRef } from "react";

  // const API_URL = "http://172.17.1.85:8333/dr";
  const API_URL = "https://api.ideatrade1.com/caldr";

  // const RATINGS_API = "http://172.18.1.56:8335/ratings/from-dr-api";
  const RATINGS_API = "https://api.ideatrade1.com/caldr?ratings=true";

  // --- Constants & Helpers ---
  const countryOptions = [
    { code: "All", label: "All Markets" },
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
    if (!rating) return "bg-gray-100 text-gray-400";
    const r = rating.toLowerCase();
    if (r === "strong buy") return "bg-[#E6F4EA] text-[#137333]";
    if (r === "buy") return "text-[#137333]";
    if (r === "neutral") return "text-[#3C4043]";
    if (r === "sell") return "text-[#A50E0E]";
    if (r === "strong sell") return "bg-[#FCE8E6] text-[#A50E0E]";
    return "bg-transparent text-gray-400";
  };

  const getRatingTextColor = (rating) => {
    if (!rating) return "text-[#9CA3AF]";
    const r = rating.toLowerCase();
    if (r === "strong buy" || r === "buy") return "text-[#137333]";
    if (r === "neutral") return "text-[#5F6368]";
    if (r === "sell" || r === "strong sell") return "text-[#A50E0E]";
    return "text-[#9CA3AF]";
  };

  // Helper function to filter out Neutral from history
  const filterNeutralFromHistory = (history) => {
    if (!history || history.length === 0) return [];
    return history.filter(item => item.rating && item.rating.toLowerCase() !== "neutral");
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
        <span className="font-medium text-gray-600 text-[14.4px]">{formatPrice(price)}</span>
        <span className="text-[14.4px] text-gray-400 font-normal uppercase">{currency}</span>
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
      <div className="relative z-[60]" ref={ref}>
        <button onClick={() => setIsOpen(!isOpen)} className="flex items-center justify-between gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm min-w-[140px] hover:border-gray-300 transition-colors shadow-sm h-[37.33px]">
          <span className="text-gray-600 font-medium truncate">{currentLabel}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-100 rounded-xl shadow-lg z-[100] py-1 overflow-hidden">
            {options.map((opt) => (
              <button key={opt.val} onClick={() => { onSelect(opt.val); setIsOpen(false); }} className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-50 ${value === opt.val ? "text-[#0B102A] font-semibold bg-gray-50" : "text-gray-600"}`}>
                {opt.color && <span className={`w-2 h-2 rounded-full ${opt.color}`}></span>}{opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const RatingChangeCell = ({ prev, current, showChange }) => {
    if (!current || current === "Unknown") return <span className="text-gray-300">-</span>;
    const prevDisplay = prev && prev !== "Unknown" ? prev : "-";
    const prevTextColor = prev && prev !== "Unknown" ? getRatingTextColor(prev) : "text-gray-400";
    const shouldShowPrev = showChange;

    return (
      <div className="flex items-center justify-center h-full relative">
        <div className={`flex items-center gap-2 transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] ${shouldShowPrev ? "opacity-100" : "opacity-0 w-0 overflow-hidden"}`}>
          <div className={`text-[14.4px] font-bold text-center ${prevTextColor}`} style={{ minWidth: '85px', width: '85px' }}>
            <span className="whitespace-nowrap">
              {prevDisplay}
            </span>
          </div>
          <div className="flex items-center justify-center mx-1" style={{ minWidth: '16px', width: '16px' }}>
            <svg className="w-2.5 h-2.5 text-[#9CA3AF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        </div>
        <div className="flex justify-center" style={{ minWidth: '85px', width: '85px' }}>
          <span className={`px-2 py-1 rounded text-[14.4px] font-bold whitespace-nowrap text-center transition-all duration-500 ${getRatingStyle(current)}`}>
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
        className="fixed z-[5000] pointer-events-none transition-opacity duration-200"
        style={{
          left: `${position.x}px`,
          top: `${position.y - 10}px`,
          transform: 'translate(-50%, -100%)',
          opacity: show ? 1 : 0
        }}
      >
        <div className="bg-[#0B102A] text-white text-xs font-medium px-3 py-2 rounded-lg shadow-xl border border-white/10 backdrop-blur-sm whitespace-nowrap relative">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-blue-50">{children}</span>
          </div>
          <div className="absolute bottom-[-6px] left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#0B102A]"></div>
        </div>
      </div>
    );
  };

  // --- RatingHistoryModal ---
  const RatingHistoryModal = ({ item, timeframe, onClose }) => {
    const historyData = useMemo(() => {
      if (!item) return [];
      const rawHistory = timeframe === "1D" ? (item.ratingDayHistory || []) : (item.ratingWeekHistory || []);
      
      // 🔥 Filter out Neutral ratings
      const filteredHistory = filterNeutralFromHistory(rawHistory);
      
      if (filteredHistory.length < 2) return [];
      
      const sortedHistory = [...filteredHistory].sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      
      return sortedHistory.map((log, index) => {
          const previousLog = sortedHistory[index + 1];
          if (!previousLog) return null;
          
          let rawDate = log.timestamp || log.date;
          let dateTimeStr = rawDate;
          try { 
              const d = new Date(rawDate); 
              if (!isNaN(d.getTime())) {
                  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  const timeStr = d.getHours().toString().padStart(2, '0') + ":" + d.getMinutes().toString().padStart(2, '0');
                  dateTimeStr = `${dateStr.replace(/ /g, ' ')} ${timeStr}`;
              }
          } catch(e) {}

          return { 
            dateTime: dateTimeStr,
            prev: previousLog.rating, 
            current: log.rating 
          };
      }).filter(log => log !== null); 
    }, [item, timeframe]);

    if (!item) return null;

    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-[#0B102A]/40 backdrop-blur-md transition-opacity" onClick={onClose}></div>
        <div className="relative bg-white w-full max-w-[480px] rounded-[2rem] shadow-2xl overflow-hidden transform scale-[1.2] transition-all animate-in fade-in zoom-in duration-300">
          
          {/* Header - Removed tracking styles to match main font */}
          <div className="bg-[#0B102A] px-8 py-6 flex justify-between items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white">{item.displaySymbol}</h3>
              <p className="text-xs text-blue-200/60 font-medium uppercase mt-0.5">{item.displayName}</p>
            </div>
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-all active:scale-95">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* History Content */}
          <div className="p-8 bg-white max-h-[70vh] overflow-y-auto no-scrollbar">
            {historyData.length > 0 ? (
              <div className="relative">
                <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-gray-100 via-gray-200 to-gray-100"></div>

                <div className="space-y-8">
                  {historyData.map((log, idx) => {
                      const scorePrev = RATING_SCORE[log.prev.toLowerCase()] || 0;
                      const scoreCurr = RATING_SCORE[log.current.toLowerCase()] || 0;
                      
                      let dotBg = "bg-gray-400";
                      let Icon = null;
                      if (scoreCurr > scorePrev) {
                        dotBg = "bg-[#27AE60]";
                        Icon = () => <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>;
                      } else if (scoreCurr < scorePrev) {
                        dotBg = "bg-[#EB5757]";
                        Icon = () => <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>;
                      } else {
                        Icon = () => <div className="w-1.5 h-1.5 bg-white rounded-full"></div>;
                      }

                      return (
                        <div key={idx} className="relative pl-10 group animate-in slide-in-from-left duration-500" style={{ animationDelay: `${idx * 50}ms` }}>
                          <div className={`absolute left-0 top-1 w-[24px] h-[24px] rounded-full border-4 border-white shadow-md z-10 flex items-center justify-center transition-transform group-hover:scale-110 ${dotBg}`}>
                            <Icon />
                          </div>
                          
                          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all border-l-4 border-l-transparent hover:border-l-blue-500">
                            <div className="flex justify-end items-center mb-4">
                              <span className="text-[10px] font-bold text-gray-400">{log.dateTime}</span>
                            </div>
                            
                            <div className="flex items-center justify-between gap-2">
                                {/* Removed "From" label and rating frame */}
                                <div className="flex-1 flex flex-col items-center">
                                  <span className={`text-[12px] font-bold w-full text-center ${getRatingTextColor(log.prev)}`}>{log.prev}</span>
                                </div>
                                
                                <div className="flex flex-col items-center justify-center">
                                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                </div>

                                {/* Removed "To" label and rating frame */}
                                <div className="flex-1 flex flex-col items-center">
                                  <span className={`text-[12px] font-bold w-full text-center ${getRatingTextColor(log.current)}`}>{log.current}</span>
                                </div>
                            </div>
                          </div>
                        </div>
                      );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center">
                <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <svg className="w-10 h-10 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h4 className="text-gray-900 font-bold text-lg">No signal changes yet</h4>
                <p className="text-gray-400 text-sm mt-2 max-w-[200px] mx-auto">We'll notify you as soon as the technical trend shifts.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  export default function Suggestion() {
    const [timeframe, setTimeframe] = useState("1D");
    const [country, setCountry] = useState("All");
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
    const selectedCountryLabel = useMemo(() => countryOptions.find((c) => c.code === country)?.label || "All Markets", [country]);
    
    const [hoveredRow, setHoveredRow] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const tableRef = useRef(null);

    useEffect(() => {
      const handler = (e) => { if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target)) setShowCountryMenu(false); };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
      let isMounted = true;
      async function fetchData() {
        try {
          const [resDR, resRating] = await Promise.all([ fetch(API_URL), fetch(RATINGS_API) ]);
          
          // Check if responses are ok
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
              let uName = item.underlying || (item.symbol || "").toUpperCase().replace(/\d+$/, "").toUpperCase().trim();
              if (!drByUnderlying.has(uName)) {
                  drByUnderlying.set(uName, []);
              }
              drByUnderlying.get(uName).push(item);
          });
          
          const underlyingMap = new Map();
          drByUnderlying.forEach((drList, uName) => {
              // Calculate Most Popular DR (highest volume)
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
              
              // If no DR with volume found, use the first DR even if volume is 0
              if (!mostPopularDR && drList.length > 0) {
                  mostPopularDR = {
                      symbol: drList[0].symbol || "",
                      volume: 0
                  };
              }
              
              // Calculate High Sensitivity DR (lowest bid > 0)
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
              
              // If only one DR exists, use it for both columns
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
          setData(Array.from(underlyingMap.values()));
          setLoading(false);
        } catch (err) { 
          if(isMounted) {
            console.error('Error fetching data:', err);
            setLoading(false);
          }
        }
      }
      fetchData();
      const intervalId = setInterval(fetchData, 60000); 
      return () => { isMounted = false; clearInterval(intervalId); };
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
        // Use rating directly from DB (latest timestamp record)
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
      if (country !== "All") mapped = mapped.filter(row => row.exchangeCountry === country);
      
      // 🔥 Filter out Neutral ratings from display
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
    }, [data, searchTerm, timeframe, sortConfig, filterRating, changeFilter, country]);

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

    const handleRatingFilterClick = (rating) => { if (filterRating === rating) setFilterRating(null); else setFilterRating(rating); };
    const RATINGS_OPTIONS = ["Strong Buy", "Buy", "Sell", "Strong Sell"];
    const CHANGE_OPTIONS = [ { label: "Latest Only", val: "All" }, { label: "Show Changes", val: "ShowChanges", color: "bg-blue-500" }, { label: "Positive", val: "Positive", color: "bg-[#137333]" }, { label: "Negative", val: "Negative", color: "bg-[#C5221F]" } ];
    const shouldShowChange = filterRating !== null || changeFilter !== "All";

    return (
      <div className="h-screen w-full bg-[#f5f5f5] overflow-hidden flex justify-center">
        {/* ✅ กำหนดความกว้างสูงสุดของหน้า Suggestion ที่ 1248px */}
        <div className="w-full max-w-[1248px] flex flex-col h-full">
          {/* ✅ ส่วนหัว + ฟิลเตอร์: ใช้ความกว้างฐาน 1040px แล้วค่อย scale 1.2 → กว้างสุด ~1248px */}
          <div className="pt-10 pb-0 px-0 flex-shrink-0" style={{ overflow: 'visible', zIndex: 100 }}>
            <div className="w-[1040px] max-w-full mx-auto scale-[1.2] origin-top" style={{ overflow: 'visible' }}>
              <h1 className="text-3xl font-bold mb-3 text-black">Suggestion</h1>
              <p className="text-[#6B6B6B] mb-8 text-sm md:text-base">Technical Ratings (Underlying Assets)</p>
              
              {/* Filters Row */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-2">
            <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm h-[37.33px]">
                  <button onClick={() => setTimeframe("1D")} className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${timeframe === "1D" ? "bg-[#0B102A] text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}>1 Day</button>
                  <button onClick={() => setTimeframe("1W")} className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${timeframe === "1W" ? "bg-[#0B102A] text-white shadow-md" : "text-gray-600 hover:bg-gray-50"}`}>1 Week</button>
                </div>
                <div className="relative z-[200]" ref={countryDropdownRef} style={{ isolation: 'isolate', overflow: 'visible' }}>
                  <button type="button" onClick={() => setShowCountryMenu((prev) => !prev)} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 min-w-[180px] h-[37.33px]">
                    <span>{selectedCountryLabel}</span>
                    <svg className={`h-4 w-4 transition-transform text-gray-500 ${showCountryMenu ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showCountryMenu && (
                    <div className="absolute left-0 top-full z-[9999] mt-2 w-56 max-h-72 overflow-auto rounded-2xl border border-gray-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.15)] py-1" style={{ transform: 'translateZ(0)' }}>
                      {countryOptions.map((opt) => (
                        <button key={opt.code} onClick={() => { setCountry(opt.code); setShowCountryMenu(false); }} className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm transition-colors ${country === opt.code ? "bg-[#EEF2FF] text-[#0B102A] font-semibold" : "text-gray-700 hover:bg-gray-50"}`}>
                          <span>{opt.label}</span>
                          {country === opt.code && <i className="bi bi-check-lg text-[#0B102A] text-base"></i>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <FilterDropdown label="Rating change" value={changeFilter} options={CHANGE_OPTIONS} onSelect={setChangeFilter} />
            </div>
            <div className="relative w-full md:w-auto">
              <input type="text" placeholder="Search DR..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-white pl-4 pr-10 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0B102A] w-full md:w-64 text-sm shadow-sm h-[37.33px]" />
              <i className="bi bi-search absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" style={{ fontSize: 14 }} />
            </div>
          </div>

          {/* Rating Select Row */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-2 gap-2">
              <div className="overflow-x-auto pb-1">
                  <div className="inline-flex items-center gap-3 bg-white rounded-xl px-2 py-1.5 shadow-sm border border-gray-100">
                      <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">Ratings</span>
                      <div className="flex gap-2">
                          {RATINGS_OPTIONS.map((rating) => (
                            <button key={rating} onClick={() => handleRatingFilterClick(rating)} className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${getRatingStyle(rating)} ${filterRating === rating ? "ring-2 ring-offset-1 ring-black/10 shadow-md scale-105" : "opacity-60 hover:opacity-100"}`}>{rating}</button>
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

          {/* Main Table - Scrollable */}
          <div className="flex-1 overflow-hidden pb-10 mt-9">
            <div className="h-full bg-white rounded-xl shadow border border-gray-100 overflow-auto">
              {/* ตารางไม่ถูก scale และกำหนดขนาดฟอนต์ข้อมูลทุกคอลัมน์เป็น 15px */}
              <table className="w-full text-left border-collapse text-[14.4px]">
              <thead className="bg-[#0B102A] text-white font-semibold sticky top-0" style={{ zIndex: 50 }}>
                <tr className="h-[50px]">
                  {[{key: 'symbol', label: 'Symbol', align: 'left'}, {key: 'rating', label: 'Technical Rating', align: 'center', width: '190px'}, {key: 'time', label: 'Last Update', align: 'center'}, {key: 'popularDR', label: 'Most Popular DR', align: 'center'}, {key: 'sensitivityDR', label: 'High Sensitivity DR', align: 'center'}, {key: 'price', label: 'Price', align: 'right'}, {key: 'pct', label: '%Change', align: 'right'}, {key: 'chg', label: 'Change', align: 'right'}, {key: 'high', label: 'High', align: 'right'}, {key: 'low', label: 'Low', align: 'right'}].map(h => (
                    <th
                      key={h.key}
                      className={`px-4 cursor-pointer text-${h.align} whitespace-nowrap relative`}
                      style={h.width ? { minWidth: h.width, width: h.width } : {}}
                      onClick={() => handleSort(h.key)}
                    >
                      <div className={`flex items-center justify-${h.align === 'left' ? 'start' : h.align === 'center' ? 'center' : 'end'} gap-0.5`}>{h.label} <SortIndicator colKey={h.key} /></div>
                      {sortConfig.key === h.key && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2F80ED] z-50">
                          <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-[#2F80ED]"></div>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100" ref={tableRef}>
                  {processedData.map((row, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedItem(row)} 
                      className={`transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-[#F7F8FA]"} hover:bg-gray-50 cursor-pointer relative`} 
                      style={{ height: "52px" }}
                    >
                      <td className="px-4 align-middle overflow-hidden max-w-[130px]">
                        <div className="flex flex-col w-full">
                          <span className="font-bold text-[#2F80ED] truncate block">{row.displaySymbol}</span>
                          <span className="text-[12.4px] text-gray-400 truncate block" title={row.displayName}>{row.displayName}</span>
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
                      <td className="px-4 align-middle text-center whitespace-nowrap text-gray-600 font-medium">{row.displayTime}</td>
                      <td className="px-4 align-middle text-center">
                        {row.mostPopularDR ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-[#50B728]">{row.mostPopularDR.symbol}</span>
                            <span className="text-gray-500 text-[13.4px]">Vol: {formatInt(row.mostPopularDR.volume)}</span>
                          </div>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 align-middle text-center">
                        {row.highSensitivityDR ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-[#0007DE]">{row.highSensitivityDR.symbol}</span>
                            <span className="text-gray-500 text-[13.4px]">Bid: {formatPrice(row.highSensitivityDR.bid)}</span>
                          </div>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 align-middle text-right">{renderPriceWithCurrency(row.sortPrice, row.currency)}</td>
                      <td className={`px-4 align-middle text-right font-medium ${row.displayPct > 0 ? "text-[#27AE60]" : row.displayPct < 0 ? "text-[#EB5757]" : "text-gray-600"}`}>{row.hasData ? `${row.displayPct > 0 ? "+" : ""}${formatPct(row.displayPct)}%` : "-"}</td>
                      <td className={`px-4 align-middle text-right font-medium ${row.displayChange > 0 ? "text-[#27AE60]" : row.displayChange < 0 ? "text-[#EB5757]" : "text-gray-600"}`}>
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span>{row.hasData ? (row.displayChange > 0 ? `+${formatPrice(row.displayChange)}` : formatPrice(row.displayChange)) : "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 align-middle text-right">{renderPriceWithCurrency(row.high, row.currency)}</td>
                      <td className="px-4 align-middle text-right">{renderPriceWithCurrency(row.low, row.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
