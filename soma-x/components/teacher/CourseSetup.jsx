"use client";

// Where a new course starts: three short steps, then publish or keep it as a draft.
//   1. When: the first day and how many weeks (the weeks are made, with their dates).
//   2. What you'll teach: the outcomes (AI can suggest them from the course description).
//   3. First week: something for learners to do in Week 1 (or AI drafts it).
//   4. Ready: what's still missing, if anything, and Publish.
// The step is in the address (?step=2), so Back and reloading work. Measuring where learners
// start (Week 0) is offered later, on the course home: it's optional.
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, FileText, ClipboardList, HelpCircle, MessageSquare, Sparkles, Target } from "lucide-react";
import { isDateString, todayIn } from "@somabox/timeline";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { startAiJob } from "@/lib/ai";
import useAiStatus from "@/lib/useAiStatus";
import useSetupText from "@/lib/useSetupText";
import { toDateInput } from "@/lib/dates";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { useCourseText } from "@/components/course/useCourseText";
import { newItemHref } from "@/components/course/modules/useItemEditor";
import { PublishDialog } from "@/components/course/CourseStatusBar";
import AiJobPanel from "@/components/ai/AiJobPanel";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { Heading, Text } from "@/components/typography";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/form";
import Loader from "@/components/ui/Loader";

const STEPS = ["when", "outcomes", "firstWeek", "ready"];
const ADD_TYPES = [
  { type: "page", icon: FileText },
  { type: "assignment", icon: ClipboardList },
  { type: "quiz", icon: HelpCircle },
  { type: "discussion", icon: MessageSquare },
];

function Setup() {
  const { courseId, course, isCourseTeacher, refresh } = useCourse();
  const { t, tf, weekLabel, ownWeekTitle, fmtDay } = useCourseText();
  const { blockingText } = useSetupText();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const aiStatus = useAiStatus();
  const step = Math.min(STEPS.length, Math.max(1, Number(params.get("step")) || 1));
  const go = (n) => router.push(`/course/${courseId}/setup?step=${n}`);

  const modules = useCourseSection("modules").data;
  const outcomes = useCourseSection("outcomes").data;
  const status = useCourseSection("setup-status").data;
  const weeks = useMemo(() => (Array.isArray(modules) ? modules : []).filter((m) => m.kind === "regular").sort((a, b) => (a.week_offset ?? 0) - (b.week_offset ?? 0)), [modules]);
  const week1 = weeks[0] || null;

  const [startDate, setStartDate] = useState("");
  const [weekCount, setWeekCount] = useState(4);
  const [newOutcome, setNewOutcome] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [outlineJob, setOutlineJob] = useState(null);
  const [aiWeekStarted, setAiWeekStarted] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // The form starts from the course as it is.
  useEffect(() => {
    if (!course) return;
    setStartDate((v) => v || toDateInput(course.start_date) || todayIn());
    setWeekCount((v) => (course.length_weeks ? Number(course.length_weeks) : Math.max(v, weeks.length || 0)));
  }, [course, weeks.length]);

  const courseChanged = () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: queryKeys.courses });
  };

  // 1. Dates and weeks: the course's first day and length, and a week for each one missing.
  const saveWhen = async () => {
    if (!isDateString(startDate)) { setError(t("setup.chooseStart")); return; }
    const n = Math.min(52, Math.max(1, Number(weekCount) || 1));
    setBusy("when");
    setError("");
    try {
      await apiFetch(`/courses/${courseId}`, { method: "PATCH", json: { startDate, lengthWeeks: n } });
      const have = new Set(weeks.map((w) => Number(w.week_offset)));
      for (let w = 1; w <= n; w++) {
        if (!have.has(w)) await apiFetch(`/courses/${courseId}/modules`, { method: "POST", json: { title: tf("weeks.week", { n: w }), weekOffset: w } });
      }
      courseChanged();
      go(2);
    } catch (err) {
      setError(getErrorMessage(err) || t("setup.saveFailed"));
    } finally {
      setBusy("");
    }
  };

  // 2. Outcomes, one at a time, or suggested by AI from the course's description.
  const addOutcome = async () => {
    if (!newOutcome.trim()) return;
    setBusy("outcome");
    setError("");
    try {
      await apiFetch(`/courses/${courseId}/outcomes`, { method: "POST", json: { title: newOutcome.trim() } });
      setNewOutcome("");
      courseChanged();
    } catch (err) {
      setError(getErrorMessage(err) || t("setup.saveFailed"));
    } finally {
      setBusy("");
    }
  };
  const suggestOutcomes = async () => {
    setBusy("ai-outline");
    setError("");
    const r = await startAiJob(process.env.NEXT_PUBLIC_SERVER_URL, courseId, { kind: "outline", input: { topic: (course?.description || course?.title || "").trim(), weeks: weeks.length || Number(weekCount) || 4 } });
    setBusy("");
    if (!r.ok) setError(r.message);
    else setOutlineJob(r.data);
  };

  // 3. AI drafts Week 1 (a page, a quiz and an assignment), to check in AI drafts.
  const draftWeek1 = async () => {
    if (!week1) return;
    setBusy("ai-week");
    setError("");
    const r = await startAiJob(process.env.NEXT_PUBLIC_SERVER_URL, courseId, { kind: "fill_week", moduleId: week1.id });
    setBusy("");
    if (!r.ok) setError(r.message);
    else setAiWeekStarted(true);
  };

  if (!isCourseTeacher) return <p className="p-6 text-ui text-fg-muted">{t("setup.teacherOnly")}</p>;
  if (!course || !modules || !outcomes) return <Loader variant="page" className="min-h-[50vh]" />;

  const back = `/course/${courseId}/setup?step=3`;
  const week1Items = (week1?.items || []).filter((i) => i.item_type !== "sub_header");
  const blocking = Array.isArray(status?.blocking) ? status.blocking : [];
  const lastWeekEnd = weeks.length ? weeks[weeks.length - 1].endDate : null;

  return (
    <div>
      <Breadcrumbs sectionKey="settings" itemName={t("setup.title")} />
      <div className="p-4 md:p-6 max-w-2xl space-y-6">
        <div>
          <Heading level={1}>{t("setup.title")}</Heading>
          <Text tone="muted" className="mt-1">{t("setup.intro")}</Text>
        </div>

        {/* Progress: the steps by name, the current one marked. */}
        <ol aria-label={t("setup.progress")} className="grid grid-cols-4 gap-2">
          {STEPS.map((key, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "todo";
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => go(n)}
                  aria-current={state === "current" ? "step" : undefined}
                  className={`w-full text-left rounded-lg border px-2.5 py-2 text-caption font-semibold ${state === "current" ? "border-brand-strong bg-brand-soft text-brand-fg" : state === "done" ? "border-line text-fg-muted" : "border-line text-fg-subtle"}`}
                >
                  <span className="flex items-center gap-1">{state === "done" ? <Check className="w-3.5 h-3.5 text-success-fg" aria-hidden="true" /> : <span>{n}.</span>} {t(`setup.steps.${key}`)}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-ui text-danger-fg">{error}</p> : null}

        {step === 1 ? (
          <section aria-labelledby="setup-when" className="space-y-4">
            <Heading level={2} id="setup-when" className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-brand-fg" aria-hidden="true" /> {t("setup.whenTitle")}</Heading>
            <Text tone="muted">{t("setup.whenText")}</Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="setup-start" label={t("setup.startDate")} required hint={t("setup.startHint")}>
                <TextInput id="setup-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full" />
              </Field>
              <Field id="setup-weeks" label={t("setup.weekCount")} required hint={lastWeekEnd ? tf("setup.endsOn", { date: fmtDay(lastWeekEnd) }) : undefined}>
                <TextInput id="setup-weeks" type="number" min={1} max={52} value={weekCount} onChange={(e) => setWeekCount(e.target.value)} className="w-full" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={saveWhen} disabled={busy === "when"}>{t("setup.continue")}</Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby="setup-outcomes" className="space-y-4">
            <Heading level={2} id="setup-outcomes" className="flex items-center gap-2"><Target className="w-5 h-5 text-brand-fg" aria-hidden="true" /> {t("setup.outcomesTitle")}</Heading>
            <Text tone="muted">{t("setup.outcomesText")}</Text>
            {outcomes.length > 0 ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {outcomes.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 px-3 py-2 text-ui text-fg">
                    <span className="text-caption font-bold text-brand-fg">{o.code}</span> {o.title}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <Field id="setup-outcome" label={t("setup.outcomeLabel")} className="flex-1 min-w-[14rem]">
                <TextInput id="setup-outcome" value={newOutcome} onChange={(e) => setNewOutcome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addOutcome(); }} placeholder={t("setup.outcomePlaceholder")} className="w-full" />
              </Field>
              <Button type="button" variant="outline" onClick={addOutcome} disabled={!newOutcome.trim() || busy === "outcome"}>{t("setup.addOutcome")}</Button>
            </div>
            {aiStatus.allowed ? (
              <div className="rounded-lg border border-line bg-surface-sunken p-3 space-y-2">
                <Text variant="small" tone="muted">{t("setup.aiOutcomesText")}</Text>
                <Button type="button" size="sm" variant="outline" onClick={suggestOutcomes} disabled={busy === "ai-outline" || (outlineJob && ["queued", "running"].includes(outlineJob.status))} className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {t("setup.aiOutcomes")}
                </Button>
                {outlineJob ? (
                  <AiJobPanel key={outlineJob.id} SERVER_URL={process.env.NEXT_PUBLIC_SERVER_URL} courseId={courseId} job={outlineJob} label={t("setup.aiOutcomes")} outcomes={outcomes} onApproved={courseChanged} onClose={() => setOutlineJob(null)} />
                ) : null}
              </div>
            ) : null}
            {outcomes.length === 0 ? <Text variant="small" tone="subtle">{t("setup.outcomesLater")}</Text> : null}
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => go(1)}>{t("setup.back")}</Button>
              <Button type="button" onClick={() => go(3)}>{t("setup.continue")}</Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby="setup-first" className="space-y-4">
            <Heading level={2} id="setup-first">{week1 ? tf("setup.firstWeekTitle", { week: weekLabel(week1) }) : t("setup.firstWeekNoWeeks")}</Heading>
            <Text tone="muted">{t("setup.firstWeekText")}</Text>
            {week1 ? (
              <>
                {week1Items.length > 0 ? (
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {week1Items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-ui text-fg">
                        <span className="truncate">{i.title}</span>
                        <span className="text-caption text-fg-subtle shrink-0">{t(`items.${i.item_type}`)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <Text variant="small" tone="subtle">{tf("setup.weekEmpty", { week: ownWeekTitle(week1) || weekLabel(week1) })}</Text>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ADD_TYPES.map(({ type, icon: Icon }) => (
                    <Button key={type} asChild variant="outline" className="h-auto flex-col gap-1 py-3">
                      <Link href={`${newItemHref(courseId, week1.id, type)}&back=${encodeURIComponent(back)}`}>
                        <Icon className="w-4 h-4" aria-hidden="true" /> {t(`modules.addType.${type}`)}
                      </Link>
                    </Button>
                  ))}
                </div>
                {aiStatus.allowed ? (
                  <div className="rounded-lg border border-line bg-surface-sunken p-3 space-y-2">
                    <Text variant="small" tone="muted">{aiWeekStarted ? t("setup.aiWeekStarted") : t("setup.aiWeekText")}</Text>
                    {aiWeekStarted ? (
                      <Link href={`/course/${courseId}/ai`} className="text-caption font-semibold text-brand-fg hover:underline">{t("modules.ai.openDrafts")} &rarr;</Link>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={draftWeek1} disabled={busy === "ai-week"} className="gap-1.5"><Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {tf("setup.aiWeek", { week: weekLabel(week1) })}</Button>
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => go(1)}>{t("setup.addWeeksFirst")}</Button>
            )}
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => go(2)}>{t("setup.back")}</Button>
              <Button type="button" onClick={() => go(4)}>{t("setup.continue")}</Button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section aria-labelledby="setup-ready" className="space-y-4">
            <Heading level={2} id="setup-ready">{blocking.length ? t("setup.almostTitle") : t("setup.readyTitle")}</Heading>
            <Text tone="muted">{blocking.length ? t("setup.almostText") : course.lifecycle === "draft" ? t("setup.readyText") : t("setup.publishedText")}</Text>
            {blocking.length ? (
              <ul className="space-y-2">
                {blocking.map((b) => (
                  <li key={b.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2 text-ui text-fg">
                    <span>{blockingText(b)}</span>
                    {b.href ? <Link href={b.href} className="shrink-0 text-caption font-semibold text-brand-fg hover:underline">{t("status.fix")} &rarr;</Link> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => go(3)}>{t("setup.back")}</Button>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><Link href={`/course/${courseId}/home`}>{course.lifecycle === "draft" ? t("setup.keepDraft") : t("setup.toCourse")}</Link></Button>
                {course.lifecycle === "draft" && blocking.length === 0 ? <Button type="button" onClick={() => setPublishing(true)}>{t("status.publish")}</Button> : null}
              </div>
            </div>
            {publishing ? <PublishDialog courseId={courseId} course={course} onClose={() => setPublishing(false)} onDone={() => { courseChanged(); router.push(`/course/${courseId}/home`); }} /> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default function CourseSetup() {
  return (
    <Suspense fallback={<Loader variant="page" className="min-h-[50vh]" />}>
      <Setup />
    </Suspense>
  );
}
