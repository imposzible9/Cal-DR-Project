import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, LabelList, Legend, PieChart, Pie
} from 'recharts';
import { useMemo } from 'react';

import { API_CONFIG } from '../config/api';

const API_BASE = API_CONFIG.endpoints.ratings.base; // Unified API (Mapped to /ratings)

// Memoized Summary Section to prevent re-renders (Restored)
const StatsSummary = React.memo(({ summary, loading, processedPageData, totalViews }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Unique Visitors */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between h-[300px]">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <i className="bi bi-people-fill text-xl"></i>
                    </div>
                    <span className="font-bold text-gray-700">User Visit</span>
                </div>

                <div className="flex-1 flex flex-col justify-center space-y-6">
                    {/* Total Users Section */}
                    <div>
                        {loading ? (
                            <div className="animate-pulse h-10 bg-gray-200 rounded w-2/3 mb-2"></div>
                        ) : (
                            <div className="text-4xl font-extrabold text-[#0B102A]">
                                {summary?.unique_visitors?.toLocaleString() || "0"}
                            </div>
                        )}
                        <div className="text-sm text-gray-500 font-medium">Total Users</div>
                    </div>

                    {/* Active Users Section */}
                    <div>
                        {loading ? (
                            <div className="animate-pulse h-10 bg-gray-200 rounded w-1/3 mb-2"></div>
                        ) : (
                            <div className="flex items-baseline gap-2">
                                <div className="text-4xl font-extrabold text-blue-600">
                                    {summary?.active_users || 0}
                                </div>
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            </div>
                        )}
                        <div className="text-sm text-gray-500 font-medium">Active Users (Live)</div>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-2">
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                        <i className="bi bi-graph-up-arrow"></i> 12%
                    </span>
                    <span className="text-xs text-gray-400">vs last 30 days</span>
                </div>
            </div>

            {/* Card 2: Pie Chart */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between h-[300px]">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                        <i className="bi bi-pie-chart-fill text-xl"></i>
                    </div>
                    <span className="font-bold text-gray-700">Page Usage Distribution</span>
                </div>

                <div className="flex-1 min-h-0 relative">
                    {loading ? (
                        <div className="w-full h-full bg-gray-50 animate-pulse rounded-xl"></div>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={processedPageData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        startAngle={90}
                                        endAngle={-270}
                                    >
                                        {processedPageData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                </PieChart>
                            </ResponsiveContainer>

                            {/* Center Text */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                <div className="text-3xl font-extrabold text-gray-800">{totalViews.toLocaleString()}</div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Views</div>
                            </div>
                        </>
                    )}
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-6 mt-2">
                    {processedPageData.slice(0, 3).map((entry, idx) => (
                        <div key={idx} className="flex flex-col items-center">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                                <span className="text-[10px] font-bold text-gray-500">{entry.name}</span>
                            </div>
                            <span className="text-xs font-extrabold text-gray-800">{Math.round(entry.percentageVal)}%</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Card 3: Bar Chart */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col h-[300px]">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                            <i className="bi bi-bar-chart-fill text-xl"></i>
                        </div>
                        <span className="font-bold text-gray-700">Page View Value</span>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">All Pages</span>
                </div>

                <div className="flex-1 w-full min-h-0 pr-2">
                    {loading ? (
                        <div className="w-full h-full bg-gray-50 animate-pulse rounded-xl"></div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={processedPageData}
                                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                                barCategoryGap="20%"
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    tick={{ fontSize: 12, fill: '#6B7280' }}
                                    interval={0}
                                    axisLine={false}
                                    tickLine={false}
                                    width={70}
                                />
                                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    <LabelList dataKey="value" position="right" style={{ fontSize: '11px', fill: '#6B7280', fontWeight: 600 }} />
                                    {processedPageData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
});

const Stats = () => {
    const navigate = useNavigate();
    const [isAuth, setIsAuth] = useState(false);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const [summary, setSummary] = useState(null);
    const [trend, setTrend] = useState([]);
    const [trendType, setTrendType] = useState('weekly'); // 'weekly' or 'monthly'
    const trendTypeRef = React.useRef(trendType); // Ref to access current state in interval
    const [loading, setLoading] = useState(false);
    const [trendLoading, setTrendLoading] = useState(false);

    // Update ref when state changes
    useEffect(() => {
        trendTypeRef.current = trendType;
    }, [trendType]);

    // Check for existing session via IP
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/auth/check`);
                if (res.data.authenticated) {
                    setIsAuth(true);
                    try { localStorage.setItem('stats_logged_in', '1'); window.dispatchEvent(new CustomEvent('stats:visited')); } catch(e) {}
                }
            } catch (e) {
                console.error("Auth check failed", e);
            }
        };
        checkAuth();
    }, []);

    // Initial Load + Polling (Summary + Trend)
    useEffect(() => {
        let interval;
        if (isAuth) {
            // Initial fetch of everything
            fetchSummary();
            fetchTrend();

            // Poll for real-time updates every 10 seconds
            interval = setInterval(() => {
                fetchSummary(true);
                fetchTrend(true);
            }, 10000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isAuth]);

    // Fetch Trend when type switches
    useEffect(() => {
        if (isAuth) {
            fetchTrend();
        }
    }, [trendType]);

    const fetchSummary = async (background = false) => {
        if (!background) setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/api/analytics/summary`);
            setSummary(res.data);
        } catch (e) {
            console.error("Failed to fetch summary", e);
        } finally {
            if (!background) setLoading(false);
        }
    };

    const fetchTrend = async (background = false) => {
        if (!background) setTrendLoading(true);
        try {
            // Use ref to ensure we get current value inside interval closure
            const type = trendTypeRef.current;
            const endpoint = type === 'weekly'
                ? `${API_BASE}/api/analytics/weekly-trend`
                : `${API_BASE}/api/analytics/monthly-trend`;

            const res = await axios.get(endpoint);
            setTrend(res.data);
        } catch (e) {
            console.error("Failed to fetch trend", e);
        } finally {
            if (!background) setTrendLoading(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const response = await axios.post(`${API_BASE}/api/auth/verify`, { password });
            if (response.data.success) {
                setIsAuth(true);
                setError("");
                try { localStorage.setItem('stats_logged_in', '1'); window.dispatchEvent(new CustomEvent('stats:visited')); } catch(e) {}
            } else {
                setError(response.data.message || "Incorrect password");
                setPassword(""); // Clear password on failure
            }
        } catch (err) {
            console.error("Auth error", err);
            // Axios throws on 4xx/5xx, so we catch it here.
            if (err.response && err.response.data && err.response.data.message) {
                setError(err.response.data.message);
            } else {
                setError("Authentication failed. Please try again.");
            }
            setPassword("");
        } finally {
            setLoading(false);
        }
    };

    // Prepare Aggregated Data for Charts
    const processedPageData = useMemo(() => {
        if (!summary?.top_pages) return [];

        const rawData = summary.top_pages;
        const aggregated = rawData.reduce((acc, p) => {
            let path = p.page_path.toLowerCase().replace(/\/$/, '');
            if (!path.startsWith('/')) path = '/' + path;

            // Filter out Stats page
            if (path === '/stats' || path.includes('stats')) return acc;

            const pathMap = {
                '/': 'Home',
                '/home': 'Home',
                '/news': 'News',
                '/drlist': 'DR List',
                '/caldr/drlist': 'DR List',
                '/caldr': 'CalDR',
                '/caldr/caldr': 'CalDR',
                '/suggestion': 'Suggestion',
                '/calendar': 'Calendar',
            };

            let name = pathMap[path];

            if (!name) {
                const parts = path.split('/').filter(Boolean);
                const lastSegment = parts[parts.length - 1] || 'Home';
                name = lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
                if (name === 'Drlist') name = 'DR List';
                if (name === 'Caldr') name = 'CalDR';
            }

            if (!acc[name]) {
                acc[name] = { name: name, value: 0 };
            }
            acc[name].value += p.total_views;
            return acc;
        }, {});

        const result = Object.values(aggregated).sort((a, b) => b.value - a.value);
        const total = result.reduce((sum, item) => sum + item.value, 0);

        // Color mapping
        const COLORS = {
            'News': '#10B981',      // Green - Emerald 500
            'CalDR': '#8B5CF6',     // Purple - Violet 500
            'DR List': '#F59E0B',   // Yellow - Amber 500
            'Suggestion': '#EF4444',// Red - Red 500
            'Calendar': '#EC4899',  // Pink - Pink 500
            'Home': '#3B82F6',      // Blue - Blue 500
        };
        const DEFAULT_COLOR = '#6B7280'; // Gray

        return result.map(item => ({
            ...item,
            percentageVal: total > 0 ? (item.value / total) * 100 : 0,
            percentage: total > 0 ? `${Math.round((item.value / total) * 100)}%` : '0%',
            color: COLORS[item.name] || DEFAULT_COLOR
        }));
    }, [summary]);

    const totalViews = useMemo(() => {
        return processedPageData.reduce((acc, item) => acc + item.value, 0);
    }, [processedPageData]);

    if (!isAuth) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md transform scale-100 transition-all">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="bi bi-shield-lock text-3xl text-blue-600"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">Protected Area</h2>
                        <p className="text-gray-500 mt-2">Please enter the access code to view statistics.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter Code"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-center text-lg tracking-widest"
                                autoFocus
                            />
                        </div>
                        {error && <div className="text-red-500 text-sm text-center font-medium">{error}</div>}
                        <button
                            type="submit"
                            className="w-full bg-[#0B102A] text-white py-3 rounded-xl font-bold hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
                        >
                            Access Dashboard
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F3F4F6] p-6 md:p-10 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header */}
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center relative overflow-hidden">
                    {/* Back Button */}
                    <button
                        onClick={() => navigate(-1)}
                        className="absolute top-6 left-6 w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-white shadow-sm border border-gray-100 transition-all z-20 group"
                        title="Go Back"
                    >
                        <i className="bi bi-arrow-left text-xl group-hover:-translate-x-0.5 transition-transform"></i>
                    </button>

                    <div className="relative z-10">
                        <h1 className="text-3xl md:text-4xl font-extrabold text-[#0B102A] mb-2 tracking-tight">
                            CAL-DR STATS LOGS
                        </h1>
                        <div className="inline-flex items-center gap-2 text-gray-500 bg-gray-50 px-3 py-1 rounded-full text-sm font-medium border border-gray-100">
                            <i className="bi bi-calendar-event"></i>
                            Last 30 Days
                        </div>
                    </div>
                    {/* Decorative Background */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500"></div>
                </div>

                <div className="max-w-6xl mx-auto space-y-6">
                    <StatsSummary
                        summary={summary}
                        loading={loading}
                        processedPageData={processedPageData}
                        totalViews={totalViews}
                    />

                    {/* Card 3: Trend - Grouped Bar Chart */}      {/* Card 3: Trend - Grouped Bar Chart */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 md:col-span-3 h-[500px] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                    <i className="bi bi-bar-chart text-xl"></i>
                                </div>
                                <span className="font-bold text-gray-700 text-lg">
                                    {trendType === 'weekly' ? 'Weekly' : 'Monthly'} User Distribution by Page
                                </span>
                            </div>

                            {/* Toggle Controls */}
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setTrendType('weekly')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${trendType === 'weekly'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Weekly
                                </button>
                                <button
                                    onClick={() => setTrendType('monthly')}
                                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${trendType === 'monthly'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Monthly
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 w-full min-h-0">
                            {trendLoading ? (
                                <div className="w-full h-full bg-gray-50 animate-pulse rounded-xl"></div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={trend}
                                        margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                                        barGap={2}
                                        barCategoryGap="20%"
                                    >
                                        <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fill: '#6B7280', fontSize: 13, fontWeight: 500 }}
                                            dy={15}
                                        />
                                        <YAxis
                                            tickLine={false}
                                            axisLine={false}
                                            tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#fff',
                                                border: 'none',
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                                                borderRadius: '12px',
                                                padding: '12px'
                                            }}
                                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                            itemStyle={{ fontSize: '13px', padding: '2px 0' }}
                                        />
                                        <Legend
                                            iconType="circle"
                                            wrapperStyle={{ paddingTop: '20px' }}
                                            formatter={(value) => <span style={{ color: '#4B5563', fontSize: '14px', fontWeight: 500, marginRight: '16px' }}>{value}</span>}
                                        />

                                        <Bar dataKey="News" fill="#10B981" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="CalDR" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="DR List" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="Suggestion" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                        <Bar dataKey="Calendar" fill="#EC4899" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Stats;
