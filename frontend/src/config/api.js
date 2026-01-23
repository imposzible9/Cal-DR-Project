/**
 * 🌐 API Configuration
 * 
 * Central configuration for all API endpoints.
 * Change UNIFIED_API_URL to switch between local and production.
 */

// Unified API Base URL - Change this to switch environments
const UNIFIED_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// API Endpoints
export const API_CONFIG = {
    // Base URLs for each service
    RATINGS_API: `${UNIFIED_API_URL}/ratings`,
    EARNINGS_API: `${UNIFIED_API_URL}/earnings`,
    NEWS_API: `${UNIFIED_API_URL}/news`,

    // Full endpoint paths
    endpoints: {
        // Ratings endpoints
        ratings: {
            base: `${UNIFIED_API_URL}/ratings`,
            fromDrApi: `${UNIFIED_API_URL}/ratings/ratings/from-dr-api`,
            historyWithAccuracy: (ticker, timeframe) =>
                `${UNIFIED_API_URL}/ratings/ratings/history-with-accuracy/${ticker}?timeframe=${timeframe}`,
            track: `${UNIFIED_API_URL}/ratings/api/track`,
        },

        // Earnings endpoints
        earnings: {
            base: `${UNIFIED_API_URL}/earnings`,
            get: (country) => `${UNIFIED_API_URL}/earnings/api/earnings?country=${country}`,
            stream: `${UNIFIED_API_URL}/earnings/api/earnings/stream`,
            refresh: `${UNIFIED_API_URL}/earnings/api/earnings/refresh`,
        },

        // News endpoints
        news: {
            base: `${UNIFIED_API_URL}/news`,
            symbols: `${UNIFIED_API_URL}/news/api/symbols`,
            getNews: (symbol) => `${UNIFIED_API_URL}/news/api/news/${symbol}`,
            quote: (symbol) => `${UNIFIED_API_URL}/news/api/finnhub/quote/${symbol}`,
            companyNews: (symbol) => `${UNIFIED_API_URL}/news/api/finnhub/company-news/${symbol}`,
            stockOverview: (symbol) => `${UNIFIED_API_URL}/news/api/stock/overview/${symbol}`,
        }
    }
};

// Legacy URLs (for backward compatibility) - pointing to unified API
export const RATINGS_API_URL = API_CONFIG.RATINGS_API;
export const EARNINGS_API_URL = API_CONFIG.EARNINGS_API;
export const NEWS_API_URL = API_CONFIG.NEWS_API;

// Tracker API (uses ratings service)
export const TRACKER_API_URL = `${UNIFIED_API_URL}/ratings`;

export default API_CONFIG;
