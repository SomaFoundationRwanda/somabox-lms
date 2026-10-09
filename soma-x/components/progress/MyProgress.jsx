"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, ListRow, EmptyState } from "@/components/layout";
import { formatDate, formatInstantDate } from "@/lib/dates";
import { trackEvent } from "@/lib/usage";
import { useAttendanceText, attended } from "@/components/attendance/text";
import { fmtPct, TrajectoryBars, WorkStateBadge, itemHref, itemType, LoadingRows, ErrorNote, bandFor } from "@/components/insights/bits";
import { useProgressText, fillNode } from "@/components/progress/text";

// A learner's own progress in one course: growth per outcome, recent results, and their work.
// Only their own data, in encouraging words: no risk flags, no class averages, no ranks.

// Band names for learners: myProgress.status.<band key> in languages/progress.

function outcomeSentence(o, tp) {
  if (o.current == null) return tp("myProgress.outcomeNone");
  if (o.baseline == null) return tp("myProgress.outcomeNow", { now: fmtPct(o.current) });
  const diff = Math.round(o.current - o.baseline);
  if (diff > 0) return tp("myProgress.outcomeGrew", { start: fmtPct(o.baseline), now: fmtPct(o.current), n: diff });
  return tp("myProgress.outcomeSame", { start: fmtPct(o.baseline), now: fmtPct(o.current) });
}

const byDueDate = (a, b) => {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
};

function WorkRow({ courseId, w, showPct }) {
  const { tp } = useProgressText();
  const href = itemHref(courseId, w);
  const type = itemType(tp, w.type);
  const due = w.dueDate ? tp("common.dueOn", { date: formatDate(w.dueDate) }) : tp("common.noDueDate");
  return (
    <ListRow
      title={w.title}
      href={href || undefined}
      subtitle={[type, due].filter(Boolean).join(" · ")}
      actions={
        <span className="inline-flex items-center gap-2">
          {showPct ? <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{w.pct != null ? fmtPct(w.pct) : <span className="text-xs font-normal text-slate-500">{tp("myProgress.notMarkedYet")}</span>}</span> : null}
          <WorkStateBadge state={w.state} label={w.state === "missing" ? tp("myProgress.toHandIn") : w.state === "done_late" ? tp("myProgress.handedInLate") : w.state === "done_on_time" ? tp("myProgress.handedIn") : undefined} />
        </span>
      }
    />
  );
}

export default function MyProgress({ sectionKey = "progress" }) {
  const { SERVER_URL, courseId, userEmail } = useCourse();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const tracked = useRef(false);
  const { txn, tx } = useAttendanceText();
  const { tp, tpn } = useProgressText();

  const load = useCallback(async () => {
    if (!SERVER_URL || !courseId || !userEmail) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/my-progress`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || tp("myProgress.loadFailed"));
      setData(payload);
    } catch (err) {
      setError(err.message || tp("myProgress.loadFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SERVER_URL, courseId, userEmail]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tracked.current || !courseId) return;
    tracked.current = true;
    trackEvent("progress_viewed", {}, courseId);
  }, [courseId]);

  const thresholds = data?.thresholds;
  const outcomes = Array.isArray(data?.outcomes) ? data.outcomes : [];
  const work = Array.isArray(data?.work) ? data.work : [];
  const toDo = work.filter((w) => w.state === "to_do").sort(byDueDate);
  const missing = work.filter((w) => w.state === "missing").sort(byDueDate);
  const done = work.filter((w) => w.state === "done_on_time" || w.state === "done_late").sort((a, b) => byDueDate(b, a));
  const delta = data?.deltaPoints;
  const grew = delta != null && Math.round(delta) > 0;

  return (
    <div>
      <Breadcrumbs sectionKey={sectionKey} />
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader
          title={tp("common.myProgress")}
          description={tp("myProgress.description")}
        />

        {loading && !data ? (
          <LoadingRows />
        ) : error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : !data ? (
          <EmptyState compact title={tp("myProgress.nothing")} />
        ) : (
          <>
            <Section>
              <div className="space-y-1">
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {grew ? tp("myProgress.grew", { n: Math.round(delta) }) : tp("myProgress.keepGoing")}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {data.overall == null
                    ? tp("myProgress.noneMarked")
                    : data.overallBaseline != null
                      ? tp("myProgress.atNowStarted", { now: fmtPct(data.overall), start: fmtPct(data.overallBaseline) })
                      : tp("myProgress.atNow", { now: fmtPct(data.overall) })}
                </p>
              </div>
            </Section>

            {data.attendance?.counted > 0 ? (
              <p className="-mt-4 text-sm text-slate-600 dark:text-slate-300">
                {txn("youAttended", data.attendance.counted, { a: attended(data.attendance) })}.{" "}
                <Link href={`/course/${courseId}/attendance`} className="font-semibold text-[var(--brand-secondary)] hover:underline">{tx("openMyAttendance")}</Link>
              </p>
            ) : null}

            <Section title={tp("myProgress.yourOutcomes")} description={tp("myProgress.yourOutcomesHint")}>
              {outcomes.length === 0 ? (
                <EmptyState compact title={tp("common.noOutcomesYet")} />
              ) : (
                <List label={tp("myProgress.yourOutcomes")}>
                  {outcomes.map((o) => {
                    const band = bandFor(o.current, thresholds);
                    return (
                      <li key={o.outcomeId ?? o.id} className="px-3 py-3 text-sm space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {o.code ? <span className="text-[11px] font-bold text-[var(--brand-secondary)]">{o.code}</span> : null}
                          <span className="font-semibold text-slate-900 dark:text-white">{o.title || tp("common.outcome")}</span>
                          <span className={`inline-flex items-center text-[10px] font-semibold rounded-full border px-1.5 py-0.5 ${band.chip}`}>{tp(`myProgress.status.${band.key}`)}</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{outcomeSentence(o, tp)}</p>
                        {o.resultsToMastery ? (
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            {tpn("myProgress.masteredAfter", o.resultsToMastery)}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </List>
              )}
            </Section>

            <Section title={tp("myProgress.recentTitle")}>
              <TrajectoryBars trajectory={data.trajectory} thresholds={thresholds} label={tp("myProgress.recentTitle")} />
              {Array.isArray(data.trajectory) && data.trajectory.length > 0 ? (
                <List className="mt-3" label={tp("myProgress.recentList")}>
                  {[...data.trajectory].reverse().slice(0, 5).map((t, i) => (
                    <ListRow
                      key={`${t.sourceType}-${t.sourceId}-${i}`}
                      title={t.title || tp("common.result")}
                      subtitle={t.at ? formatInstantDate(t.at) : undefined}
                      actions={<span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmtPct(t.pct)}</span>}
                    />
                  ))}
                </List>
              ) : null}
            </Section>

            <Section title={tp("myProgress.toDo")} description={tp("myProgress.toDoHint")}>
              {toDo.length === 0 ? (
                <p className="text-sm text-slate-500">{tp("myProgress.nothingToDo")}</p>
              ) : (
                <List label={tp("myProgress.toDo")}>{toDo.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
              )}
            </Section>

            {missing.length > 0 ? (
              <Section title={tp("myProgress.stillToHandIn")} description={tp("myProgress.stillToHandInHint")}>
                <List label={tp("myProgress.stillToHandIn")}>{missing.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
              </Section>
            ) : null}

            <Section title={tp("myProgress.done")}>
              {done.length === 0 ? (
                <p className="text-sm text-slate-500">{tp("myProgress.nothingHandedIn")}</p>
              ) : (
                <List label={tp("myProgress.done")}>{done.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} showPct />)}</List>
              )}
            </Section>

            <p className="text-xs text-slate-500">
              {fillNode(tp("myProgress.everyMark", { link: "{link}" }), { link: <Link href={`/course/${courseId}/grades`} className="font-semibold text-[var(--brand-secondary)] hover:underline">{tp("myProgress.openGrades")}</Link> })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
