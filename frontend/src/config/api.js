/**
 * 🌐 API Configuration
 * 
 * Central configuration for all API endpoints.
 * Change UNIFIED_API_URL to switch between local and production.
 */

// Unified API Base URL - Change this to switch environments
const UNIFIED_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// API Endpoints
// API Endpoints
export const API_CONFIG = {
    // Base URLs for each service - using env vars
    RATINGS_API: import.meta.env.VITE_RATINGS_API,
    EARNINGS_API: import.meta.env.VITE_EARNINGS_API,
    NEWS_API: import.meta.env.VITE_NEWS_API,
    CALCULATION_API: import.meta.env.VITE_CAL_API,

    // Full endpoint paths
    endpoints: {
        // Ratings endpoints
        ratings: {
            // Using logic from ratings_api_dynamic.py structure
            base: import.meta.env.VITE_HISTORY_API,
            fromDrApi: import.meta.env.VITE_RATINGS_API,
            historyWithAccuracy: (ticker, timeframe) =>
                `${import.meta.env.VITE_HISTORY_API}/history-with-accuracy/${ticker}?timeframe=${timeframe}`,
            track: `${import.meta.env.VITE_HISTORY_API}/api/track`, // Assuming this exists or needed
        },

        // Earnings endpoints
        earnings: {
            base: import.meta.env.VITE_EARNINGS_API,
            get: (country) => `${import.meta.env.VITE_EARNINGS_API}?country=${country}`,
            stream: import.meta.env.VITE_EARNINGS_STREAM_API,
            refresh: `${import.meta.env.VITE_EARNINGS_API.replace('/api/earnings', '/api/earnings/refresh')}`,
        },

        // News endpoints
        news: {
            base: import.meta.env.VITE_NEWS_API,
            symbols: `${import.meta.env.VITE_NEWS_API}/api/symbols`,
            getNews: (symbol) => `${import.meta.env.VITE_NEWS_API}/api/news/${symbol}`,
            quote: (symbol) => `${import.meta.env.VITE_NEWS_API}/api/finnhub/quote/${symbol}`,
            companyNews: (symbol) => `${import.meta.env.VITE_NEWS_API}/api/finnhub/company-news/${symbol}`,
            stockOverview: (symbol) => `${import.meta.env.VITE_NEWS_API}/api/stock/overview/${symbol}`,
        },

        // Calculation endpoints
        calculation: {
            base: import.meta.env.VITE_CAL_API,
            dr: (symbol) => `${import.meta.env.VITE_CAL_API}/${encodeURIComponent(symbol)}`,
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
