/**
 * User Behavior Tracker
 * ระบบติดตามพฤติกรรมผู้ใช้งาน
 */

const API_BASE_URL = 'http://localhost:8000';

// สร้าง Session ID ที่ unique สำหรับแต่ละ session
const getSessionId = () => {
    let sessionId = sessionStorage.getItem('tracker_session_id');
    if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('tracker_session_id', sessionId);
    }
    return sessionId;
};

// ส่ง tracking event ไปยัง backend
const sendTrackingEvent = async (eventType, eventData = {}, pagePath = window.location.pathname) => {
    try {
        const payload = {
            session_id: getSessionId(),
            event_type: eventType,
            event_data: eventData,
            page_path: pagePath,
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent
        };

        // ใช้ navigator.sendBeacon สำหรับ events ที่อาจเกิดตอน page unload
        // หรือใช้ fetch ปกติ
        const response = await fetch(`${API_BASE_URL}/api/track`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            // ไม่ต้องรอ response เพื่อไม่ให้กระทบ UX
            keepalive: true
        });

        if (!response.ok) {
            console.warn('Tracking failed:', response.status);
        }
    } catch (error) {
        // Silent fail - ไม่ให้ tracking error กระทบการใช้งานหลัก
        console.warn('Tracking error:', error.message);
    }
};

/**
 * Track การเข้าชมหน้า
 * @param {string} pageName - ชื่อหน้าที่เข้าชม
 */
export const trackPageView = (pageName) => {
    sendTrackingEvent('page_view', { page_name: pageName });
};

/**
 * Track การดูหุ้น
 * @param {string} ticker - รหัสหุ้น
 * @param {string} stockName - ชื่อหุ้น
 */
export const trackStockView = (ticker, stockName = '') => {
    sendTrackingEvent('stock_view', { ticker, stock_name: stockName });
};

/**
 * Track การค้นหา
 * @param {string} query - คำค้นหา
 * @param {number} resultsCount - จำนวนผลลัพธ์
 */
export const trackSearch = (query, resultsCount = 0) => {
    sendTrackingEvent('search', { query, results_count: resultsCount });
};

/**
 * Track การคลิกปุ่มหรือ element สำคัญ
 * @param {string} elementName - ชื่อ element ที่คลิก
 * @param {object} additionalData - ข้อมูลเพิ่มเติม
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
 * Track session end (เรียกตอน page unload)
 */
export const trackSessionEnd = () => {
    const sessionStart = sessionStorage.getItem('session_start_time');
    const duration = sessionStart ? Date.now() - parseInt(sessionStart) : 0;

    // ใช้ sendBeacon สำหรับ unload events เพราะ fetch อาจถูก cancel
    const payload = {
        session_id: getSessionId(),
        event_type: 'session_end',
        event_data: { duration_ms: duration },
        page_path: window.location.pathname,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent
    };

    navigator.sendBeacon(
        `${API_BASE_URL}/api/track`,
        JSON.stringify(payload)
    );
};

/**
 * Track การเลือก filter หรือ sorting
 * @param {string} filterType - ประเภท filter
 * @param {string} filterValue - ค่าที่เลือก
 */
export const trackFilter = (filterType, filterValue) => {
    sendTrackingEvent('filter', { filter_type: filterType, filter_value: filterValue });
};

/**
 * Track การคำนวณ DR
 * @param {object} calculationData - ข้อมูลการคำนวณ
 */
export const trackCalculation = (calculationData) => {
    sendTrackingEvent('calculation', calculationData);
};

// Initialize session tracking
export const initTracker = () => {
    // บันทึกเวลาเริ่ม session
    if (!sessionStorage.getItem('session_start_time')) {
        sessionStorage.setItem('session_start_time', Date.now().toString());
        trackSessionStart();
    }

    // Track session end เมื่อปิดหน้าเว็บ
    window.addEventListener('beforeunload', trackSessionEnd);
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
    initTracker
};
