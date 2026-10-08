"use client"
import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudUpload, Globe, ShieldCheck } from "lucide-react";
import { getInclusivityGap } from "@/lib/analytics-service";

// Average outcome result by group (rural/urban, gender, accessibility needs). Aggregates only:
// any group with fewer than `minGroupSize` learners with results comes back null and is listed
// in `suppressed`, so no small group (or person) can be singled out.

export default function InclusivityGapReport({ serverUrl }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const loadReport = async () => {
        if (!serverUrl) return;
        setLoading(true);
        const data = await getInclusivityGap(serverUrl);
        setReport(data);
        setLoading(false);
    };

    useEffect(() => {
        loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverUrl]);

    if (loading) {
        return <div className="h-40 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" aria-label="Loading the inclusivity report" />;
    }

    if (!report) {
        return <p className="text-xs text-slate-500">The inclusivity report isn&apos;t available right now.</p>;
    }

    const minGroup = report.minGroupSize ?? 5;
    const suppressed = new Set(Array.isArray(report.suppressed) ? report.suppressed : []);
    const tooFew = `Too few learners to report (fewer than ${minGroup})`;

    // A group's average: a percentage, "too few" when suppressed, or "No results yet".
    const groupValue = (value, group) => {
        if (value !== null && value !== undefined) return <span className="font-bold text-slate-900 dark:text-white">{value}%</span>;
        if (suppressed.has(group)) return <span className="text-[11px] text-slate-500">{tooFew}</span>;
        return <span className="text-[11px] text-slate-500">No results yet</span>;
    };

    const gap = report.ruralVsUrban?.gapPercentage;
    const accessCount = report.accessibilityMetrics?.scholarsWithAccessibilityNeeds;

    const rows = [
        { label: "Rural learners", node: groupValue(report.ruralVsUrban?.ruralAverage, "rural") },
        { label: "Urban learners", node: groupValue(report.ruralVsUrban?.urbanAverage, "urban") },
        {
            label: "Rural/urban gap",
            node: gap === null || gap === undefined
                ? <span className="text-[11px] text-slate-500">Needs both groups</span>
                : <span className="font-bold text-slate-900 dark:text-white">{gap === 0 ? "No gap" : `${Math.abs(gap)} pts ${gap > 0 ? "higher in urban" : "higher in rural"}`}</span>,
        },
        { label: "Rural girls", node: groupValue(report.genderBreakdown?.femaleRuralAverage, "ruralFemale") },
        { label: "Rural boys", node: groupValue(report.genderBreakdown?.maleRuralAverage, "ruralMale") },
        { label: "Urban girls", node: groupValue(report.genderBreakdown?.femaleUrbanAverage, "urbanFemale") },
        { label: "Urban boys", node: groupValue(report.genderBreakdown?.maleUrbanAverage, "urbanMale") },
        { label: "Learners with accessibility needs: average", node: groupValue(report.accessibilityMetrics?.averagePerformance, "disability") },
        {
            label: "Learners with accessibility needs: number",
            node: accessCount === null || accessCount === undefined
                ? <span className="text-[11px] text-slate-500">{`Fewer than ${minGroup}`}</span>
                : <span className="font-bold text-slate-900 dark:text-white">{accessCount}</span>,
        },
    ];

    return (
        <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                        <Globe className="w-4 h-4 text-indigo-600" aria-hidden="true" /> Inclusivity gap
                    </h3>
                    <p className="text-xs text-slate-500">
                        Average outcome result by group, from marked graded work and quizzes.
                        {report.scholarsWithData != null ? ` Based on ${report.scholarsWithData} of ${report.totalScholars ?? "—"} learners.` : ""}
                    </p>
                </div>
                <Link
                    href="/manage/admin/sync"
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-[11px] font-bold rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                    <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                    Cloud sync
                </Link>
            </div>

            <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                {rows.map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <dt className="text-slate-600 dark:text-slate-300">{r.label}</dt>
                        <dd className="text-right">{r.node}</dd>
                    </div>
                ))}
            </dl>

            <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>Privacy: these are aggregates only. Any group with fewer than {minGroup} learners with results is hidden so no one can be identified.</span>
            </p>
        </div>
    );
}
