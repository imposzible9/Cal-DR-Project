/**
 * User Behavior Tracker
 * ระบบติดตามพฤติกรรมผู้ใช้งาน - พร้อมระบบนับจำนวนครั้ง
 */



// ==================== DEBUG MODE ====================
// เปิด DEBUG_MODE = true เพื่อทดสอบระบบโดยไม่เก็บ database
const DEBUG_MODE = false;
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

// ==================== USER ID & SESSION ID ====================
// User ID: Persistent across sessions (stored in localStorage)
const getUserId = () => {
    let userId = localStorage.getItem('tracker_user_id');
    if (!userId) {
        // Generate a random user ID (simple UUID-like)
        userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('tracker_user_id', userId);
    }
    return userId;
};

// Session ID: Ephemeral (stored in sessionStorage)
const getSessionId = () => {
    let sessionId = sessionStorage.getItem('tracker_session_id');
    if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('tracker_session_id', sessionId);
    }
    return sessionId;
};

// ==================== TRACKING FUNCTIONS ====================

import { API_CONFIG } from '../config/api';

const normalizePagePath = (path) => {
    if (!path || path === '/') return '/home';

    // Remove trailing slash
    path = path.replace(/\/$/, '');

    // Split by / and get the last non-empty segment
    const segments = path.split('/').filter(s => s);

    if (segments.length === 0) return '/home';

    // Get the last segment as the page name
    const pageName = segments[segments.length - 1];

    return '/' + pageName;
};

// Global cache for deduplication
const eventCache = new Map();

const sendTrackingEvent = async (eventType, eventData = {}, pagePath = normalizePagePath(window.location.pathname)) => {
    // Deduplication: if exactly same event was sent in last 1000ms, skip it
    const eventKey = `${eventType}:${JSON.stringify(eventData)}:${pagePath}`;
    const now = Date.now();
    const lastSent = eventCache.get(eventKey) || 0;

    if (now - lastSent < 1000) {
        return;
    }
    eventCache.set(eventKey, now);

    try {
        const payload = {
            session_id: getSessionId(),
            user_id: getUserId(),
            event_type: eventType,
            event_data: eventData,
            page_path: pagePath,
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent
        };

        await fetch(API_CONFIG.endpoints.ratings.track, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

    } catch (e) {
        // Silently fail to not disturb user
        if (DEBUG_MODE) console.error('Tracking error:', e);
    }
};

/**
 * Track การเข้าชมหน้า
 */
export const trackPageView = (pageName) => {
    sendTrackingEvent('page_view', { page_name: pageName });
};

/**
 * Track การดูหุ้น
 */
export const trackStockView = (ticker, stockName = '') => {
    sendTrackingEvent('stock_view', { ticker, stock_name: stockName });
};

/**
 * Track การค้นหา
 */
export const trackSearch = (query, resultsCount = 0) => {
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
    // Disabled
};

/**
 * Track การเลือก filter
 */
export const trackFilter = (filterType, filterValue) => {
    sendTrackingEvent('filter', { filter_type: filterType, filter_value: filterValue });
};


/**
 * Track การเลือก DR ในหน้า CalDR
 */
export const trackDRSelection = (drSymbol) => {
    sendTrackingEvent('dr_selection', { dr_symbol: drSymbol });
};

/**
 * Track ผลการคำนวณในหน้า CalDR
 */
export const trackCalculation = (drSymbol, underlyingPrice, fxRate, fairBid, fairAsk) => {
    sendTrackingEvent('calculation', {
        dr_symbol: drSymbol,
        underlying_price: underlyingPrice,
        fx_rate: fxRate,
        fair_bid: fairBid,
        fair_ask: fairAsk
    });
};


// ==================== STATISTICS VIEWER ====================

/**
 * 📊 แสดงสรุปสถิติทั้งหมด
 * เรียกใช้: showStats() ใน Console
 */
export const showStats = () => {
    // Disabled
    return {};
};

/**
 * 🗑️ รีเซ็ตสถิติทั้งหมด
 * เรียกใช้: clearStats() ใน Console
 */
export const clearStats = () => {
    sessionStorage.removeItem(STATS_KEY);
};

// ==================== INITIALIZE ====================

export const initTracker = () => {
    // Disabled
};

/**
 * Track user starring/unstarring a stock
 */
export const trackFavorite = (ticker, action) => {
    // action: 'add' or 'remove'
    sendTrackingEvent('favorite', { ticker, action });
};

/**
 * Track Heartbeat (Keep Alive)
 */
export const trackHeartbeat = () => {
    sendTrackingEvent('heartbeat', { ts: new Date().toLocaleString() });
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
    trackFavorite,
    trackHeartbeat,
    initTracker,
    showStats,
    clearStats
};
