"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Palette } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import Unauthorized from "@/components/sections/Unauthorized";
import InclusivityGapReport from "@/components/analytics/InclusivityGapReport";
import GrowthCurvesChart from "@/components/analytics/GrowthCurvesChart";
import { PageHeader, Section, DataTable, EmptyState } from "@/components/layout";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { DeltaText, Figure, LoadingRows, ErrorNote, fmtPct, fmtRate } from "@/components/insights/bits";

const DAY_OPTIONS = [7, 30, 90];

// Usage event names, translated under admin.analytics.events.
const EVENT_KEYS = [
    "explainer_opened", "create_helper_used", "course_opened", "item_opened", "insights_viewed",
    "progress_viewed", "grading_time", "ai_suggestion_used", "item_edited_after_publish",
];
const LIFECYCLES = ["draft", "open", "closed", "archived"];

function fmtSeconds(s, t) {
    if (s == null) return "—";
    if (s < 60) return fill(t("admin.analytics.seconds"), { s });
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? fill(t("admin.analytics.minSec"), { m, s: r }) : fill(t("admin.analytics.minutes"), { m });
}

function RetentionSetting({ SERVER_URL }) {
    const { showToast } = useToast();
    const { t } = useLanguage();
    const [settings, setSettings] = useState(null);
    const [value, setValue] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [purged, setPurged] = useState(null);

    useEffect(() => {
        if (!SERVER_URL) return;
        (async () => {
            try {
                const res = await fetch(`${SERVER_URL}/analytics/settings`);
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(payload.message || t("admin.analytics.settingLoadFailed"));
                setSettings(payload);
                setValue(String(payload.usageRetentionDays ?? ""));
            } catch (err) {
                setError(err.message);
            }
        })();
    }, [SERVER_URL]); // eslint-disable-line react-hooks/exhaustive-deps

    const save = async (e) => {
        e.preventDefault();
        setError("");
        const days = Number(value);
        if (!Number.isInteger(days) || days < 30 || days > 3650) {
            setError(t("admin.analytics.retentionInvalid"));
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`${SERVER_URL}/analytics/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usageRetentionDays: days }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.message || t("admin.analytics.settingSaveFailed"));
            setSettings((s) => ({ ...(s || {}), usageRetentionDays: payload.usageRetentionDays }));
            setPurged(payload.purged || null);
            showToast(t("admin.analytics.retentionSaved"), "success");
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3 max-w-xl">
            <form onSubmit={save} className="flex flex-wrap items-end gap-2">
                <div>
                    <label htmlFor="retention-days" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t("admin.analytics.retentionLabel")}</label>
                    <input
                        id="retention-days"
                        type="number"
                        min={30}
                        max={3650}
                        step={1}
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        aria-describedby="retention-help"
                        className="w-32 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0D9488]"
                    />
                </div>
                <button type="submit" disabled={saving || !settings} className="text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-60 px-4 py-2 rounded-lg">
                    {saving ? t("admin.analytics.saving") : t("admin.analytics.save")}
                </button>
            </form>
            <p id="retention-help" className="text-xs text-slate-500">
                {t("admin.analytics.retentionHelp")}
            </p>
            {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
            {purged ? (
                <p role="status" className="text-xs text-slate-700 dark:text-slate-200">
                    {fill(t("admin.analytics.purged"), { events: purged.usageEvents ?? 0, calls: purged.aiCalls ?? 0, days: purged.days ?? settings?.usageRetentionDays })}
                </p>
            ) : null}
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const { authenticated, role, SERVER_URL } = useContext(DataContext);
    const { t } = useLanguage();
    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        if (!SERVER_URL || role !== "admin") return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${SERVER_URL}/analytics/school?days=${days}`);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.message || t("admin.analytics.loadFailed"));
            setData(payload);
        } catch (err) {
            setError(err.message || t("admin.analytics.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [SERVER_URL, role, days]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);

    if (!authenticated || role !== "admin") {
        return <Unauthorized />;
    }

    const totals = data?.totals;
    const courses = Array.isArray(data?.courses) ? data.courses : [];
    const events = Array.isArray(data?.events) ? data.events : [];

    return (
        <div className="min-h-screen pb-24 md:pb-12">
            <div className="px-4 md:px-6 pt-4 space-y-8 max-w-7xl mx-auto">
                <Link
                    href="/manage/admin"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> {t("admin.common.backToAdmin")}
                </Link>

                <PageHeader
                    title={t("admin.analytics.title")}
                    description={t("admin.analytics.description")}
                    actions={
                        <>
                        <Link
                            href="/manage/admin/sync"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            {t("admin.analytics.cloudSync")}
                        </Link>
                        <Link
                            href="/manage/admin/branding"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <Palette className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            {t("admin.branding.eyebrow")}
                        </Link>
                        </>
                    }
                />

                {loading && !data ? (
                    <LoadingRows count={4} />
                ) : error ? (
                    <ErrorNote message={error} onRetry={load} />
                ) : !data ? null : (
                    <>
                        <Section title={t("admin.analytics.totals")}>
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
                                <Figure label={t("admin.analytics.learners")} value={totals.learners} />
                                <Figure label={t("admin.analytics.teachers")} value={totals.teachers} />
                                <Figure label={t("admin.analytics.runningCourses")} value={totals.courses} sub={fill(t("admin.analytics.stillDraft"), { count: totals.draftCourses })} />
                                <Figure label={t("admin.analytics.withResults")} value={fill(t("admin.analytics.xOfY"), { x: totals.learnersWithResults, y: totals.learners })} sub={t("admin.analytics.inRunning")} />
                                <Figure label={t("admin.analytics.active7")} value={fill(t("admin.analytics.xOfY"), { x: totals.activeLearnersLast7Days, y: totals.learners })} sub={t("admin.analytics.learnersLower")} />
                            </dl>
                        </Section>

                        <Section divided title={t("admin.home.coursesTitle")} description={t("admin.analytics.coursesHelp")}>
                            {courses.length === 0 ? (
                                <EmptyState compact title={t("admin.analytics.noRunning")} description={t("admin.analytics.noRunningHelp")} />
                            ) : (
                                <DataTable
                                    caption={t("admin.home.coursesTitle")}
                                    rows={courses}
                                    columns={[
                                        {
                                            key: "title",
                                            header: t("admin.courses.colCourse"),
                                            className: "min-w-[12rem]",
                                            render: (c) => (
                                                <div>
                                                    <Link href={`/course/${c.id}/insights`} className="font-semibold text-slate-900 dark:text-white hover:text-[#0D9488] hover:underline">{c.title}</Link>
                                                    <span className="block text-[10px] font-semibold uppercase text-slate-400">{t(`admin.courses.lifecycle.${LIFECYCLES.includes(c.lifecycle) ? c.lifecycle : "draft"}`)}</span>
                                                </div>
                                            ),
                                        },
                                        { key: "teachers", header: t("admin.analytics.teachers"), className: "min-w-[8rem] text-xs text-slate-600 dark:text-slate-300", render: (c) => (c.teachers?.length ? c.teachers.join(", ") : "—") },
                                        { key: "learners", header: t("admin.analytics.learners"), align: "right", render: (c) => c.learners ?? 0 },
                                        { key: "withData", header: t("admin.analytics.colWithResults"), align: "right", render: (c) => c.learnersWithData ?? 0 },
                                        { key: "mastery", header: t("admin.analytics.colMastery"), align: "right", render: (c) => <span className={c.averageMastery == null ? "text-slate-400" : "font-semibold"}>{fmtPct(c.averageMastery)}</span> },
                                        { key: "delta", header: t("admin.analytics.colDelta"), align: "right", render: (c) => <DeltaText value={c.averageDeltaPoints} /> },
                                        { key: "onTime", header: t("admin.analytics.colOnTime"), align: "right", render: (c) => fmtRate(c.onTimeRate) },
                                        { key: "missing", header: t("admin.analytics.colMissing"), align: "right", render: (c) => c.missing ?? "—" },
                                        { key: "flagged", header: t("admin.analytics.colFlagged"), align: "right", render: (c) => c.atRisk ?? "—" },
                                        { key: "active", header: t("admin.analytics.colActive"), align: "right", render: (c) => (c.learners ? fill(t("admin.analytics.xOfY"), { x: c.activeLast7Days ?? 0, y: c.learners }) : "—") },
                                    ]}
                                />
                            )}
                        </Section>

                        <Section
                            divided
                            title={t("admin.analytics.useTitle")}
                            description={fill(t("admin.analytics.lastDays"), { days: data.days })}
                            actions={
                                <div role="group" aria-label={t("admin.analytics.period")} className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    {DAY_OPTIONS.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setDays(d)}
                                            aria-pressed={days === d}
                                            className={`px-3 py-1.5 text-xs font-semibold ${days === d ? "bg-[#203A3A] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                                        >
                                            {fill(t("admin.analytics.nDays"), { days: d })}
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            <div className="space-y-6">
                                <div>
                                    <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("admin.analytics.teaching")}</h3>
                                    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                                        <Figure
                                            label={t("admin.analytics.medianGrade")}
                                            value={fmtSeconds(data.teaching?.medianGradingSeconds, t)}
                                            sub={data.teaching?.gradingsTimed ? fill(t("admin.analytics.fromTimed"), { count: data.teaching.gradingsTimed }) : t("admin.analytics.noTimed")}
                                        />
                                        <Figure label={t("admin.analytics.editsAfter")} value={data.teaching?.editsAfterPublish ?? 0} sub={t("admin.analytics.editsAfterHelp")} />
                                    </dl>
                                </div>
                                <div>
                                    <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{t("admin.analytics.productUse")}</h3>
                                    <DataTable
                                        caption={fill(t("admin.analytics.productUseCaption"), { days: data.days })}
                                        rows={events}
                                        rowKey={(e) => e.type}
                                        empty={t("admin.analytics.noUsage")}
                                        columns={[
                                            { key: "type", header: t("admin.analytics.colWhat"), render: (e) => (EVENT_KEYS.includes(e.type) ? t(`admin.analytics.events.${e.type}`) : e.type) },
                                            { key: "count", header: t("admin.analytics.colTimes"), align: "right", render: (e) => e.count },
                                            { key: "people", header: t("admin.analytics.colPeople"), align: "right", render: (e) => e.people },
                                        ]}
                                    />
                                </div>
                            </div>
                        </Section>
                    </>
                )}

                <Section divided title={t("admin.analytics.learningAcross")}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-w-0">
                        <GrowthCurvesChart serverUrl={SERVER_URL} />
                        <InclusivityGapReport serverUrl={SERVER_URL} />
                    </div>
                </Section>

                <Section divided title={t("admin.analytics.privacy")} description={t("admin.analytics.privacyHelp")}>
                    <RetentionSetting SERVER_URL={SERVER_URL} />
                </Section>
            </div>
        </div>
    );
}
