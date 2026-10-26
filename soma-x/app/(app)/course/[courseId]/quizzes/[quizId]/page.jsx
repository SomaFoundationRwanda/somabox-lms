"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useParams } from "next/navigation";
import { Target, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, DataTable, EmptyState } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";
import { useCourseText } from "@/components/course/useCourseText";
import { useItemOpened } from "@/lib/usage";
import Loader from "@/components/ui/Loader";
import { ChoiceGroup, Textarea } from "@/components/form";

function getOptionText(opt) {
  if (opt === null || opt === undefined) return "";
  if (typeof opt === "object") return opt.text || opt.label || opt.id || "";
  return String(opt);
}

function getOptionId(opt, idx) {
  if (opt === null || opt === undefined) return String(idx);
  if (typeof opt === "object") return opt.id || opt.text || String(idx);
  return String(opt);
}

export default function QuizDetailPage() {
  const { courseId, quizId } = useParams();
  useItemOpened("quiz", quizId, courseId);
  const { SERVER_URL, userEmail, isTeacher, isObserver } = useCourse();
  const { t, tf, weekLabel, fmtDate, fmtDateTime } = useCourseText();
  const queryClient = useQueryClient();
  const ready = !!SERVER_URL && !!courseId && !!quizId && !!userEmail;
  const quizKey = queryKeys.courseSection(courseId, `quizzes/${quizId}`);
  const quizQuery = useQuery({ queryKey: quizKey, queryFn: () => apiFetch(`/courses/${courseId}/quizzes/${quizId}`), enabled: ready });
  const modulesQuery = useQuery({ queryKey: queryKeys.courseSection(courseId, "modules"), queryFn: () => apiFetch(`/courses/${courseId}/modules`), enabled: ready });
  const tagsQuery = useQuery({ queryKey: queryKeys.courseSection(courseId, "item-outcomes"), queryFn: () => apiFetch(`/courses/${courseId}/item-outcomes`), enabled: ready });
  const quiz = quizQuery.data || null;
  const modules = Array.isArray(modulesQuery.data) ? modulesQuery.data : [];
  const itemOutcomes = (Array.isArray(tagsQuery.data) ? tagsQuery.data : []).filter((tag) => tag.item_type === "quiz" && Number(tag.item_id) === Number(quizId));
  const loading = quizQuery.isPending;
  const reloadQuiz = () => queryClient.invalidateQueries({ queryKey: quizKey });
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [granting, setGranting] = useState(null);
  const { showToast } = useToast();

  const submitQuiz = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      try {
        setSubmitted(await apiFetch(`/courses/${courseId}/quizzes/${quizId}/submit`, { method: "POST", json: { answers } }));
        // A result changes the learner's grades, progress and what's left to do.
        for (const queryKey of [queryKeys.courseSection(courseId, "grades"), queryKeys.courseSection(courseId, "my-progress"), queryKeys.assignmentSummary, queryKeys.dashboard]) {
          queryClient.invalidateQueries({ queryKey });
        }
      } catch (err) {
        // 409 codes: NO_ATTEMPTS_LEFT, CLOSED, NOT_OPEN_YET each come with a readable message.
        const fallback = {
          NO_ATTEMPTS_LEFT: t("quiz.noAttemptsLeft"),
          CLOSED: t("quiz.closed"),
          NOT_OPEN_YET: t("quiz.notOpenYet"),
        }[err?.code];
        setSubmitError(err?.status === 0 ? getErrorMessage(err) : err?.body?.message || fallback || t("quiz.submitFailed"));
      }
      reloadQuiz();
    } finally {
      setSubmitting(false);
    }
  };

  const grantAttempt = async (sub) => {
    const reason = window.prompt(tf("quiz.grantPrompt", { name: sub.fullName || sub.scholar_email }), "");
    if (reason === null) return;
    setGranting(sub.scholar_email);
    try {
      const payload = await apiFetch(`/courses/${courseId}/quizzes/${quizId}/grant-attempt`, {
        method: "POST",
        json: { scholarEmail: sub.scholar_email, extra: 1, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      showToast(payload?.message || t("quiz.granted"), "success");
      reloadQuiz();
    } catch (err) {
      showToast(err?.status === 0 ? getErrorMessage(err) : err?.body?.message || t("quiz.grantFailed"), "error");
    } finally {
      setGranting(null);
    }
  };

  if (loading) return <Loader variant="page" label={t("quiz.loading")} />;
  if (!quiz) return <div className="p-6"><p className="text-sm text-rose-600">{t("quiz.notFound")}</p></div>;

  const currentModule = quiz.module || modules.find(m => m.id === quiz.module_id) || null;
  const attemptsAllowed = quiz.attempts_allowed ?? null;
  const attemptsUsed = Number(quiz.attemptsUsed || 0);
  const noAttemptsLeft = quiz.attemptsRemaining === 0;
  const canGrant = attemptsAllowed != null && quiz.kind !== "baseline";
  const results = Array.isArray(quiz.submissions) ? quiz.submissions : [];

  return (
    <div>
      <Breadcrumbs sectionKey="quizzes" itemName={quiz.title} />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        {/* Header: flat band, not a card */}
        <PageHeader help="items.quiz"
          title={quiz.title}
          description={quiz.description || undefined}
          meta={
            <>
            <span className="text-xs font-bold text-[var(--brand-secondary)] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
              {tf("assignment.module", { module: currentModule ? `${weekLabel(currentModule)} - ${currentModule.title}` : t("assignment.notInModule") })}
            </span>
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> {quiz.due_at ? tf("common.dueOn", { date: fmtDate(quiz.due_at, { weekday: "short", day: "numeric", month: "short" }) }) : t("common.noDueDate")}
            </span>
            </>
          }
        >
          {/* Outcome Tags */}
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-[var(--brand-secondary)]" /> {t("quiz.targetOutcomes")}
            </span>
            {itemOutcomes.length === 0 && quiz.kind === "practice" ? (
              <span className="text-xs text-slate-400">{t("quiz.practiceNotGraded")}</span>
            ) : itemOutcomes.length === 0 ? (
              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                ⚠️ {isTeacher ? t("quiz.missingOutcomeHint") : t("modules.missingOutcome")}
              </span>
            ) : (
              itemOutcomes.map((t) => (
                <span key={t.outcome_id} className="text-xs font-bold text-[var(--brand-secondary)] bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  {t.outcome_code}: {t.outcome_title}
                </span>
              ))
            )}
          </div>
        </PageHeader>

        {submitted !== null ? (
          <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900 space-y-1">
            <p className="font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[var(--brand-secondary)]" />
              {tf("quiz.submittedScore", { n: submitted.score })}{submitted.scorePct != null ? ` (${submitted.scorePct}%)` : ""}
            </p>
            <p className="text-xs">
              {tf("quiz.attemptN", { n: submitted.attemptNumber })}
              {submitted.attemptsRemaining != null ? ` · ${tf(submitted.attemptsRemaining === 1 ? "quiz.oneLeft" : "quiz.manyLeft", { n: submitted.attemptsRemaining })}` : ""}
            </p>
            {submitted.late ? (
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {t("assignment.submittedLate")}</p>
            ) : null}
          </div>
        ) : null}

        {isTeacher ? (
          <Section
            title={t("quiz.results")}
            description={attemptsAllowed == null
              ? t("quiz.resultsUnlimited")
              : tf(attemptsAllowed === 1 ? "quiz.resultsOneAllowed" : "quiz.resultsManyAllowed", { n: attemptsAllowed })}
          >
            {results.length === 0 ? (
              <EmptyState compact title={t("quiz.noAttempts")} />
            ) : (
              <DataTable
                caption={t("quiz.latestAttempts")}
                rows={results}
                rowKey={(r) => r.scholar_email}
                columns={[
                  { key: "fullName", header: t("quiz.learner"), className: "font-medium text-slate-800 dark:text-slate-100", render: (r) => r.fullName || r.scholar_email },
                  {
                    key: "score",
                    header: t("quiz.score"),
                    align: "right",
                    className: "whitespace-nowrap",
                    render: (r) => (
                      <span className="font-semibold">{r.score_pct != null ? `${r.score_pct}%` : r.score != null ? tf("common.points", { n: r.score }) : "—"}</span>
                    ),
                  },
                  { key: "attempt", header: t("quiz.attempt"), align: "center", render: (r) => r.attempt_number ?? "—" },
                  {
                    key: "date",
                    header: t("quiz.submittedCol"),
                    hideOnMobile: true,
                    className: "whitespace-nowrap text-slate-500",
                    render: (r) => (r.submitted_at ? fmtDateTime(r.submitted_at) : "—"),
                  },
                  ...(canGrant ? [{
                    key: "actions",
                    header: <span className="sr-only">{t("quiz.actions")}</span>,
                    align: "right",
                    render: (r) => (
                      <button
                        type="button"
                        onClick={() => grantAttempt(r)}
                        disabled={granting === r.scholar_email}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-secondary)] hover:underline disabled:opacity-50 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        {granting === r.scholar_email ? t("quiz.granting") : t("quiz.allowAnother")}
                      </button>
                    ),
                  }] : []),
                ]}
              />
            )}
          </Section>
        ) : null}

        {/* QUESTIONS LIST (FOR STUDENT TAKING OR TEACHER PREVIEW) */}
        <Section title={tf("editors.quiz.questionsCount", { n: (quiz.questions || []).length })}>
          <ol className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
          {(quiz.questions || []).map((q, idx) => (
            <li key={q.id || idx} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {tf("editors.quiz.questionN", { n: idx + 1 })}: {q.prompt}
                </h3>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full shrink-0">
                  {tf("common.points", { n: q.points })}
                </span>
              </div>

              {q.question_type === "multiple_choice" ? (
                <ChoiceGroup
                  layout="list"
                  aria-label={tf("quiz.optionsFor", { n: idx + 1 })}
                  // A saved answer may be the option's id or its text: either one shows as chosen.
                  value={(Array.isArray(q.options) ? q.options : []).reduce((chosen, opt, i) => {
                    const id = getOptionId(opt, i);
                    return id && chosen === getOptionText(opt) ? id : chosen;
                  }, answers[q.id])}
                  onChange={(value) => setAnswers((p) => ({ ...p, [q.id]: value }))}
                  // An answer is kept as the option's id, or its text for options without one.
                  options={(Array.isArray(q.options) ? q.options : []).map((opt, i) => {
                    const text = getOptionText(opt);
                    const id = getOptionId(opt, i);
                    return { value: id || text, label: text };
                  })}
                />
              ) : (
                <Textarea value={answers[q.id] || ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} rows={3} placeholder={t("quiz.openAnswerPlaceholder")} aria-label={tf("quiz.answerTo", { n: idx + 1 })} className="w-full" />
              )}
            </li>
          ))}
          </ol>

          {isObserver && (
            <p className="pt-4 text-sm text-slate-500 dark:text-slate-400">{t("quiz.observerNote")}</p>
          )}
          {!isTeacher && !isObserver && (
            <div className="pt-4 flex flex-col items-end gap-2">
              <span className="text-xs font-semibold text-slate-500">
                {attemptsAllowed == null
                  ? t("quiz.unlimitedAttempts")
                  : noAttemptsLeft
                  ? tf("quiz.allUsed", { n: attemptsAllowed })
                  : tf("quiz.attemptOf", { n: attemptsUsed + 1, total: attemptsAllowed })}
              </span>
              {noAttemptsLeft && (
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                  {t("quiz.noAttemptsLeft")}
                </p>
              )}
              {submitError && <p role="alert" className="text-xs font-semibold text-rose-600">{submitError}</p>}
              <button
                onClick={submitQuiz}
                disabled={noAttemptsLeft || submitting}
                className="px-6 py-2.5 bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] disabled:opacity-50 disabled:hover:bg-[var(--brand-secondary)] text-white font-bold text-xs rounded-lg transition-colors"
              >
                {submitting ? t("assignment.submitting") : t("quiz.submit")}
              </button>
            </div>
          )}
        </Section>

        <PrevNextNav courseId={courseId} itemType="quiz" contentId={quizId} />
      </div>
    </div>
  );
}
