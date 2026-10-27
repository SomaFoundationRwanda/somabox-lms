"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCourseSection } from "@/lib/useCourseSection";
import { ApiError, apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { CheckCircle2, ChevronRight, Sparkles, Plus, Trash2, ArrowRight, Target, Calendar, BookOpen, Layers } from "lucide-react";
import { isDateString, todayIn } from "@somabox/timeline";
import { formatDate, toDateInput } from "@/lib/dates";
import BaselinePanel from "./BaselinePanel";
import Link from "next/link";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob } from "@/lib/ai";
import { AiStatusNote } from "@/components/ai/AiBits";
import AiJobPanel from "@/components/ai/AiJobPanel";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import useSetupText from "@/lib/useSetupText";
import { Field, TextInput } from "@/components/form";

// moduleWeekLabel, in the current language.
function weekLabelT(m, t) {
  if (!m) return "";
  if (m.kind === "baseline") return t("teacher.wizard.week0Label");
  if (m.kind === "unassigned" || m.week_offset === null || m.week_offset === undefined) return t("teacher.wizard.unassigned");
  return fill(t("teacher.wizard.weekN"), { n: m.week_offset });
}

export default function CourseSetupWizard({ courseId, course, onCompleted }) {
  // Still passed to the AI helpers (lib/ai.js, AiJobPanel).
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { blockingText } = useSetupText();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openErrors, setOpenErrors] = useState([]);

  // Step 1 State: Setup
  const [setupForm, setSetupForm] = useState({
    title: course?.title || "",
    startDate: toDateInput(course?.start_date) || todayIn(),
    lengthWeeks: course?.length_weeks || 4,
    gradingScale: "A:90, B:80, C:70, D:60, F:<60",
  });

  // Step 2 State: Outcomes
  // The course's kept outcomes and weeks (shared with the Outcomes and Modules pages).
  const outcomesQuery = useCourseSection("outcomes");
  const modulesQuery = useCourseSection("modules");
  const outcomes = Array.isArray(outcomesQuery.data) ? outcomesQuery.data : [];
  const [newOutcomeTitle, setNewOutcomeTitle] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const aiStatus = useAiStatus();
  const [outlineJob, setOutlineJob] = useState(null);
  const [aiStarting, setAiStarting] = useState("");
  const [fillStarted, setFillStarted] = useState({}); // moduleId -> true

  // Step 4 State: Modules
  const modules = Array.isArray(modulesQuery.data) ? modulesQuery.data : [];

  // After a change: everything kept for the course (weeks, outcomes, setup status, baseline).
  const loadWizardData = () => queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });

  // Step 1: Save Course details & next
  const saveStep1 = async () => {
    if (!isDateString(setupForm.startDate)) {
      setError(t("teacher.wizard.chooseStart"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiFetch(`/courses/${courseId}`, {
        method: "PATCH",
        json: { title: setupForm.title, startDate: setupForm.startDate, lengthWeeks: setupForm.lengthWeeks },
      }).catch((err) => { throw new Error(err?.body?.message || t("teacher.wizard.updateFailed")); });
      loadWizardData();
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      setStep(2);
    } catch (err) {
      setError(err.message || t("teacher.wizard.updateFailed"));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Create Outcome
  const createOutcome = async () => {
    if (!newOutcomeTitle.trim()) return;
    setLoading(true);
    try {
      await apiFetch(`/courses/${courseId}/outcomes`, {
        method: "POST",
        json: { title: newOutcomeTitle.trim(), description: t("teacher.wizard.coreOutcome") },
      });
      setNewOutcomeTitle("");
      await loadWizardData();
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  // Step 2: AI proposes an outline (outcomes + weeks) as a draft the teacher reviews inline.
  const proposeAiOutcomes = async () => {
    const topic = (aiTopic || setupForm.title).trim();
    if (!topic) { setError(t("teacher.wizard.topicFirst")); return; }
    setAiStarting("outline");
    setError("");
    const r = await startAiJob(SERVER_URL, courseId, { kind: "outline", input: { topic, weeks: Number(setupForm.lengthWeeks) || 4 } });
    setAiStarting("");
    if (!r.ok) { setError(r.message); return; }
    setOutlineJob(r.data);
  };

  // Step 4: Create Module
  const addModuleWeek = async (weekOffset) => {
    setLoading(true);
    try {
      // Week 0 is the baseline module and is created by kind, not by offset.
      const body = Number(weekOffset) === 0
        ? { title: t("teacher.baseline.week0Title"), kind: "baseline" }
        : { title: fill(t("teacher.wizard.newWeekTitle"), { n: weekOffset }), weekOffset };
      await apiFetch(`/courses/${courseId}/modules`, { method: "POST", json: body }).catch((err) => {
        if (err?.status === 0) throw err;
        setError(err?.body?.message || t("teacher.wizard.addWeekFailed"));
      });
      await loadWizardData();
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  // Step 4: AI drafts a page, quiz and assignment for a week; they wait in AI drafts.
  const aiFillModule = async (moduleId) => {
    setAiStarting(`fill-${moduleId}`);
    setError("");
    const r = await startAiJob(SERVER_URL, courseId, { kind: "fill_week", moduleId });
    setAiStarting("");
    if (!r.ok) { setError(r.message); return; }
    setFillStarted((m) => ({ ...m, [moduleId]: true }));
  };

  // Step 5: Open Course
  const openCourseFinal = async () => {
    setLoading(true);
    setError("");
    setOpenErrors([]);
    try {
      const failure = await apiFetch(`/courses/${courseId}/open-course`, { method: "POST", json: {} })
        .then(() => null)
        .catch((err) => {
          if (!(err instanceof ApiError) || err.status === 0) throw err;
          return err.body || {};
        });
      if (!failure) {
        queryClient.invalidateQueries({ queryKey: queryKeys.courses });
        loadWizardData();
        onCompleted?.();
      } else {
        const blocking = Array.isArray(failure.blocking) ? failure.blocking.map(blockingText).filter(Boolean) : [];
        // The listed steps say what's missing; the server's summary sentence is English only.
        setError(blocking.length ? t("teacher.setup.cantOpenTitle") : (failure.message || t("teacher.setup.cantOpenYet")));
        setOpenErrors(blocking);
      }
    } catch (err) {
      setError(t("teacher.wizard.openFailed"));
    } finally {
      setLoading(false);
    }
  };

  const STEPS = [
    { num: 1, label: t("teacher.wizard.stepSetup") },
    { num: 2, label: t("teacher.wizard.stepOutcomes") },
    { num: 3, label: t("teacher.wizard.stepBaseline") },
    { num: 4, label: t("teacher.wizard.stepModules") },
    { num: 5, label: t("teacher.wizard.stepSyllabus") },
  ];

  return (
    <div className="space-y-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-surface rounded-xl p-4 md:p-6 border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-caption font-bold text-brand-fg">{t("teacher.wizard.guided")}</span>
              <h1 className="text-title font-extrabold text-fg mt-1">{t("teacher.wizard.heading")}</h1>
            </div>
            <span className="text-caption font-semibold bg-brand-soft text-brand-fg border border-brand/40 px-3 py-1.5 rounded-full">
              {fill(t("teacher.wizard.stepOf"), { step, total: 5 })}
            </span>
          </div>

          {/* Stepper progress */}
          <div className="grid grid-cols-5 gap-2 mt-6 overflow-x-auto">
            {STEPS.map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                aria-current={step === s.num ? "step" : undefined}
                className={`flex flex-col items-start p-2.5 min-w-[5.5rem] rounded-xl border text-left transition-all ${
                  step === s.num
                    ? "bg-brand-strong text-on-brand-strong border-brand-strong shadow-sm"
                    : s.num < step
                    ? "bg-brand-soft text-brand-fg border-brand/40"
                    : "bg-surface text-fg-subtle border-line"
                }`}
              >
                <div className="flex items-center gap-1.5 text-caption font-bold">
                  {s.num < step ? <CheckCircle2 className="w-3.5 h-3.5 text-brand-fg shrink-0" /> : <span>{s.num}.</span>}
                  <span className="truncate">{s.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div role="alert" className="p-4 bg-danger-soft border border-danger/30 text-danger-fg text-caption rounded-xl">
            <p>{error}</p>
            {openErrors.length > 0 && (
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {openErrors.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}
          </div>
        ) : null}

        {/* STEP 1: Course Setup */}
        {step === 1 && (
          <div className="bg-surface rounded-xl p-4 md:p-6 border border-line space-y-4">
            <h2 className="text-section font-bold text-fg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-fg" /> {t("teacher.wizard.step1Title")}
            </h2>
            <p className="text-caption text-fg-muted">
              {t("teacher.wizard.step1Help")}
            </p>

            <div className="space-y-4 max-w-md pt-2">
              <Field label={t("teacher.createCourse.courseTitle")} required>
                  <TextInput
                      aria-label={t("teacher.createCourse.courseTitle")}
                      value={setupForm.title}
                      onChange={(e) => setSetupForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder={t("teacher.wizard.titlePlaceholder")}
                  />
              </Field>

              <Field label={t("teacher.wizard.startDate")} required hint={t("teacher.wizard.startHelp")}>
                  <TextInput
                      aria-label={t("teacher.wizard.startDate")}
                      type="date"
                      value={setupForm.startDate}
                      onChange={(e) => setSetupForm((p) => ({ ...p, startDate: e.target.value }))}
                  />
              </Field>

              <Field label={t("teacher.wizard.duration")}>
                  <TextInput
                      aria-label={t("teacher.wizard.duration")}
                      type="number"
                      min={1}
                      max={52}
                      value={setupForm.lengthWeeks}
                      onChange={(e) => setSetupForm((p) => ({ ...p, lengthWeeks: Number(e.target.value) }))}
                  />
              </Field>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={saveStep1}
                  disabled={loading || !setupForm.title.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-strong text-on-brand-strong rounded-xl text-ui font-semibold hover:bg-brand-strong/90 transition-colors disabled:opacity-50"
                >
                  {t("teacher.wizard.toOutcomes")} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Outcomes */}
        {step === 2 && (
          <div className="bg-surface rounded-xl p-4 md:p-6 border border-line space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-section font-bold text-fg flex items-center gap-2">
                  <Target className="w-5 h-5 text-brand-fg" /> {t("teacher.wizard.step2Title")}
                </h2>
                <p className="text-caption text-fg-muted mt-0.5">
                  {t("teacher.wizard.step2Help")}
                </p>
              </div>

              {aiStatus.allowed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <TextInput
                    placeholder={t("teacher.createCourse.descriptionPlaceholder")}
                    aria-label={t("teacher.wizard.aiTopic")}
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    size="sm"
                    className="w-auto"
                  />
                  <button
                    onClick={proposeAiOutcomes}
                    disabled={aiStarting === "outline" || (outlineJob && ["queued", "running"].includes(outlineJob.status))}
                    className="flex items-center gap-1 text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {aiStarting === "outline" ? t("teacher.wizard.starting") : t("teacher.wizard.aiPropose")}
                  </button>
                </div>
              ) : null}
            </div>
            <AiStatusNote status={aiStatus} />

            {outlineJob ? (
              <AiJobPanel
                key={outlineJob.id}
                SERVER_URL={SERVER_URL}
                courseId={courseId}
                job={outlineJob}
                label={fill(t("teacher.wizard.outlineLabel"), { n: Number(setupForm.lengthWeeks) || 4 })}
                outcomes={outcomes}
                onApproved={() => loadWizardData()}
                onClose={() => setOutlineJob(null)}
              />
            ) : null}

            <div className="flex gap-2 max-w-md pt-2">
              <TextInput aria-label={t("teacher.wizard.outcomePlaceholder")}
                value={newOutcomeTitle}
                onChange={(e) => setNewOutcomeTitle(e.target.value)}
                placeholder={t("teacher.wizard.outcomePlaceholder")}
                className="flex-1"
              />
              <button
                onClick={createOutcome}
                disabled={loading || !newOutcomeTitle.trim()}
                className="px-4 py-2 bg-brand-strong text-on-brand-strong rounded-xl text-caption font-semibold hover:bg-brand-strong/90 transition-colors"
              >
                {t("teacher.wizard.addOutcome")}
              </button>
            </div>

            {/* List outcomes */}
            <div className="divide-y divide-line border border-line rounded-xl">
              {outcomes.length === 0 ? (
                <div className="p-4 text-caption text-fg-subtle text-center">{t("teacher.wizard.noOutcomes")}</div>
              ) : (
                outcomes.map((o) => (
                  <div key={o.id} className="p-3.5 flex items-start gap-3">
                    <Target className="w-4 h-4 text-brand-fg shrink-0 mt-0.5" />
                    <div>
                      <p className="text-ui font-semibold text-fg">{o.title}</p>
                      {o.description ? <p className="text-caption text-fg-subtle mt-0.5">{o.description}</p> : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-caption font-semibold text-fg-muted">{t("teacher.wizard.back")}</button>
              <button
                onClick={() => setStep(3)}
                disabled={outcomes.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-strong text-on-brand-strong rounded-xl text-ui font-semibold hover:bg-brand-strong/90 transition-colors disabled:opacity-50"
              >
                {t("teacher.wizard.toBaseline")} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Baseline Assessment */}
        {step === 3 && (
          <div className="bg-surface rounded-xl p-4 md:p-6 border border-line space-y-4">
            <h2 className="text-section font-bold text-fg flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-fg" /> {t("teacher.wizard.step3Title")}
            </h2>
            <p className="text-caption text-fg-muted">
              {t("teacher.wizard.step3Help")}
            </p>

            <BaselinePanel
              courseId={courseId}
              isDraft={!course?.lifecycle || course.lifecycle === "draft"}
              onChanged={loadWizardData}
              compact
            />

            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-caption font-semibold text-fg-muted">{t("teacher.wizard.back")}</button>
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-strong text-on-brand-strong rounded-xl text-ui font-semibold hover:bg-brand-strong/90 transition-colors"
              >
                {t("teacher.wizard.toModules")} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Modules Timeline */}
        {step === 4 && (
          <div className="bg-surface rounded-xl p-4 md:p-6 border border-line space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-section font-bold text-fg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-brand-fg" /> {t("teacher.wizard.step4Title")}
                </h2>
                <p className="text-caption text-fg-muted">
                  {t("teacher.wizard.step4Help")}
                </p>
              </div>

              <button
                onClick={() => addModuleWeek(
                  Math.max(0, ...modules.filter((m) => m.kind !== "baseline" && m.kind !== "unassigned").map((m) => Number(m.week_offset) || 0)) + 1
                )}
                disabled={loading}
                className="flex items-center gap-1.5 text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 px-3.5 py-2 rounded-xl transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {t("teacher.wizard.addWeekSlot")}
              </button>
            </div>

            <AiStatusNote status={aiStatus} />
            <div className="space-y-3 pt-2">
              {modules.length === 0 ? (
                <div className="py-6 text-center text-caption text-fg-subtle">
                  {t("teacher.wizard.noModules")}
                </div>
              ) : (
                modules.map((m) => (
                  <div key={m.id} className="py-3 border-b border-line last:border-b-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-caption font-bold text-brand-fg">{weekLabelT(m, t)}</span>
                        <h4 className="text-ui font-bold text-fg">{m.title}</h4>
                      </div>

                      {aiStatus.allowed && m.kind !== "unassigned" ? (
                        <button
                          onClick={() => aiFillModule(m.id)}
                          disabled={aiStarting === `fill-${m.id}` || fillStarted[m.id]}
                          className="flex items-center gap-1 text-caption font-medium text-brand-fg bg-brand-soft border border-brand/40 hover:bg-brand-soft disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-brand-fg" /> {fillStarted[m.id] ? t("teacher.wizard.aiOnTheWay") : t("teacher.wizard.aiFillWeek")}
                        </button>
                      ) : null}
                    </div>
                    {fillStarted[m.id] ? (
                      <p role="status" className="text-caption text-fg-muted">
                        {t("teacher.wizard.startedBefore")}{" "}
                        <Link href={`/course/${courseId}/ai`} className="font-semibold text-brand-fg hover:underline">{t("teacher.wizard.aiDrafts")}</Link>
                        {" "}{t("teacher.wizard.startedAfter")}
                      </p>
                    ) : null}

                    <p className="text-caption text-fg-subtle">{fill(t("teacher.wizard.itemsInModule"), { count: (m.items || []).length })}</p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-caption font-semibold text-fg-muted">{t("teacher.wizard.back")}</button>
              <button
                onClick={() => setStep(5)}
                disabled={modules.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-strong text-on-brand-strong rounded-xl text-ui font-semibold hover:bg-brand-strong/90 transition-colors disabled:opacity-50"
              >
                {t("teacher.wizard.toSyllabus")} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Syllabus Preview & Open Course */}
        {step === 5 && (
          <div className="bg-surface rounded-xl p-4 md:p-6 border border-line space-y-4">
            <h2 className="text-section font-bold text-fg flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-fg" /> {t("teacher.wizard.step5Title")}
            </h2>
            <p className="text-caption text-fg-muted">
              {t("teacher.wizard.step5Help")}
            </p>

            <div className="pt-4 border-t border-line space-y-4">
              <div>
                <h3 className="text-item font-bold text-fg">{setupForm.title}</h3>
                <p className="text-caption text-fg-subtle">{fill(t("teacher.wizard.startsLine"), { date: formatDate(setupForm.startDate) || t("teacher.wizard.notSet"), weeks: setupForm.lengthWeeks })}</p>
              </div>

              <div>
                <h4 className="text-caption font-bold text-fg-subtle mb-1">{fill(t("teacher.wizard.outcomesCount"), { count: outcomes.length })}</h4>
                <ul className="list-disc list-inside text-caption text-fg-muted space-y-0.5">
                  {outcomes.map((o) => (
                    <li key={o.id}>{o.title}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-caption font-bold text-fg-subtle mb-1">{fill(t("teacher.wizard.timelineCount"), { count: modules.length })}</h4>
                <div className="space-y-1">
                  {modules.map((m) => (
                    <div key={m.id} className="text-caption text-fg-muted bg-surface p-2.5 rounded-lg border border-line flex justify-between">
                      <span className="font-semibold">{m.title}</span>
                      <span className="text-fg-subtle">{weekLabelT(m, t)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center">
              <button onClick={() => setStep(4)} className="px-4 py-2 text-caption font-semibold text-fg-muted">{t("teacher.wizard.back")}</button>
              <button
                onClick={openCourseFinal}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl text-ui font-bold hover:bg-brand/90 transition-colors shadow-sm"
              >
                {t("teacher.wizard.openLaunch")} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
