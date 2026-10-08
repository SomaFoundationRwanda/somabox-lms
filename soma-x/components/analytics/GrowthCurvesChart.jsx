"use client"
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { getGrowthCurves } from "@/lib/analytics-service";
import { formatDate } from "@/lib/dates";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

const W = 600;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

const shortDate = (d) => formatDate(d, { day: "numeric", month: "short" });

// Weekly average of outcome results (graded work and quizzes; baseline excluded), with the
// baseline average as a dashed reference line. Only recorded results: no data, no line.
export default function GrowthCurvesChart({ serverUrl, scholarEmail, weeks: weeksBack = 26, title: titleProp }) {
    const { t } = useLanguage();
    const title = titleProp || t("admin.growth.title");
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!serverUrl) return;
        let alive = true;
        (async () => {
            setLoading(true);
            const r = await getGrowthCurves(serverUrl, scholarEmail, weeksBack);
            if (!alive) return;
            setData(r.data);
            setError(r.ok ? "" : r.message);
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [serverUrl, scholarEmail, weeksBack]);

    const weeks = (data?.weeks || []).filter((w) => w.averagePct != null);
    const baseline = data?.baselineAverage ?? null;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (weeks.length <= 1 ? innerW / 2 : (i / (weeks.length - 1)) * innerW);
    const y = (pct) => PAD.top + innerH - (Math.max(0, Math.min(100, pct)) / 100) * innerH;
    const path = weeks.map((w, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(w.averagePct).toFixed(1)}`).join(" ");
    const labelEvery = Math.max(1, Math.ceil(weeks.length / 6));
    const latest = weeks.length ? weeks[weeks.length - 1] : null;

    const summary = weeks.length === 0
        ? t("admin.growth.noResults")
        : `${fill(t("admin.growth.summary"), { weeks: weeks.length, date: shortDate(latest.weekStart), pct: latest.averagePct, learners: latest.learners })}${baseline != null ? ` ${fill(t("admin.growth.baselineAvg"), { pct: baseline })}` : ""}`;

    return (
        <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                        <TrendingUp className="w-4 h-4 text-teal-600" aria-hidden="true" /> {title}
                    </h3>
                    <p className="text-xs text-slate-500">{fill(t("admin.growth.subtitle"), { weeks: weeksBack })}</p>
                </div>
                {latest ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300 text-right">
                        {t("admin.growth.latest")} <strong className="text-slate-900 dark:text-white">{latest.averagePct}%</strong>
                        {baseline != null ? <> · {t("admin.growth.baselineLower")} <strong className="text-slate-900 dark:text-white">{baseline}%</strong></> : null}
                    </p>
                ) : null}
            </div>

            {loading && !data ? (
                <div className="h-40 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" aria-label={t("admin.common.loading")} />
            ) : error ? (
                <p role="alert" className="text-xs text-rose-600">{error}</p>
            ) : weeks.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    {t("admin.growth.noResults")}{baseline != null ? ` ${fill(t("admin.growth.baselineAvgLearners"), { pct: baseline, learners: data.baselineLearners })}` : ""}
                </div>
            ) : (
                <>
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title}. ${summary}`}>
                        {[0, 25, 50, 75, 100].map((tick) => (
                            <g key={tick}>
                                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
                                <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-slate-500" fontSize="10">{tick}%</text>
                            </g>
                        ))}
                        {baseline != null ? (
                            <g>
                                <line x1={PAD.left} x2={W - PAD.right} y1={y(baseline)} y2={y(baseline)} className="stroke-slate-500" strokeWidth="1.5" strokeDasharray="5 4" />
                                <text x={W - PAD.right} y={y(baseline) - 4} textAnchor="end" className="fill-slate-600 dark:fill-slate-300" fontSize="10">{fill(t("admin.growth.baselineLine"), { pct: baseline })}</text>
                            </g>
                        ) : null}
                        <path d={path} fill="none" className="stroke-teal-600" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                        {weeks.map((w, i) => (
                            <circle key={w.weekStart} cx={x(i)} cy={y(w.averagePct)} r="3.5" className="fill-teal-600">
                                <title>{fill(t("admin.growth.pointTitle"), { date: shortDate(w.weekStart), pct: w.averagePct, learners: w.learners, results: w.results })}</title>
                            </circle>
                        ))}
                        {weeks.map((w, i) => (i % labelEvery === 0 || i === weeks.length - 1 ? (
                            <text key={`l-${w.weekStart}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500" fontSize="10">{shortDate(w.weekStart)}</text>
                        ) : null))}
                    </svg>
                    <details className="text-xs text-slate-600 dark:text-slate-300">
                        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">{t("admin.growth.showNumbers")}</summary>
                        <div className="mt-2 overflow-x-auto">
                            <table className="min-w-full text-left">
                                <thead className="text-[10px] uppercase text-slate-500">
                                    <tr><th scope="col" className="py-1 pr-3">{t("admin.growth.weekOf")}</th><th scope="col" className="py-1 pr-3 text-right">{t("admin.growth.average")}</th><th scope="col" className="py-1 pr-3 text-right">{t("admin.analytics.learners")}</th><th scope="col" className="py-1 text-right">{t("admin.growth.results")}</th></tr>
                                </thead>
                                <tbody>
                                    {weeks.map((w) => (
                                        <tr key={w.weekStart} className="border-t border-slate-100 dark:border-slate-800">
                                            <td className="py-1 pr-3 whitespace-nowrap">{shortDate(w.weekStart)}</td>
                                            <td className="py-1 pr-3 text-right">{w.averagePct}%</td>
                                            <td className="py-1 pr-3 text-right">{w.learners}</td>
                                            <td className="py-1 text-right">{w.results}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                    {baseline != null ? <p className="text-[11px] text-slate-500">{fill(t("admin.growth.dashed"), { learners: data.baselineLearners })}</p> : null}
                </>
            )}
        </div>
    );
}
