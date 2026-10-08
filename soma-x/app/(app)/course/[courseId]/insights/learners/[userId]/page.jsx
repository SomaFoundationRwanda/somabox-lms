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
  fmtGain, fmtPct, fmtRate, itemHref, relativeDay, itemType,
} from "@/components/insights/bits";
import { useProgressText } from "@/components/progress/text";
import { useAttendanceText, attended } from "@/components/attendance/text";

export default function LearnerInsightsPage() {
  const { userId } = useParams();
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { role } = useContext(DataContext);
  const allowed = isTeacher || role === "admin";
  const { tx, txn } = useAttendanceText();
  const { tp, tpn, locale } = useProgressText();
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
      if (!res.ok) throw new Error(payload.message || tp("insights.learner.loadFailed"));
      setData(payload);
    } catch (err) {
      setError(err.message || tp("insights.learner.loadFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SERVER_URL, courseId, userId, allowed]);

  useEffect(() => { load(); }, [load]);

  const l = data?.learner;
  const thresholds = data?.thresholds;
  const titles = new Map((data?.outcomes || []).map((o) => [Number(o.id), o]));
  const back = (
    <Link href={`/course/${courseId}/insights?tab=learners`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {tp("insights.learner.allLearners")}
    </Link>
  );

  if (!allowed) {
    return (
      <div>
        <Breadcrumbs sectionKey="insights" />
        <div className="p-4 md:p-6"><EmptyState compact title={tp("insights.learner.onlyTeachers")} /></div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs sectionKey="insights" itemName={l ? (l.name || l.email) : tp("common.learner")} />
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
              meta={<span>{tp("insights.learner.lastActive", { when: relativeDay(l.engagement?.lastActivityAt, tp, locale) })}{l.engagement ? tp("insights.learner.activeDays", { n: l.engagement.activeDays14 ?? 0 }) : ""}</span>}
            />

            <Section title={tp("insights.flags")}>
              {l.risk?.flagged ? (
                <div className="space-y-1">
                  <ReasonChips risk={l.risk} />
                  <p className="text-xs text-slate-500">{tp("insights.learner.flagsNote")}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{tp("insights.learner.noFlags")}</p>
              )}
            </Section>

            <Section divided title={tp("insights.learner.overall")}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Figure label={tp("common.now")} value={l.overall == null ? "—" : fmtPct(l.overall)} sub={l.overall == null ? tp("common.noResultsYet") : tpn("common.results", l.resultsCount ?? 0)} />
                <Figure label={tp("common.baseline")} value={fmtPct(l.overallBaseline)} sub={l.overallBaseline == null ? tp("insights.learner.noBaseline") : tp("common.week0")} />
                <Figure label={tp("common.change")} value={<DeltaText value={l.deltaPoints} />} sub={tp("insights.gainValue", { value: fmtGain(l.normalizedGain) })} />
                <Figure
                  label={tp("insights.handedInOnTime")}
                  value={fmtRate(l.timeliness?.onTimeRate)}
                  sub={tp("insights.learner.timeliness", { onTime: l.timeliness?.onTime ?? 0, late: l.timeliness?.late ?? 0, missing: l.timeliness?.missing ?? 0 })}
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

            <Section divided title={tp("common.outcomes")}>
              <DataTable
                caption={tp("insights.learner.outcomesCaption")}
                rows={Array.isArray(l.outcomes) ? l.outcomes : []}
                rowKey={(o) => o.outcomeId}
                empty={tp("common.noOutcomesYet")}
                columns={[
                  {
                    key: "title",
                    header: tp("common.outcome"),
                    className: "min-w-[12rem]",
                    render: (o) => {
                      const info = titles.get(Number(o.outcomeId));
                      return (
                        <span>
                          {info?.code ? <span className="mr-1.5 text-[11px] font-bold text-[#0D9488]">{info.code}</span> : null}
                          <span className="font-medium text-slate-800 dark:text-slate-100">{info?.title || tp("common.outcome")}</span>
                        </span>
                      );
                    },
                  },
                  { key: "bl", header: tp("insights.baselineToNow"), className: "whitespace-nowrap", render: (o) => `${fmtPct(o.baseline)} → ${o.current == null ? tp("common.noResultsYet") : fmtPct(o.current)}` },
                  { key: "band", header: tp("insights.band"), render: (o) => <BandChip value={o.current} thresholds={thresholds} /> },
                  { key: "delta", header: tp("common.change"), align: "right", render: (o) => <DeltaText value={o.deltaPoints} /> },
                  { key: "gain", header: tp("common.gain"), align: "right", render: (o) => fmtGain(o.normalizedGain) },
                  { key: "results", header: tp("common.resultsHeader"), align: "right", hideOnMobile: true, render: (o) => o.results ?? 0 },
                  { key: "ttm", header: tp("insights.resultsToMastery"), align: "right", render: (o) => (o.resultsToMastery ? o.resultsToMastery : <span className="text-xs text-slate-400">{tp("common.notYet")}</span>) },
                ]}
              />
            </Section>

            <Section divided title={tp("insights.recentResults")}>
              <TrajectoryBars trajectory={l.trajectory} thresholds={thresholds} />
              {Array.isArray(l.trajectory) && l.trajectory.length > 0 ? (
                <ol className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {[...l.trajectory].reverse().map((t, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 dark:border-slate-800 py-1">
                      <span className="min-w-0 truncate">{t.title || tp("common.result")}{t.attempt > 1 ? tp("insights.attempt", { n: t.attempt }) : ""}</span>
                      <span className="shrink-0">{fmtPct(t.pct)}{t.at ? ` · ${formatInstantDate(t.at)}` : ""}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Section>

            <Section divided title={tp("insights.learner.work")}>
              <DataTable
                caption={tp("insights.learner.workCaption")}
                rows={Array.isArray(l.work) ? l.work : []}
                rowKey={(w) => w.moduleItemId}
                empty={tp("insights.noGradedWork")}
                columns={[
                  {
                    key: "title",
                    header: tp("common.item"),
                    className: "min-w-[10rem]",
                    render: (w) => {
                      const href = itemHref(courseId, w);
                      return href ? <Link href={href} className="font-medium hover:text-[#0D9488] hover:underline">{w.title}</Link> : w.title;
                    },
                  },
                  { key: "type", header: tp("common.type"), hideOnMobile: true, render: (w) => <span className="text-xs">{itemType(tp, w.type) || w.type}</span> },
                  { key: "due", header: tp("common.due"), className: "whitespace-nowrap text-xs", render: (w) => (w.dueDate ? formatDate(w.dueDate) : tp("common.noDueDate")) },
                  { key: "state", header: tp("insights.state"), render: (w) => <WorkStateBadge state={w.state} /> },
                  { key: "pct", header: tp("common.score"), align: "right", render: (w) => (w.pct == null ? <span className="text-slate-400">—</span> : <span className="font-semibold">{fmtPct(w.pct)}</span>) },
                  { key: "attempts", header: tp("insights.attempts"), align: "right", hideOnMobile: true, render: (w) => w.attempts ?? "—" },
                ]}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
