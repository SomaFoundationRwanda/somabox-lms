"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, DataTable, EmptyState } from "@/components/layout";
import { formatDate, formatInstantDate } from "@/lib/dates";
import { ReasonChips } from "@/components/insights/LearnersTab";
import {
  BandChip, DeltaText, Figure, TrajectoryBars, WorkStateBadge, ErrorNote, LoadingRows,
  fmtGain, fmtPct, fmtRate, itemHref, relativeDay, ITEM_TYPE_LABELS,
} from "@/components/insights/bits";
import { useAttendanceText, attended } from "@/components/attendance/text";

export default function LearnerInsightsPage() {
  const { userId } = useParams();
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { role } = useContext(DataContext);
  const allowed = isTeacher || role === "admin";
  const { tx, txn } = useAttendanceText();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!SERVER_URL || !courseId || !userId || !allowed) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/insights/learners/${encodeURIComponent(userId)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't load this learner.");
      setData(payload);
    } catch (err) {
      setError(err.message || "Couldn't load this learner.");
    } finally {
      setLoading(false);
    }
  }, [SERVER_URL, courseId, userId, allowed]);

  useEffect(() => { load(); }, [load]);

  const l = data?.learner;
  const thresholds = data?.thresholds;
  const titles = new Map((data?.outcomes || []).map((o) => [Number(o.id), o]));
  const back = (
    <Link href={`/course/${courseId}/insights?tab=learners`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> All learners
    </Link>
  );

  if (!allowed) {
    return (
      <div>
        <Breadcrumbs sectionKey="insights" />
        <div className="p-4 md:p-6"><EmptyState compact title="Only teachers can see learners' details." /></div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs sectionKey="insights" itemName={l ? (l.name || l.email) : "Learner"} />
      <div className="p-4 md:p-6 space-y-8 max-w-5xl">
        {back}
        {loading && !data ? (
          <LoadingRows count={4} />
        ) : error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : !l ? null : (
          <>
            <PageHeader
              title={l.name || l.email}
              description={l.name ? l.email : undefined}
              meta={<span>Last active: {relativeDay(l.engagement?.lastActivityAt)}{l.engagement ? ` · active on ${l.engagement.activeDays14 ?? 0} of the last 14 days` : ""}</span>}
            />

            <Section title="Flags">
              {l.risk?.flagged ? (
                <div className="space-y-1">
                  <ReasonChips risk={l.risk} />
                  <p className="text-xs text-slate-500">Flags follow fixed rules. They are a prompt to check in, not a judgement.</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No flags.</p>
              )}
            </Section>

            <Section divided title="Overall">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Figure label="Now" value={l.overall == null ? "—" : fmtPct(l.overall)} sub={l.overall == null ? "No results yet" : `${l.resultsCount ?? 0} results`} />
                <Figure label="Baseline" value={fmtPct(l.overallBaseline)} sub={l.overallBaseline == null ? "No baseline yet" : "Week 0"} />
                <Figure label="Change" value={<DeltaText value={l.deltaPoints} />} sub={`Gain ${fmtGain(l.normalizedGain)}`} />
                <Figure
                  label="Handed in on time"
                  value={fmtRate(l.timeliness?.onTimeRate)}
                  sub={`${l.timeliness?.onTime ?? 0} on time · ${l.timeliness?.late ?? 0} late · ${l.timeliness?.missing ?? 0} missing`}
                />
              </dl>
            </Section>

            <Section divided title={tx("detailTitle")}>
              {l.attendance?.counted ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <Figure label={tx("colRate")} value={fmtRate(l.attendance.rate)} sub={tx("attendedOf", { a: attended(l.attendance), n: l.attendance.counted })} />
                  <Figure label={tx("colAbsences")} value={l.attendance.absent ?? 0} sub={l.attendance.lastAbsentOn ? tx("lastAbsentOn", { date: formatDate(l.attendance.lastAbsentOn) }) : tx("neverAbsent")} />
                  <Figure label={tx("colRun")} value={l.attendance.consecutiveAbsences ?? 0} sub={tx("runHint")} />
                  <Figure label={tx("statusLate")} value={l.attendance.late ?? 0} sub={txn("excusedCount", l.attendance.excused ?? 0)} />
                </dl>
              ) : (
                <p className="text-sm text-slate-500">{tx("detailNone")}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                <Link href={`/course/${courseId}/attendance`} className="font-semibold text-[#0D9488] hover:underline">{tx("openAttendance")}</Link>
              </p>
            </Section>

            <Section divided title="Outcomes">
              <DataTable
                caption="Outcomes for this learner"
                rows={Array.isArray(l.outcomes) ? l.outcomes : []}
                rowKey={(o) => o.outcomeId}
                empty="This course has no outcomes yet."
                columns={[
                  {
                    key: "title",
                    header: "Outcome",
                    className: "min-w-[12rem]",
                    render: (o) => {
                      const info = titles.get(Number(o.outcomeId));
                      return (
                        <span>
                          {info?.code ? <span className="mr-1.5 text-[11px] font-bold text-[#0D9488]">{info.code}</span> : null}
                          <span className="font-medium text-slate-800 dark:text-slate-100">{info?.title || "Outcome"}</span>
                        </span>
                      );
                    },
                  },
                  { key: "bl", header: "Baseline → now", className: "whitespace-nowrap", render: (o) => `${fmtPct(o.baseline)} → ${o.current == null ? "No results yet" : fmtPct(o.current)}` },
                  { key: "band", header: "Band", render: (o) => <BandChip value={o.current} thresholds={thresholds} /> },
                  { key: "delta", header: "Change", align: "right", render: (o) => <DeltaText value={o.deltaPoints} /> },
                  { key: "gain", header: "Gain", align: "right", render: (o) => fmtGain(o.normalizedGain) },
                  { key: "results", header: "Results", align: "right", hideOnMobile: true, render: (o) => o.results ?? 0 },
                  { key: "ttm", header: "Results to mastery", align: "right", render: (o) => (o.resultsToMastery ? o.resultsToMastery : <span className="text-xs text-slate-400">Not yet</span>) },
                ]}
              />
            </Section>

            <Section divided title="Recent results">
              <TrajectoryBars trajectory={l.trajectory} thresholds={thresholds} />
              {Array.isArray(l.trajectory) && l.trajectory.length > 0 ? (
                <ol className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {[...l.trajectory].reverse().map((t, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 dark:border-slate-800 py-1">
                      <span className="min-w-0 truncate">{t.title || "Result"}{t.attempt > 1 ? ` (attempt ${t.attempt})` : ""}</span>
                      <span className="shrink-0">{fmtPct(t.pct)}{t.at ? ` · ${formatInstantDate(t.at)}` : ""}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Section>

            <Section divided title="Work">
              <DataTable
                caption="This learner's graded work"
                rows={Array.isArray(l.work) ? l.work : []}
                rowKey={(w) => w.moduleItemId}
                empty="No published graded work yet."
                columns={[
                  {
                    key: "title",
                    header: "Item",
                    className: "min-w-[10rem]",
                    render: (w) => {
                      const href = itemHref(courseId, w);
                      return href ? <Link href={href} className="font-medium hover:text-[#0D9488] hover:underline">{w.title}</Link> : w.title;
                    },
                  },
                  { key: "type", header: "Type", hideOnMobile: true, render: (w) => <span className="text-xs">{ITEM_TYPE_LABELS[w.type] || w.type}</span> },
                  { key: "due", header: "Due", className: "whitespace-nowrap text-xs", render: (w) => (w.dueDate ? formatDate(w.dueDate) : "No due date") },
                  { key: "state", header: "State", render: (w) => <WorkStateBadge state={w.state} /> },
                  { key: "pct", header: "Score", align: "right", render: (w) => (w.pct == null ? <span className="text-slate-400">—</span> : <span className="font-semibold">{fmtPct(w.pct)}</span>) },
                  { key: "attempts", header: "Attempts", align: "right", hideOnMobile: true, render: (w) => w.attempts ?? "—" },
                ]}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
