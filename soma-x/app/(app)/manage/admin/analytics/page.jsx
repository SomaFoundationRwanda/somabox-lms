"use client";

import React, { useContext } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Globe, Palette, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import DataContext from '@/context/DataContext';
import Unauthorized from '@/components/sections/Unauthorized';
import InclusivityGapReport from '@/components/analytics/InclusivityGapReport';
import GrowthCurvesChart from '@/components/analytics/GrowthCurvesChart';
import NotificationBellDrawer from '@/components/notifications/NotificationBellDrawer';

export default function AdminAnalyticsPage() {
    const { authenticated, role, unshiftString, SERVER_URL, isDark } = useContext(DataContext);
    const userRole = role ? unshiftString(role) : '';
    const dm = isDark;

    const topBarBg     = dm ? "#080B0F"                   : "#ffffff";
    const topBarBorder = dm ? "rgba(255,255,255,0.07)"    : "#f1f5f9";
    const titleColor   = dm ? "#E8ECF0"                   : "#0f172a";
    const subtitleColor= dm ? "#637080"                   : "#94a3b8";

    if (!authenticated || userRole !== 'admin') {
        return <Unauthorized />;
    }

    return (
        <div className="min-h-screen pb-24 md:pb-12">
            {/* Top Navigation Bar */}
            <div
                className="flex items-center justify-between pl-12 pr-4 md:px-6 py-3.5 sticky top-0 z-10 rounded-b-xl"
                style={{ backgroundColor: topBarBg, borderBottom: `1px solid ${topBarBorder}` }}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <Link
                        href="/manage/admin"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-base sm:text-lg md:text-xl font-black leading-tight tracking-tight" style={{ color: titleColor }}>
                                Accessibility & System Analytics
                            </h1>
                            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                                <ShieldCheck className="w-3 h-3" /> Admin Reserved
                            </span>
                        </div>
                        <p className="text-[11px] mt-0.5 hidden sm:block" style={{ color: subtitleColor }}>
                            Inclusivity M&E, demographic equity gaps, and student mastery growth curves.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Link
                        href="/manage/admin/branding"
                        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
                    >
                        <Palette className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        Unit Branding
                    </Link>
                    <NotificationBellDrawer />
                </div>
            </div>

            {/* Main Content Dashboard */}
            <div className="px-4 md:px-6 mt-6 space-y-6 max-w-7xl mx-auto">
                {/* Header Banner */}
                <div className="p-6 rounded-3xl bg-gradient-to-r from-teal-900/90 via-slate-900 to-slate-950 text-white border border-teal-800/40 shadow-xl relative overflow-hidden">
                    <div className="absolute -top-12 -right-12 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px] font-extrabold uppercase tracking-wide">
                                <Sparkles className="w-3 h-3" />
                                M&E Central Intelligence
                            </div>
                            <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                                Demographic Equity & Learning Analytics
                            </h2>
                            <p className="text-xs md:text-sm text-slate-500 font-medium max-w-2xl">
                                Real-time monitoring of rural vs. urban performance, gender parity indicators, accessibility support accommodations, and longitudinal mastery trajectories.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link
                                href="/manage/admin/sync"
                                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-black transition-all shadow-md"
                            >
                                Sync Cloud Data
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Analytical Reports Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Inclusivity & Accessibility Report */}
                    <div className="flex flex-col">
                        <InclusivityGapReport serverUrl={SERVER_URL} />
                    </div>

                    {/* Longitudinal Growth Curves */}
                    <div className="flex flex-col">
                        <GrowthCurvesChart serverUrl={SERVER_URL} />
                    </div>
                </div>
            </div>
        </div>
    );
}
