"use client";

import { useContext, useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
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
import { Field, TextInput } from "@/components/form";

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

function RetentionSetting() {
    const { showToast } = useToast();
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const query = useQuery({ queryKey: ["analytics", "settings"], queryFn: () => apiFetch("/analytics/settings") });
    const settings = query.data || null;
    const [value, setValue] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [purged, setPurged] = useState(null);

    useEffect(() => {
        if (settings) setValue(String(settings.usageRetentionDays ?? ""));
    }, [settings]);
    useEffect(() => {
        if (query.isError) setError(getErrorMessage(query.error, t));
    }, [query.isError]); // eslint-disable-line react-hooks/exhaustive-deps

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
            const payload = await apiFetch("/analytics/settings", { method: "PUT", json: { usageRetentionDays: days } });
            queryClient.setQueryData(["analytics", "settings"], (s) => ({ ...(s || {}), usageRetentionDays: payload.usageRetentionDays }));
            setPurged(payload.purged || null);
            showToast(t("admin.analytics.retentionSaved"), "success");
        } catch (err) {
            setError(getErrorMessage(err, t));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3 max-w-xl">
            <form onSubmit={save} className="flex flex-wrap items-end gap-2">
                <Field id="retention-days" label={t("admin.analytics.retentionLabel")}>
                    <TextInput
                        type="number"
                        min={30}
                        max={3650}
                        step={1}
                        inputMode="numeric"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        aria-describedby="retention-help"
                        size="sm"
                        className="w-32"
                    />
                </Field>
                <button type="submit" disabled={saving || !settings} className="text-caption font-bold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-60 px-4 py-2 rounded-lg">
                    {saving ? t("admin.analytics.saving") : t("admin.analytics.save")}
                </button>
            </form>
            <p id="retention-help" className="text-caption text-fg-subtle">
                {t("admin.analytics.retentionHelp")}
            </p>
            {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
            {purged ? (
                <p role="status" className="text-caption text-fg-muted">
                    {fill(t("admin.analytics.purged"), { events: purged.usageEvents ?? 0, calls: purged.aiCalls ?? 0, days: purged.days ?? settings?.usageRetentionDays })}
                </p>
            ) : null}
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const { authenticated, role } = useContext(DataContext);
    const { t } = useLanguage();
    const [days, setDays] = useState(30);
    const report = useQuery({
        queryKey: ["analytics", "school", days],
        queryFn: () => apiFetch(`/analytics/school?days=${days}`),
        enabled: role === "admin",
        placeholderData: keepPreviousData,
    });
    const data = report.data || null;
    const loading = report.isPending;
    const error = report.isError ? getErrorMessage(report.error, t) : "";

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
                    className="inline-flex items-center gap-1.5 text-caption font-semibold text-fg-subtle hover:text-fg"
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line text-caption font-bold text-fg-muted hover:bg-surface-hover transition-colors"
                        >
                            {t("admin.analytics.cloudSync")}
                        </Link>
                        <Link
                            href="/manage/admin/branding"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line text-caption font-bold text-fg-muted hover:bg-surface-hover transition-colors"
                        >
                            <Palette className="w-3.5 h-3.5 text-brand-fg" />
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
                                                    <Link href={`/course/${c.id}/insights`} className="font-semibold text-fg hover:text-brand-fg hover:underline">{c.title}</Link>
                                                    <span className="block text-caption font-semibold text-fg-subtle">{t(`admin.courses.lifecycle.${LIFECYCLES.includes(c.lifecycle) ? c.lifecycle : "draft"}`)}</span>
                                                </div>
                                            ),
                                        },
                                        { key: "teachers", header: t("admin.analytics.teachers"), className: "min-w-[8rem] text-caption text-fg-muted", render: (c) => (c.teachers?.length ? c.teachers.join(", ") : "—") },
                                        { key: "learners", header: t("admin.analytics.learners"), align: "right", render: (c) => c.learners ?? 0 },
                                        { key: "withData", header: t("admin.analytics.colWithResults"), align: "right", render: (c) => c.learnersWithData ?? 0 },
                                        { key: "mastery", header: t("admin.analytics.colMastery"), align: "right", render: (c) => <span className={c.averageMastery == null ? "text-fg-subtle" : "font-semibold"}>{fmtPct(c.averageMastery)}</span> },
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
                                <div role="group" aria-label={t("admin.analytics.period")} className="inline-flex rounded-lg border border-line overflow-hidden">
                                    {DAY_OPTIONS.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setDays(d)}
                                            aria-pressed={days === d}
                                            className={`px-3 py-1.5 text-caption font-semibold ${days === d ? "bg-brand-strong text-on-brand-strong" : "text-fg-muted hover:bg-surface-hover"}`}
                                        >
                                            {fill(t("admin.analytics.nDays"), { days: d })}
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            <div className="space-y-6">
                                <div>
                                    <h3 className="mb-2 text-caption font-semibold text-fg-muted">{t("admin.analytics.teaching")}</h3>
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
                                    <h3 className="mb-2 text-caption font-semibold text-fg-muted">{t("admin.analytics.productUse")}</h3>
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
                        <GrowthCurvesChart />
                        <InclusivityGapReport />
                    </div>
                </Section>

                <Section divided title={t("admin.analytics.privacy")} description={t("admin.analytics.privacyHelp")}>
                    <RetentionSetting />
                </Section>
            </div>
        </div>
    );
}
