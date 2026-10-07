"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { DataTable, Section, List, EmptyState } from "@/components/layout";
import { moduleWeekLabel } from "@/lib/moduleLabels";
import { formatDate } from "@/lib/dates";
import { fmtPct, itemHref, ITEM_TYPE_LABELS, LoadingRows, ErrorNote } from "./bits";

const LOW_CORRECT_PCT = 40;
const MIN_ANSWERED = 3;

function QuizAnalysis({ quizId, title, onClose }) {
  const { SERVER_URL, courseId } = useCourse();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const headingRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/insights/quizzes/${quizId}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't load the question analysis.");
      setData(payload);
    } catch (err) {
      setError(err.message || "Couldn't load the question analysis.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const questions = Array.isArray(data?.questions) ? data.questions : [];

  return (
    <Section
      divided
      title={<span ref={headingRef} tabIndex={-1} className="focus:outline-none">Question analysis: {data?.quiz?.title || title}</span>}
      description={data ? `Each learner's latest attempt. ${data.learnersAnswered} learner${data.learnersAnswered === 1 ? "" : "s"} answered.` : undefined}
      actions={
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1">
          <X className="w-3.5 h-3.5" aria-hidden="true" /> Close
        </button>
      }
    >
      {loading && !data ? (
        <LoadingRows />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : questions.length === 0 ? (
        <EmptyState compact title="This quiz has no questions." />
      ) : (
        <List label="Questions">
          {questions.map((q, idx) => {
            const low = q.pctCorrect != null && q.answered >= MIN_ANSWERED && q.pctCorrect < LOW_CORRECT_PCT;
            const maxChosen = Math.max(1, ...q.options.map((o) => o.chosen || 0));
            return (
              <li key={q.id} className={`px-3 py-3 text-sm space-y-2 ${low ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-medium text-slate-900 dark:text-white">
                    <span className="mr-1.5 text-xs font-bold text-slate-400">Q{q.position ?? idx + 1}</span>
                    {q.prompt}
                  </p>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">
                      {q.pctCorrect == null ? (q.type === "multiple_choice" ? "No answers yet" : "Not auto-marked") : `${fmtPct(q.pctCorrect)} correct`}
                    </span>
                    <span className="block text-[11px] text-slate-500">{q.answered} answered</span>
                  </span>
                </div>
                {low ? (
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Many learners got this wrong
                  </p>
                ) : null}
                {q.options.length > 0 ? (
                  <ul className="space-y-1" aria-label={`Options for question ${q.position ?? idx + 1}`}>
                    {q.options.map((o) => (
                      <li key={String(o.id)} className="flex items-center gap-2 text-xs">
                        <span className="w-4 shrink-0">
                          {o.correct ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Correct answer" /> : null}
                        </span>
                        <span className={`min-w-0 flex-1 truncate ${o.correct ? "font-semibold text-emerald-800 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}`}>{o.text}</span>
                        <span className="hidden sm:block h-2 w-24 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" aria-hidden="true">
                          <span className={`block h-full ${o.correct ? "bg-emerald-500" : "bg-slate-400"}`} style={{ width: `${((o.chosen || 0) / maxChosen) * 100}%` }} />
                        </span>
                        <span className="w-16 shrink-0 text-right text-slate-600 dark:text-slate-300">{o.chosen} chose</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </List>
      )}
    </Section>
  );
}

export default function ItemsTab({ data }) {
  const { courseId } = useCourse();
  const items = Array.isArray(data.items) ? data.items : [];
  const [quiz, setQuiz] = useState(null); // { id, title }

  return (
    <div className="space-y-6">
      <DataTable
        caption="Graded items"
        rows={items}
        rowKey={(i) => i.moduleItemId}
        empty="No published graded work yet."
        columns={[
          {
            key: "title",
            header: "Item",
            className: "min-w-[12rem]",
            render: (i) => {
              const href = itemHref(courseId, i);
              return href ? (
                <Link href={href} className="font-medium text-slate-800 dark:text-slate-100 hover:text-[#0D9488] hover:underline">{i.title}</Link>
              ) : <span className="font-medium">{i.title}</span>;
            },
          },
          { key: "type", header: "Type", render: (i) => <span className="text-xs text-slate-600 dark:text-slate-300">{ITEM_TYPE_LABELS[i.type] || i.type}</span> },
          { key: "week", header: "Week", className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300", render: (i) => (i.module ? moduleWeekLabel(i.module) : "—") },
          { key: "due", header: "Due", className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300", render: (i) => (i.dueDate ? formatDate(i.dueDate) : "No due date") },
          { key: "handedIn", header: "Handed in", align: "right", className: "whitespace-nowrap", render: (i) => `${i.handedIn ?? 0} of ${i.learners ?? 0}` },
          { key: "late", header: "Late", align: "right", render: (i) => i.late ?? "—" },
          { key: "missing", header: "Missing", align: "right", render: (i) => <span className={i.missing ? "font-semibold text-rose-700 dark:text-rose-400" : ""}>{i.missing ?? "—"}</span> },
          {
            key: "avg",
            header: "Average",
            align: "right",
            render: (i) => (i.averagePct == null ? <span className="text-xs text-slate-400 whitespace-nowrap">No results yet</span> : (
              <span className="whitespace-nowrap">
                <span className="font-semibold">{fmtPct(i.averagePct)}</span>
                <span className="block text-[10px] text-slate-500">{i.graded ?? 0} marked</span>
              </span>
            )),
          },
          {
            key: "analysis",
            header: <span className="sr-only">Question analysis</span>,
            align: "right",
            render: (i) => (i.type === "quiz" ? (
              <button
                type="button"
                onClick={() => setQuiz({ id: i.contentId, title: i.title })}
                aria-pressed={quiz?.id === i.contentId}
                className="text-xs font-semibold text-[#0D9488] hover:underline whitespace-nowrap"
              >
                Question analysis
              </button>
            ) : null),
          },
        ]}
      />
      {quiz ? <QuizAnalysis key={quiz.id} quizId={quiz.id} title={quiz.title} onClose={() => setQuiz(null)} /> : null}
    </div>
  );
}
