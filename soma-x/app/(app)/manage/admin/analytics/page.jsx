"use client";

import React, { useContext } from 'react';
import Link from 'next/link';
import { ArrowLeft, Palette, ShieldCheck } from 'lucide-react';
import DataContext from '@/context/DataContext';
import Unauthorized from '@/components/sections/Unauthorized';
import InclusivityGapReport from '@/components/analytics/InclusivityGapReport';
import GrowthCurvesChart from '@/components/analytics/GrowthCurvesChart';
import { PageHeader, Section } from '@/components/layout';

export default function AdminAnalyticsPage() {
    const { authenticated, role, SERVER_URL } = useContext(DataContext);
    const userRole = role || '';

    if (!authenticated || userRole !== 'admin') {
        return <Unauthorized />;
    }

    return (
        <div className="min-h-screen pb-24 md:pb-12">
            <div className="px-4 md:px-6 pt-4 space-y-8 max-w-7xl mx-auto">
                <Link
                    href="/manage/admin"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Admin
                </Link>

                <PageHeader
                    eyebrow="M&E Central Intelligence"
                    title="Accessibility & System Analytics"
                    description="Real-time monitoring of rural vs. urban performance, gender parity indicators, accessibility support accommodations, and longitudinal mastery trajectories."
                    meta={
                        <span className="inline-flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400">
                            <ShieldCheck className="w-3 h-3" /> Admin reserved
                        </span>
                    }
                    actions={
                        <>
                            <Link
                                href="/manage/admin/branding"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                <Palette className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                Unit Branding
                            </Link>
                            <Link
                                href="/manage/admin/sync"
                                className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors"
                            >
                                Sync Cloud Data
                            </Link>
                        </>
                    }
                />

                <Section title="Demographic equity & learning analytics">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
                        <InclusivityGapReport serverUrl={SERVER_URL} />
                        <GrowthCurvesChart serverUrl={SERVER_URL} />
                    </div>
                </Section>
            </div>
        </div>
    );
}
