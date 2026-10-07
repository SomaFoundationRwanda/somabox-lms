"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, ListRow, EmptyState } from "@/components/layout";
import { formatDate, formatInstantDate } from "@/lib/dates";
import { trackEvent } from "@/lib/usage";
import { fmtPct, TrajectoryBars, WorkStateBadge, itemHref, ITEM_TYPE_LABELS, LoadingRows, ErrorNote, bandFor } from "@/components/insights/bits";

// A learner's own progress in one course: growth per outcome, recent results, and their work.
// Only their own data, in encouraging words: no risk flags, no class averages, no ranks.

const LEARNER_STATUS = {
  needsReteach: "Still building",
  onTrack: "On track",
  mastered: "Mastered",
  noData: "No results yet",
};

function outcomeSentence(o) {
  if (o.current == null) return "No results yet for this outcome.";
  if (o.baseline == null) return `You're at ${fmtPct(o.current)} now.`;
  const diff = Math.round(o.current - o.baseline);
  if (diff > 0) return `You started at ${fmtPct(o.baseline)} and you're at ${fmtPct(o.current)} now (+${diff} points).`;
  return `You started at ${fmtPct(o.baseline)} and you're at ${fmtPct(o.current)} now.`;
}

const byDueDate = (a, b) => {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
};

function WorkRow({ courseId, w, showPct }) {
  const href = itemHref(courseId, w);
  const type = ITEM_TYPE_LABELS[w.type] || "";
  const due = w.dueDate ? `Due ${formatDate(w.dueDate)}` : "No due date";
  return (
    <ListRow
      title={w.title}
      href={href || undefined}
      subtitle={[type, due].filter(Boolean).join(" · ")}
      actions={
        <span className="inline-flex items-center gap-2">
          {showPct ? <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{w.pct != null ? fmtPct(w.pct) : <span className="text-xs font-normal text-slate-500">Not marked yet</span>}</span> : null}
          <WorkStateBadge state={w.state} label={w.state === "missing" ? "To hand in" : w.state === "done_late" ? "Handed in late" : w.state === "done_on_time" ? "Handed in" : undefined} />
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

  const load = useCallback(async () => {
    if (!SERVER_URL || !courseId || !userEmail) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/my-progress`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't load your progress.");
      setData(payload);
    } catch (err) {
      setError(err.message || "Couldn't load your progress.");
    } finally {
      setLoading(false);
    }
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
          title="My progress"
          description="How you're doing on this course's outcomes, from your graded work and quizzes."
        />

        {loading && !data ? (
          <LoadingRows />
        ) : error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : !data ? (
          <EmptyState compact title="No progress to show yet." />
        ) : (
          <>
            <Section>
              <div className="space-y-1">
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {grew ? `You've grown +${Math.round(delta)} points since the start` : "Keep going — here's where you are"}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {data.overall == null
                    ? "You don't have any marked results yet. They'll show here once your work is marked."
                    : data.overallBaseline != null
                      ? `Across your outcomes you're at ${fmtPct(data.overall)} now. You started at ${fmtPct(data.overallBaseline)}.`
                      : `Across your outcomes you're at ${fmtPct(data.overall)} now.`}
                </p>
              </div>
            </Section>

            <Section title="Your outcomes" description="Each outcome now, compared with where you started (your Week 0 baseline). Practice doesn't count here.">
              {outcomes.length === 0 ? (
                <EmptyState compact title="This course has no outcomes yet." />
              ) : (
                <List label="Your outcomes">
                  {outcomes.map((o) => {
                    const band = bandFor(o.current, thresholds);
                    return (
                      <li key={o.outcomeId ?? o.id} className="px-3 py-3 text-sm space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {o.code ? <span className="text-[11px] font-bold text-[#0D9488]">{o.code}</span> : null}
                          <span className="font-semibold text-slate-900 dark:text-white">{o.title || "Outcome"}</span>
                          <span className={`inline-flex items-center text-[10px] font-semibold rounded-full border px-1.5 py-0.5 ${band.chip}`}>{LEARNER_STATUS[band.key]}</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{outcomeSentence(o)}</p>
                        {o.resultsToMastery ? (
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Mastered after {o.resultsToMastery} {o.resultsToMastery === 1 ? "try" : "tries"}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </List>
              )}
            </Section>

            <Section title="Your recent results">
              <TrajectoryBars trajectory={data.trajectory} thresholds={thresholds} label="Your recent results" />
              {Array.isArray(data.trajectory) && data.trajectory.length > 0 ? (
                <List className="mt-3" label="Recent results list">
                  {[...data.trajectory].reverse().slice(0, 5).map((t, i) => (
                    <ListRow
                      key={`${t.sourceType}-${t.sourceId}-${i}`}
                      title={t.title || "Result"}
                      subtitle={t.at ? formatInstantDate(t.at) : undefined}
                      actions={<span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmtPct(t.pct)}</span>}
                    />
                  ))}
                </List>
              ) : null}
            </Section>

            <Section title="To do" description="Work that's open now, soonest due first.">
              {toDo.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing to do right now.</p>
              ) : (
                <List label="To do">{toDo.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
              )}
            </Section>

            {missing.length > 0 ? (
              <Section title="Still to hand in" description="These were due already. Hand them in when you can, or talk to your teacher.">
                <List label="Still to hand in">{missing.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
              </Section>
            ) : null}

            <Section title="Done">
              {done.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing handed in yet.</p>
              ) : (
                <List label="Done">{done.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} showPct />)}</List>
              )}
            </Section>

            <p className="text-xs text-slate-500">
              Want to see every mark? <Link href={`/course/${courseId}/grades`} className="font-semibold text-[#0D9488] hover:underline">Open Grades</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
