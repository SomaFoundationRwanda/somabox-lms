"use client"
import { TrendingUp } from "lucide-react";
import { useGrowthCurves } from "@/lib/analytics-service";
import { formatDate } from "@/lib/dates";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import Loader from "@/components/ui/Loader";

const W = 600;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

const shortDate = (d) => formatDate(d, { day: "numeric", month: "short" });

// Weekly average of outcome results (graded work and quizzes; baseline excluded), with the
// baseline average as a dashed reference line. Only recorded results: no data, no line.
export default function GrowthCurvesChart({ scholarEmail, weeks: weeksBack = 26, title: titleProp }) {
    const { t } = useLanguage();
    const title = titleProp || t("admin.growth.title");
    const { data, error, loading } = useGrowthCurves(scholarEmail, weeksBack);

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
                    <h3 className="flex items-center gap-1.5 text-ui font-bold text-fg">
                        <TrendingUp className="w-4 h-4 text-brand-fg" aria-hidden="true" /> {title}
                    </h3>
                    <p className="text-caption text-fg-subtle">{fill(t("admin.growth.subtitle"), { weeks: weeksBack })}</p>
                </div>
                {latest ? (
                    <p className="text-caption text-fg-muted text-right">
                        {t("admin.growth.latest")} <strong className="text-fg">{latest.averagePct}%</strong>
                        {baseline != null ? <> · {t("admin.growth.baselineLower")} <strong className="text-fg">{baseline}%</strong></> : null}
                    </p>
                ) : null}
            </div>

            {loading && !data ? (
                <Loader variant="page" size={48} className="min-h-[10rem]" label={t("admin.common.loading")} />
            ) : error ? (
                <p role="alert" className="text-caption text-danger-fg">{error}</p>
            ) : weeks.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-line text-caption text-fg-subtle">
                    {t("admin.growth.noResults")}{baseline != null ? ` ${fill(t("admin.growth.baselineAvgLearners"), { pct: baseline, learners: data.baselineLearners })}` : ""}
                </div>
            ) : (
                <>
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title}. ${summary}`}>
                        {[0, 25, 50, 75, 100].map((tick) => (
                            <g key={tick}>
                                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-line" strokeWidth="1" />
                                <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" className="fill-fg-subtle" fontSize="10">{tick}%</text>
                            </g>
                        ))}
                        {baseline != null ? (
                            <g>
                                <line x1={PAD.left} x2={W - PAD.right} y1={y(baseline)} y2={y(baseline)} className="stroke-fg-subtle" strokeWidth="1.5" strokeDasharray="5 4" />
                                <text x={W - PAD.right} y={y(baseline) - 4} textAnchor="end" className="fill-fg-muted" fontSize="10">{fill(t("admin.growth.baselineLine"), { pct: baseline })}</text>
                            </g>
                        ) : null}
                        <path d={path} fill="none" className="stroke-brand-fg" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                        {weeks.map((w, i) => (
                            <circle key={w.weekStart} cx={x(i)} cy={y(w.averagePct)} r="3.5" className="fill-brand-fg">
                                <title>{fill(t("admin.growth.pointTitle"), { date: shortDate(w.weekStart), pct: w.averagePct, learners: w.learners, results: w.results })}</title>
                            </circle>
                        ))}
                        {weeks.map((w, i) => (i % labelEvery === 0 || i === weeks.length - 1 ? (
                            <text key={`l-${w.weekStart}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-fg-subtle" fontSize="10">{shortDate(w.weekStart)}</text>
                        ) : null))}
                    </svg>
                    <details className="text-caption text-fg-muted">
                        <summary className="cursor-pointer font-semibold text-fg-muted">{t("admin.growth.showNumbers")}</summary>
                        <div className="mt-2 overflow-x-auto">
                            <table className="min-w-full text-left">
                                <thead className="text-caption text-fg-subtle">
                                    <tr><th scope="col" className="py-1 pr-3">{t("admin.growth.weekOf")}</th><th scope="col" className="py-1 pr-3 text-right">{t("admin.growth.average")}</th><th scope="col" className="py-1 pr-3 text-right">{t("admin.analytics.learners")}</th><th scope="col" className="py-1 text-right">{t("admin.growth.results")}</th></tr>
                                </thead>
                                <tbody>
                                    {weeks.map((w) => (
                                        <tr key={w.weekStart} className="border-t border-line">
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
                    {baseline != null ? <p className="text-caption text-fg-subtle">{fill(t("admin.growth.dashed"), { learners: data.baselineLearners })}</p> : null}
                </>
            )}
        </div>
    );
}
