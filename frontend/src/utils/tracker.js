/**
 * User Behavior Tracker
 * ระบบติดตามพฤติกรรมผู้ใช้งาน - พร้อมระบบนับจำนวนครั้ง
 */

const API_BASE_URL = 'http://localhost:8000';

// ==================== DEBUG MODE ====================
// เปิด DEBUG_MODE = true เพื่อทดสอบระบบโดยไม่เก็บ database
const DEBUG_MODE = true;
// ===================================================

// ==================== STATISTICS STORAGE ====================
// เก็บสถิติใน sessionStorage เพื่อให้คงอยู่ตลอด session
const STATS_KEY = 'tracker_statistics';

const getStats = () => {
    try {
        const raw = sessionStorage.getItem(STATS_KEY);
        return raw ? JSON.parse(raw) : {
            pageViews: {},      // { "/drlist": 5, "/caldr": 3 }
            stockViews: {},     // { "AAPL06": 2, "TSLA28": 1 }
            searches: {},       // { "apple": 3, "tesla": 1 }
            filters: {},        // { "country:US": 2, "dr_filter:watchlist": 1 }
            totalEvents: 0,
            sessionStart: new Date().toISOString()
        };
    } catch {
        return {
            pageViews: {},
            stockViews: {},
            searches: {},
            filters: {},
            totalEvents: 0,
            sessionStart: new Date().toISOString()
        };
    }
};

const saveStats = (stats) => {
    try {
        sessionStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
        console.warn('Cannot save stats:', e);
    }
};

// ==================== SESSION ID ====================
const getSessionId = () => {
    let sessionId = sessionStorage.getItem('tracker_session_id');
    if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('tracker_session_id', sessionId);
    }
    return sessionId;
};

// ==================== TRACKING FUNCTIONS ====================

const sendTrackingEvent = async (eventType, eventData = {}, pagePath = window.location.pathname) => {
    const payload = {
        session_id: getSessionId(),
        event_type: eventType,
        event_data: eventData,
        page_path: pagePath,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent
    };

    // อัพเดท stats
    const stats = getStats();
    stats.totalEvents++;

    // DEBUG MODE: แค่ log และนับ
    if (DEBUG_MODE) {
        console.log(
            `%c📊 TRACKING [${stats.totalEvents}]`,
            'background: #4CAF50; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            eventType,
            eventData
        );
        saveStats(stats);
        return;
    }

    // PRODUCTION MODE: ส่งไป API
    try {
        const response = await fetch(`${API_BASE_URL}/api/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        });
        if (!response.ok) {
            console.warn('Tracking failed:', response.status);
        }
    } catch (error) {
        console.warn('Tracking error:', error.message);
    }

    saveStats(stats);
};

/**
 * Track การเข้าชมหน้า
 */
export const trackPageView = (pageName) => {
    const stats = getStats();
    const key = pageName || window.location.pathname;
    stats.pageViews[key] = (stats.pageViews[key] || 0) + 1;
    saveStats(stats);

    if (DEBUG_MODE) {
        console.log(
            `%c📄 PAGE VIEW`,
            'background: #2196F3; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            `${key} (${stats.pageViews[key]} ครั้ง)`
        );
    }

    sendTrackingEvent('page_view', { page_name: pageName });
};

/**
 * Track การดูหุ้น
 */
export const trackStockView = (ticker, stockName = '') => {
    const stats = getStats();
    stats.stockViews[ticker] = (stats.stockViews[ticker] || 0) + 1;
    saveStats(stats);

    if (DEBUG_MODE) {
        console.log(
            `%c📈 STOCK VIEW`,
            'background: #FF9800; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            `${ticker} - ${stockName} (${stats.stockViews[ticker]} ครั้ง)`
        );
    }

    sendTrackingEvent('stock_view', { ticker, stock_name: stockName });
};

/**
 * Track การค้นหา
 */
export const trackSearch = (query, resultsCount = 0) => {
    const stats = getStats();
    const key = query.toLowerCase();
    stats.searches[key] = (stats.searches[key] || 0) + 1;
    saveStats(stats);

    if (DEBUG_MODE) {
        console.log(
            `%c🔍 SEARCH`,
            'background: #9C27B0; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            `"${query}" (${stats.searches[key]} ครั้ง)`
        );
    }

    sendTrackingEvent('search', { query, results_count: resultsCount });
};

/**
 * Track การคลิก
 */
export const trackClick = (elementName, additionalData = {}) => {
    sendTrackingEvent('click', { element: elementName, ...additionalData });
};

/**
 * Track session start
 */
export const trackSessionStart = () => {
    if (DEBUG_MODE) {
        console.log(
            `%c🚀 SESSION START`,
            'background: #4CAF50; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; font-size: 14px;'
        );
        console.log('Session ID:', getSessionId());
    }
    sendTrackingEvent('session_start', {
        referrer: document.referrer,
        screen_width: window.innerWidth,
        screen_height: window.innerHeight
    });
};

/**
 * Track session end
 */
export const trackSessionEnd = () => {
    const sessionStart = sessionStorage.getItem('session_start_time');
    const duration = sessionStart ? Date.now() - parseInt(sessionStart) : 0;

    if (DEBUG_MODE) {
        console.log(
            `%c👋 SESSION END`,
            'background: #f44336; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;',
            `Duration: ${Math.round(duration / 1000)}s`
        );
    }

    const payload = {
        session_id: getSessionId(),
        event_type: 'session_end',
        event_data: { duration_ms: duration },
        page_path: window.location.pathname,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent
    };

    navigator.sendBeacon(`${API_BASE_URL}/api/track`, JSON.stringify(payload));
};

/**
 * Track การเลือก filter
 */
export const trackFilter = (filterType, filterValue) => {
    const stats = getStats();
    const key = `${filterType}:${filterValue}`;
    stats.filters[key] = (stats.filters[key] || 0) + 1;
    saveStats(stats);

    if (DEBUG_MODE) {
        console.log(
            `%c🎛️ FILTER`,
            'background: #607D8B; color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold;',
            `${filterType} = ${filterValue} (${stats.filters[key]} ครั้ง)`
        );
    }

    sendTrackingEvent('filter', { filter_type: filterType, filter_value: filterValue });
};

/**
 * Track การคำนวณ DR
 */
export const trackCalculation = (calculationData) => {
    sendTrackingEvent('calculation', calculationData);
};

// ==================== STATISTICS VIEWER ====================

/**
 * 📊 แสดงสรุปสถิติทั้งหมด
 * เรียกใช้: showStats() ใน Console
 */
export const showStats = () => {
    const stats = getStats();

    console.log('\n');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #4CAF50; font-weight: bold;');
    console.log('%c                    📊 TRACKING STATISTICS                    ', 'background: #4CAF50; color: white; padding: 8px 20px; border-radius: 8px; font-weight: bold; font-size: 16px;');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #4CAF50; font-weight: bold;');

    // Session Info
    console.log('\n%c🔑 Session Info', 'font-weight: bold; font-size: 14px; color: #2196F3;');
    console.log('   Session ID:', getSessionId());
    console.log('   Started:', new Date(stats.sessionStart).toLocaleString('th-TH'));
    console.log('   Total Events:', stats.totalEvents);

    // Page Views
    console.log('\n%c📄 Page Views', 'font-weight: bold; font-size: 14px; color: #2196F3;');
    if (Object.keys(stats.pageViews).length === 0) {
        console.log('   (ยังไม่มีข้อมูล)');
    } else {
        const sortedPages = Object.entries(stats.pageViews).sort((a, b) => b[1] - a[1]);
        console.table(Object.fromEntries(sortedPages.map(([page, count]) => [page, `${count} ครั้ง`])));
    }

    // Stock Views
    console.log('\n%c📈 Stock Views (หุ้นที่ถูกดู)', 'font-weight: bold; font-size: 14px; color: #FF9800;');
    if (Object.keys(stats.stockViews).length === 0) {
        console.log('   (ยังไม่มีข้อมูล)');
    } else {
        const sortedStocks = Object.entries(stats.stockViews).sort((a, b) => b[1] - a[1]);
        console.table(Object.fromEntries(sortedStocks.map(([stock, count]) => [stock, `${count} ครั้ง`])));
    }

    // Searches
    console.log('\n%c🔍 Searches (คำค้นหา)', 'font-weight: bold; font-size: 14px; color: #9C27B0;');
    if (Object.keys(stats.searches).length === 0) {
        console.log('   (ยังไม่มีข้อมูล)');
    } else {
        const sortedSearches = Object.entries(stats.searches).sort((a, b) => b[1] - a[1]);
        console.table(Object.fromEntries(sortedSearches.map(([query, count]) => [`"${query}"`, `${count} ครั้ง`])));
    }

    // Filters
    console.log('\n%c🎛️ Filters (ตัวกรอง)', 'font-weight: bold; font-size: 14px; color: #607D8B;');
    if (Object.keys(stats.filters).length === 0) {
        console.log('   (ยังไม่มีข้อมูล)');
    } else {
        const sortedFilters = Object.entries(stats.filters).sort((a, b) => b[1] - a[1]);
        console.table(Object.fromEntries(sortedFilters.map(([filter, count]) => [filter, `${count} ครั้ง`])));
    }

    console.log('\n%c═══════════════════════════════════════════════════════════', 'color: #4CAF50; font-weight: bold;');
    console.log('%c💡 TIP: เรียก clearStats() เพื่อรีเซ็ตสถิติ', 'color: #888; font-style: italic;');
    console.log('\n');

    return stats;
};

/**
 * 🗑️ รีเซ็ตสถิติทั้งหมด
 * เรียกใช้: clearStats() ใน Console
 */
export const clearStats = () => {
    sessionStorage.removeItem(STATS_KEY);
    console.log('%c🗑️ Statistics cleared!', 'background: #f44336; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;');
};

// ==================== INITIALIZE ====================

export const initTracker = () => {
    // บันทึกเวลาเริ่ม session
    if (!sessionStorage.getItem('session_start_time')) {
        sessionStorage.setItem('session_start_time', Date.now().toString());
        trackSessionStart();
    }

    // Track session end เมื่อปิดหน้าเว็บ
    window.addEventListener('beforeunload', trackSessionEnd);

    // ทำให้เรียกใช้ได้จาก Console
    if (DEBUG_MODE) {
        window.showStats = showStats;
        window.clearStats = clearStats;
        console.log(
            '%c📊 Tracker Ready! พิมพ์ showStats() เพื่อดูสถิติ',
            'background: #673AB7; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;'
        );
    }
};

export default {
    trackPageView,
    trackStockView,
    trackSearch,
    trackClick,
    trackSessionStart,
    trackSessionEnd,
    trackFilter,
    trackCalculation,
    initTracker,
    showStats,
    clearStats
};
