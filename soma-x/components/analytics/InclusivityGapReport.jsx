"use client"
import { useEffect, useState } from "react";
import { Globe, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInclusivityGap, triggerMeSync } from "@/lib/analytics-service";

export default function InclusivityGapReport({ serverUrl }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState("");

    const loadReport = async () => {
        if (!serverUrl) return;
        setLoading(true);
        const data = await getInclusivityGap(serverUrl);
        setReport(data);
        setLoading(false);
    };

    useEffect(() => {
        loadReport();
    }, [serverUrl]);

    const handleSync = async () => {
        setSyncing(true);
        setSyncMsg("");
        const res = await triggerMeSync(serverUrl);
        setSyncing(false);
        setSyncMsg(res.message || "M&E Sync completed");
        setTimeout(() => setSyncMsg(""), 4000);
    };

    if (loading) {
        return <div className="p-6 text-center text-xs text-slate-600">Generating Inclusivity & Demographic Gap Report...</div>;
    }

    if (!report) return null;

    return (
        <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 rounded-xl">
                        <Globe className="w-4 h-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">M&E Inclusivity & Gap Analysis</h3>
                        <p className="text-[10px] text-slate-600">Rural vs. Urban performance across gender lines</p>
                    </div>
                </div>

                <Button
                    onClick={handleSync}
                    disabled={syncing}
                    variant="outline"
                    className="h-8 px-3 text-[11px] font-bold border-slate-200 dark:border-slate-800 flex items-center gap-1.5 rounded-xl"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'M&E Real-time Sync'}
                </Button>
            </div>

            {syncMsg && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-200">
                    {syncMsg}
                </div>
            )}

            {/* Gap Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                    <span className="text-[10px] text-slate-600 font-bold uppercase">Rural Average</span>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-200">{report.ruralVsUrban?.ruralAverage}%</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                    <span className="text-[10px] text-slate-600 font-bold uppercase">Urban Average</span>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-200">{report.ruralVsUrban?.urbanAverage}%</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                    <span className="text-[10px] text-slate-600 font-bold uppercase">Rural/Urban Gap</span>
                    <p className="text-lg font-black text-teal-600 dark:text-teal-400">-{report.ruralVsUrban?.gapPercentage}%</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                    <span className="text-[10px] text-slate-600 font-bold uppercase">Accessibility Learners</span>
                    <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{report.accessibilityMetrics?.scholarsWithAccessibilityNeeds}</p>
                </div>
            </div>

            {/* Detailed Gender Breakdown */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" /> Gender & Region Equity Breakdown
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-teal-50/50 dark:bg-teal-950/20 p-3 rounded-xl border border-teal-100 dark:border-teal-900">
                        <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 block mb-1">Rural Female vs. Male</span>
                        <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                            <span>Female: <strong>{report.genderBreakdown?.femaleRuralAverage}%</strong></span>
                            <span>Male: <strong>{report.genderBreakdown?.maleRuralAverage}%</strong></span>
                        </div>
                    </div>
                    <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
                        <span className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 block mb-1">Urban Female vs. Male</span>
                        <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                            <span>Female: <strong>{report.genderBreakdown?.femaleUrbanAverage}%</strong></span>
                            <span>Male: <strong>{report.genderBreakdown?.maleUrbanAverage}%</strong></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
