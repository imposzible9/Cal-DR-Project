import React from "react";

/* ─── Base Skeleton Block ─── */
const Bone = ({ className = "", style = {} }) => (
    <div
        className={`skeleton-bone rounded ${className}`}
        style={style}
    />
);

/* ─── Table Skeleton (DR List / Suggestion / Calendar) ─── */
export const TableSkeleton = ({ rows = 12, cols = 8, showHeader = true }) => (
    <div className="w-full">
        {/* Header shimmer */}
        {showHeader && (
            <div className="flex items-center gap-3 px-4 py-3 bg-[#0B102A]/5 dark:bg-white/5 rounded-t-xl">
                {Array.from({ length: cols }).map((_, i) => (
                    <Bone
                        key={`h-${i}`}
                        className={`h-4 ${i === 0 ? 'flex-1 min-w-[120px]' : 'flex-1'}`}
                        style={{ opacity: 0.6 }}
                    />
                ))}
            </div>
        )}
        {/* Rows */}
        <div className="divide-y divide-gray-100 dark:divide-white/5">
            {Array.from({ length: rows }).map((_, rowIdx) => (
                <div
                    key={rowIdx}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ animationDelay: `${rowIdx * 60}ms` }}
                >
                    {/* Symbol column – wider */}
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[120px]">
                        <Bone className="h-3.5 w-16" />
                        <Bone className="h-2.5 w-24 opacity-50" />
                    </div>
                    {/* Remaining columns */}
                    {Array.from({ length: cols - 1 }).map((_, colIdx) => (
                        <Bone
                            key={colIdx}
                            className="h-3.5 flex-1"
                            style={{
                                animationDelay: `${(rowIdx * cols + colIdx) * 30}ms`,
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    </div>
);

/* ─── Mobile Card Skeleton (shared across pages) ─── */
export const CardSkeleton = ({ count = 6 }) => (
    <div className="space-y-3 dark:bg-[#0B0E14]">
        {Array.from({ length: count }).map((_, i) => (
            <div
                key={i}
                className="rounded-xl border border-gray-200 dark:border-white/10 p-4 bg-white dark:bg-[#23262A]"
                style={{ animationDelay: `${i * 80}ms` }}
            >
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 mr-4">
                        <Bone className="h-4 w-20 mb-1.5" />
                        <Bone className="h-3 w-32 opacity-50" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <Bone className="h-4 w-16" />
                        <Bone className="h-3 w-12 opacity-50" />
                    </div>
                </div>
                {/* Rating area */}
                <div className="mb-3 py-2 border-y border-gray-400 dark:border-white/5">
                    <div className="flex items-center justify-between">
                        <Bone className="h-3 w-24 opacity-60" />
                        <Bone className="h-6 w-20 rounded-lg" />
                    </div>
                </div>
                {/* Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Bone className="h-2.5 w-16 mb-1 opacity-40" />
                        <Bone className="h-3.5 w-20" />
                    </div>
                    <div className="text-right">
                        <Bone className="h-2.5 w-14 mb-1 opacity-40 ml-auto" />
                        <Bone className="h-3.5 w-16 ml-auto" />
                    </div>
                </div>
            </div>
        ))}
    </div>
);

/* ─── News Skeleton ─── */
export const NewsSkeleton = () => (
    <div className="space-y-8">
        {/* Top Stories skeleton */}
        <div className="space-y-4">
            <Bone className="h-6 w-32" />
            <div className="bg-[#0B102A]/5 dark:bg-white/5 rounded-2xl p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-4">
                    <Bone className="w-8 h-8 rounded-full" />
                    <Bone className="h-4 w-16" />
                </div>
                <Bone className="h-6 w-3/4 mb-2" />
                <Bone className="h-6 w-1/2 mb-3" />
                <Bone className="h-4 w-full mb-2 opacity-50" />
                <Bone className="h-4 w-2/3 opacity-50" />
                <div className="flex items-center gap-2 mt-4">
                    <Bone className="h-5 w-20 rounded" />
                    <Bone className="h-3 w-16 opacity-50" />
                </div>
            </div>
        </div>
        {/* Latest Updates skeleton */}
        <div className="space-y-4">
            <Bone className="h-6 w-36" />
            <div className="flex flex-col gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-gray-200 dark:border-white/10 p-6 bg-white dark:bg-[#23262A] flex flex-col md:flex-row gap-6 items-start"
                        style={{ animationDelay: `${i * 100}ms` }}
                    >
                        {/* Ticker box */}
                        <div className="flex-shrink-0 w-full md:w-[120px] rounded-lg bg-black/5 dark:bg-white/5 p-3 flex flex-col items-center gap-2">
                            <Bone className="w-10 h-10 rounded-full" />
                            <Bone className="h-3.5 w-12" />
                            <Bone className="h-3 w-14 opacity-50" />
                        </div>
                        {/* Content */}
                        <div className="flex-1 w-full">
                            <Bone className="h-5 w-3/4 mb-2" />
                            <Bone className="h-3.5 w-full mb-1 opacity-50" />
                            <Bone className="h-3.5 w-2/3 mb-3 opacity-50" />
                            <div className="flex items-center gap-2">
                                <Bone className="h-4 w-20 rounded opacity-60" />
                                <Bone className="h-3 w-14 opacity-40" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

/* ─── Calendar Earnings Skeleton (Desktop Table) ─── */
export const CalendarTableSkeleton = ({ rows = 10 }) => (
    <>
        {Array.from({ length: rows }).map((_, i) => (
            <tr
                key={i}
                className={`${i % 2 === 0 ? "bg-[#FFFFFF] dark:bg-[#2D3136]" : "bg-[#F3F4F6] dark:bg-[#24272B]"}`}
                style={{ height: "53.6px" }}
            >
                {/* Ticker + logo */}
                <td className="px-4 align-middle" style={{ width: "250px" }}>
                    <div className="flex items-center gap-2" style={{ animationDelay: `${i * 60}ms` }}>
                        <Bone className="w-10 h-10 rounded-xl shrink-0" />
                        <div className="flex flex-col gap-1.5 flex-1">
                            <Bone className="h-3.5 w-16" />
                            <Bone className="h-2.5 w-28 opacity-50" />
                        </div>
                    </div>
                </td>
                {/* Date */}
                <td className="px-4 align-middle text-right">
                    <Bone className="h-3.5 w-20 ml-auto" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                </td>
                {/* Period */}
                <td className="px-4 align-middle text-right">
                    <Bone className="h-3.5 w-20 ml-auto" style={{ animationDelay: `${i * 60 + 60}ms` }} />
                </td>
                {/* Popular DR */}
                <td className="px-4 align-middle text-center">
                    <div className="flex flex-col items-center gap-1" style={{ animationDelay: `${i * 60 + 90}ms` }}>
                        <Bone className="h-3.5 w-16" />
                        <Bone className="h-2.5 w-20 opacity-50" />
                    </div>
                </td>
                {/* Sensitivity DR */}
                <td className="px-4 align-middle text-center">
                    <div className="flex flex-col items-center gap-1" style={{ animationDelay: `${i * 60 + 120}ms` }}>
                        <Bone className="h-3.5 w-16" />
                        <Bone className="h-2.5 w-20 opacity-50" />
                    </div>
                </td>
                {/* EPS Estimate */}
                <td className="px-4 align-middle text-right">
                    <Bone className="h-3.5 w-14 ml-auto" style={{ animationDelay: `${i * 60 + 150}ms` }} />
                </td>
                {/* EPS Reported */}
                <td className="px-4 align-middle text-right">
                    <Bone className="h-3.5 w-14 ml-auto" style={{ animationDelay: `${i * 60 + 180}ms` }} />
                </td>
                {/* Rev Forecast */}
                <td className="px-4 align-middle text-right">
                    <Bone className="h-3.5 w-16 ml-auto" style={{ animationDelay: `${i * 60 + 210}ms` }} />
                </td>
                {/* Rev Actual */}
                <td className="px-4 align-middle text-right">
                    <Bone className="h-3.5 w-16 ml-auto" style={{ animationDelay: `${i * 60 + 240}ms` }} />
                </td>
                {/* Market Cap */}
                <td className="px-4 align-middle text-center">
                    <Bone className="h-3.5 w-16 mx-auto" style={{ animationDelay: `${i * 60 + 270}ms` }} />
                </td>
            </tr>
        ))}
    </>
);

/* ─── Calendar Mobile Card Skeleton ─── */
export const CalendarCardSkeleton = ({ count = 6 }) => (
    <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
            <div
                key={i}
                className="rounded-xl border border-gray-200 dark:border-white/10 p-3 bg-white dark:bg-[#23262A]"
                style={{ animationDelay: `${i * 80}ms` }}
            >
                <div className="flex items-center gap-3 mb-3">
                    <Bone className="w-10 h-10 rounded-xl shrink-0" />
                    <div className="flex-1 min-w-0">
                        <Bone className="h-4 w-16 mb-1.5" />
                        <Bone className="h-3 w-32 opacity-50" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <Bone className="h-3 w-20" />
                        <Bone className="h-5 w-20 rounded-md" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 6 }).map((_, j) => (
                        <div key={j}>
                            <Bone className="h-2.5 w-16 mb-1 opacity-40" />
                            <Bone className="h-3.5 w-14" />
                        </div>
                    ))}
                </div>
            </div>
        ))}
    </div>
);

/* ─── Suggestion History Modal Skeleton ─── */
export const HistorySkeleton = () => (
    <div className="space-y-6 sm:space-y-8 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
            <div
                key={i}
                className="relative pl-9 sm:pl-12"
                style={{ animationDelay: `${i * 100}ms` }}
            >
                {/* Dot */}
                <div className="absolute left-3.5 sm:left-4 w-7 h-7 sm:w-9 sm:h-9 rounded-full skeleton-bone" style={{ transform: "translateX(-50%)" }} />
                {/* Date */}
                <Bone className="h-3.5 w-28 mb-2" />
                {/* Card */}
                <div className="rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/5">
                    <div className="flex items-center gap-2 mb-3">
                        <Bone className="h-5 w-14 rounded" />
                        <Bone className="h-4 w-4 rounded-sm opacity-40" />
                        <Bone className="h-5 w-18 rounded" />
                    </div>
                    <div className="border-b border-gray-200 dark:border-white/10 mb-3" />
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                            <Bone className="h-3 w-14 opacity-50" />
                            <Bone className="h-2.5 w-24 opacity-40" />
                            <Bone className="h-5 w-16 mt-1" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <Bone className="h-3 w-10 opacity-50" />
                            <Bone className="h-2.5 w-20 opacity-40" />
                            <Bone className="h-5 w-16 mt-1" />
                            <Bone className="h-3.5 w-14 opacity-60 mt-0.5" />
                        </div>
                    </div>
                </div>
            </div>
        ))}
    </div>
);

export default {
    TableSkeleton,
    CardSkeleton,
    NewsSkeleton,
    CalendarTableSkeleton,
    CalendarCardSkeleton,
    HistorySkeleton,
};
