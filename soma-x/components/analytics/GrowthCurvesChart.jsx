"use client"
import { useEffect, useState } from "react";
import { Activity, TrendingUp } from "lucide-react";
import { getGrowthCurves } from "@/lib/analytics-service";

export default function GrowthCurvesChart({ serverUrl, scholarEmail }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!serverUrl) return;
        const load = async () => {
            setLoading(true);
            const curves = await getGrowthCurves(serverUrl, scholarEmail);
            setData(curves);
            setLoading(false);
        };
        load();
    }, [serverUrl, scholarEmail]);

    if (loading) {
        return <div className="p-6 text-center text-xs text-slate-600">Loading Longitudinal Growth Curves...</div>;
    }

    const mathRecords = data.filter(d => d.subject === "Mathematics");
    const scienceRecords = data.filter(d => d.subject === "Science");

    return (
        <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="p-2 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 rounded-xl">
                        <TrendingUp className="w-4 h-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Longitudinal Progress Engine</h3>
                        <p className="text-[10px] text-slate-600">Individual & Cohort growth curves over time</p>
                    </div>
                </div>
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    V2.1 Analytics
                </span>
            </div>

            {/* Growth Curves Graph Bars */}
            <div className="space-y-4">
                <SubjectBars label="Mathematics Progression" records={mathRecords} labelClass="text-teal-700 dark:text-teal-400" barClass="bg-teal-600 dark:bg-teal-500" />
                <SubjectBars label="Science Progression" records={scienceRecords} labelClass="text-indigo-600 dark:text-indigo-400" barClass="bg-indigo-600 dark:bg-indigo-500" />
            </div>
        </div>
    );
}

function toPercent(rec) {
    const possible = Number(rec.total_possible);
    return possible > 0 ? Math.round((Number(rec.score) / possible) * 100) : Math.round(Number(rec.score));
}

// Renders only recorded results; an empty subject shows "No data yet" rather than sample bars.
function SubjectBars({ label, records, labelClass, barClass }) {
    const latest = records.length > 0 ? toPercent(records[records.length - 1]) : null;
    return (
        <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className={`${labelClass} flex items-center gap-1`}>
                    <Activity className="w-3.5 h-3.5" /> {label}
                </span>
                <span className="text-slate-500 font-bold">
                    {latest !== null ? `${latest}% latest` : "No data yet"}
                </span>
            </div>
            {records.length === 0 ? (
                <div className="h-20 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                    No results recorded yet.
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-2 items-end h-20 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    {records.slice(-4).map((rec, i) => {
                        const pct = toPercent(rec);
                        return (
                            <div key={rec.id ?? i} className="flex flex-col items-center gap-1 h-full justify-end">
                                <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400">{pct}%</span>
                                <div
                                    className={`w-full ${barClass} rounded-t-md transition-all duration-500`}
                                    style={{ height: `${Math.max(pct, 10)}%` }}
                                />
                                <span className="text-[8px] text-slate-600 truncate w-full text-center">{rec.topic}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
