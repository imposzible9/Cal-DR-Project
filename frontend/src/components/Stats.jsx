import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, LabelList, Legend
} from 'recharts';

import { API_CONFIG } from '../config/api';

const API_BASE = API_CONFIG.RATINGS_API; // Unified API

const Stats = () => {
    const [isAuth, setIsAuth] = useState(true);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const [summary, setSummary] = useState(null);
    const [trend, setTrend] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let interval;
        if (isAuth) {
            fetchData();
            // Poll for real-time updates every 10 seconds
            interval = setInterval(() => {
                fetchData(true);
            }, 10000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isAuth]);

    const fetchData = async (background = false) => {
        if (!background) setLoading(true);
        try {
            const [sumRes, trendRes] = await Promise.all([
                axios.get(`${API_BASE}/api/analytics/summary`),
                axios.get(`${API_BASE}/api/analytics/weekly-trend`)
            ]);
            setSummary(sumRes.data);
            setTrend(trendRes.data);
        } catch (e) {
            console.error("Failed to fetch stats", e);
        } finally {
            if (!background) setLoading(false);
        }
    };

    const handleLogin = (e) => {
        e.preventDefault();
        // Hardcoded password for demo purposes as requested
        if (password === "ideatrade") {
            setIsAuth(true);
            setError("");
        } else {
            setError("Incorrect password");
        }
    };

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
                    <div className="relative z-10">
                        <h1 className="text-3xl md:text-4xl font-extrabold text-[#0B102A] mb-2 tracking-tight">
                            Simple Data Snapshot
                        </h1>
                        <div className="inline-flex items-center gap-2 text-gray-500 bg-gray-50 px-3 py-1 rounded-full text-sm font-medium border border-gray-100">
                            <i className="bi bi-calendar-event"></i>
                            Last 30 Days
                        </div>
                    </div>
                    {/* Decorative Background */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500"></div>
                </div>

                {/* Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Card 1: Unique Visitors */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between h-[300px]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                <i className="bi bi-people-fill text-xl"></i>
                            </div>
                            <span className="font-bold text-gray-700">Who is visiting</span>
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

                    {/* Card 2: Where they go (All Pages) */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 md:col-span-2 h-[300px] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                    <i className="bi bi-bar-chart-fill text-xl"></i>
                                </div>
                                <span className="font-bold text-gray-700">Page View value</span>
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
                                        data={(() => {
                                            const rawData = summary?.top_pages || [];
                                            const aggregated = rawData.reduce((acc, p) => {
                                                // Normalize path: lowercase and remove trailing slash
                                                let path = p.page_path.toLowerCase().replace(/\/$/, '');
                                                if (!path.startsWith('/')) path = '/' + path;

                                                // Filter out Stats page
                                                if (path === '/stats' || path.includes('stats')) return acc;

                                                const pathMap = {
                                                    '/': 'Home',
                                                    '/home': 'Home',
                                                    '/news': 'News',
                                                    '/drlist': 'DR List',
                                                    '/caldr/drlist': 'DR List', // Fix overlapping path
                                                    '/caldr': 'CalDR',
                                                    '/caldr/caldr': 'CalDR',    // Fix nested path
                                                    '/suggestion': 'Suggestion',
                                                    '/calendar': 'Calendar',
                                                };

                                                let name = pathMap[path];

                                                if (!name) {
                                                    // Fallback: take last segment and capitalize
                                                    const parts = path.split('/').filter(Boolean);
                                                    const lastSegment = parts[parts.length - 1] || 'Home';
                                                    // Initial cap
                                                    name = lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);

                                                    // Fix specific casing issues commonly seen
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

                                            return result.map(item => ({
                                                ...item,
                                                percentage: total > 0 ? `${Math.round((item.value / total) * 100)}%` : '0%'
                                            }));
                                        })()}
                                        margin={{ top: 5, right: 50, left: 10, bottom: 5 }}
                                        barCategoryGap="20%"
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                                        <XAxis type="number" hide domain={[0, 1000]} />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            tick={{ fontSize: 12, fill: '#6B7280' }}
                                            interval={0}
                                            axisLine={false}
                                            tickLine={false}
                                            width={150}
                                        />
                                        <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                            <LabelList dataKey="value" position="right" style={{ fontSize: '12px', fill: '#6B7280' }} />
                                            {summary?.top_pages?.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill="#2F80ED" />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                    {/* Card 3: Weekly Trend - Grouped Bar Chart */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 md:col-span-3 h-[500px] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                    <i className="bi bi-bar-chart text-xl"></i>
                                </div>
                                <span className="font-bold text-gray-700 text-lg">Weekly User Distribution by Page</span>
                            </div>
                        </div>

                        <div className="flex-1 w-full min-h-0">
                            {loading ? (
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
