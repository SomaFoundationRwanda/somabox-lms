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
import { courseLifecycleLabel } from "@/lib/moduleLabels";
import { DeltaText, Figure, LoadingRows, ErrorNote, fmtPct, fmtRate } from "@/components/insights/bits";

const DAY_OPTIONS = [7, 30, 90];

const EVENT_LABELS = {
    explainer_opened: "Help (“What is this?”) opened",
    create_helper_used: "Create helper used",
    course_opened: "Course opened",
    item_opened: "Item opened (page, assignment, quiz, discussion)",
    insights_viewed: "Insights viewed (teachers)",
    progress_viewed: "My progress viewed (learners)",
    grading_time: "Gradings timed",
    ai_suggestion_used: "AI grading suggestion saved",
    item_edited_after_publish: "Item edited after publishing",
};

function fmtSeconds(s) {
    if (s == null) return "—";
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${r} s` : `${m} min`;
}

function RetentionSetting({ SERVER_URL }) {
    const { showToast } = useToast();
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
                if (!res.ok) throw new Error(payload.message || "Couldn't load the setting.");
                setSettings(payload);
                setValue(String(payload.usageRetentionDays ?? ""));
            } catch (err) {
                setError(err.message);
            }
        })();
    }, [SERVER_URL]);

    const save = async (e) => {
        e.preventDefault();
        setError("");
        const days = Number(value);
        if (!Number.isInteger(days) || days < 30 || days > 3650) {
            setError("Enter a whole number of days between 30 and 3650.");
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
            if (!res.ok) throw new Error(payload.message || "Couldn't save the setting.");
            setSettings((s) => ({ ...(s || {}), usageRetentionDays: payload.usageRetentionDays }));
            setPurged(payload.purged || null);
            showToast("Retention setting saved", "success");
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
                    <label htmlFor="retention-days" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Keep usage logs for (days)</label>
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
                    {saving ? "Saving…" : "Save"}
                </button>
            </form>
            <p id="retention-help" className="text-xs text-slate-500">
                Usage logs (which pages people open, grading times, AI calls) older than this are deleted every day. Grades and outcome results are not affected. Between 30 and 3650 days.
            </p>
            {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
            {purged ? (
                <p role="status" className="text-xs text-slate-700 dark:text-slate-200">
                    Deleted {purged.usageEvents ?? 0} usage event{purged.usageEvents === 1 ? "" : "s"} and {purged.aiCalls ?? 0} AI call log{purged.aiCalls === 1 ? "" : "s"} older than {purged.days ?? settings?.usageRetentionDays} days.
                </p>
            ) : null}
        </div>
    );
}

export default function AdminAnalyticsPage() {
    const { authenticated, role, SERVER_URL } = useContext(DataContext);
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
            if (!res.ok) throw new Error(payload.message || "Couldn't load school analytics.");
            setData(payload);
        } catch (err) {
            setError(err.message || "Couldn't load school analytics.");
        } finally {
            setLoading(false);
        }
    }, [SERVER_URL, role, days]);

    useEffect(() => { load(); }, [load]);

    if (!authenticated || role !== "admin") {
        return <Unauthorized />;
    }

    const t = data?.totals;
    const courses = Array.isArray(data?.courses) ? data.courses : [];
    const events = Array.isArray(data?.events) ? data.events : [];

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
                    title="School analytics"
                    description="How learning is going across the school, from marked graded work and quizzes. Every figure says how many learners it is based on; a dash means no data yet."
                    actions={
                        <>
                        <Link
                            href="/manage/admin/sync"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cloud sync
                        </Link>
                        <Link
                            href="/manage/admin/branding"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <Palette className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            Unit branding
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
                        <Section title="Totals">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
                                <Figure label="Learners" value={t.learners} />
                                <Figure label="Teachers" value={t.teachers} />
                                <Figure label="Running courses" value={t.courses} sub={`${t.draftCourses} still in draft`} />
                                <Figure label="Learners with results" value={`${t.learnersWithResults} of ${t.learners}`} sub="in running courses" />
                                <Figure label="Active last 7 days" value={`${t.activeLearnersLast7Days} of ${t.learners}`} sub="learners" />
                            </dl>
                        </Section>

                        <Section divided title="Courses" description="Open and closed courses. Select a course to open its Insights.">
                            {courses.length === 0 ? (
                                <EmptyState compact title="No running courses yet." description="Courses appear here once they are opened." />
                            ) : (
                                <DataTable
                                    caption="Courses"
                                    rows={courses}
                                    columns={[
                                        {
                                            key: "title",
                                            header: "Course",
                                            className: "min-w-[12rem]",
                                            render: (c) => (
                                                <div>
                                                    <Link href={`/course/${c.id}/insights`} className="font-semibold text-slate-900 dark:text-white hover:text-[#0D9488] hover:underline">{c.title}</Link>
                                                    <span className="block text-[10px] font-semibold uppercase text-slate-400">{courseLifecycleLabel(c)}</span>
                                                </div>
                                            ),
                                        },
                                        { key: "teachers", header: "Teachers", className: "min-w-[8rem] text-xs text-slate-600 dark:text-slate-300", render: (c) => (c.teachers?.length ? c.teachers.join(", ") : "—") },
                                        { key: "learners", header: "Learners", align: "right", render: (c) => c.learners ?? 0 },
                                        { key: "withData", header: "With results", align: "right", render: (c) => c.learnersWithData ?? 0 },
                                        { key: "mastery", header: "Avg mastery", align: "right", render: (c) => <span className={c.averageMastery == null ? "text-slate-400" : "font-semibold"}>{fmtPct(c.averageMastery)}</span> },
                                        { key: "delta", header: "Change vs baseline", align: "right", render: (c) => <DeltaText value={c.averageDeltaPoints} /> },
                                        { key: "onTime", header: "On time", align: "right", render: (c) => fmtRate(c.onTimeRate) },
                                        { key: "missing", header: "Missing", align: "right", render: (c) => c.missing ?? "—" },
                                        { key: "flagged", header: "Flagged", align: "right", render: (c) => c.atRisk ?? "—" },
                                        { key: "active", header: "Active 7d", align: "right", render: (c) => (c.learners ? `${c.activeLast7Days ?? 0} of ${c.learners}` : "—") },
                                    ]}
                                />
                            )}
                        </Section>

                        <Section
                            divided
                            title="Teaching and product use"
                            description={`The last ${data.days} days.`}
                            actions={
                                <div role="group" aria-label="Period" className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                    {DAY_OPTIONS.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setDays(d)}
                                            aria-pressed={days === d}
                                            className={`px-3 py-1.5 text-xs font-semibold ${days === d ? "bg-[#203A3A] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                                        >
                                            {d} days
                                        </button>
                                    ))}
                                </div>
                            }
                        >
                            <div className="space-y-6">
                                <div>
                                    <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Teaching</h3>
                                    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                                        <Figure
                                            label="Median time to grade"
                                            value={fmtSeconds(data.teaching?.medianGradingSeconds)}
                                            sub={data.teaching?.gradingsTimed ? `from ${data.teaching.gradingsTimed} timed gradings (opening a learner's work to saving the grade)` : "No timed gradings yet"}
                                        />
                                        <Figure label="Edits made after publishing" value={data.teaching?.editsAfterPublish ?? 0} sub="changes to items learners could already see" />
                                    </dl>
                                </div>
                                <div>
                                    <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Product use</h3>
                                    <DataTable
                                        caption={`Product use, last ${data.days} days`}
                                        rows={events}
                                        rowKey={(e) => e.type}
                                        empty="No usage recorded in this period."
                                        columns={[
                                            { key: "type", header: "What", render: (e) => EVENT_LABELS[e.type] || e.type },
                                            { key: "count", header: "Times", align: "right", render: (e) => e.count },
                                            { key: "people", header: "People", align: "right", render: (e) => e.people },
                                        ]}
                                    />
                                </div>
                            </div>
                        </Section>
                    </>
                )}

                <Section divided title="Learning across the school">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-w-0">
                        <GrowthCurvesChart serverUrl={SERVER_URL} />
                        <InclusivityGapReport serverUrl={SERVER_URL} />
                    </div>
                </Section>

                <Section divided title="Data & privacy" description="People can download their own data from their account page. You can download anyone's from their user page.">
                    <RetentionSetting SERVER_URL={SERVER_URL} />
                </Section>
            </div>
        </div>
    );
}
