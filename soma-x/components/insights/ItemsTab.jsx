"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { DataTable, Section, List, EmptyState } from "@/components/layout";
import { formatDate } from "@/lib/dates";
import { useProgressText, weekLabel } from "@/components/progress/text";
import { fmtPct, itemHref, itemType, LoadingRows, ErrorNote } from "./bits";

const LOW_CORRECT_PCT = 40;
const MIN_ANSWERED = 3;

function QuizAnalysis({ quizId, title, onClose }) {
  const { tp, tpn } = useProgressText();
  const query = useCourseSection(`insights/quizzes/${quizId}`);
  const data = query.data;
  const loading = query.loading;
  const error = query.error ? query.error || tp("insights.items.loadFailed") : "";
  const load = query.refetch;
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [quizId]);

  const questions = Array.isArray(data?.questions) ? data.questions : [];

  return (
    <Section
      divided
      title={<span ref={headingRef} tabIndex={-1} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">{tp("insights.items.analysisTitle", { title: data?.quiz?.title || title })}</span>}
      description={data ? tpn("insights.items.latestAttempt", data.learnersAnswered) : undefined}
      actions={
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 text-caption font-semibold text-fg-subtle hover:text-fg px-2 py-1">
          <X className="w-3.5 h-3.5" aria-hidden="true" /> {tp("common.close")}
        </button>
      }
    >
      {loading && !data ? (
        <LoadingRows />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : questions.length === 0 ? (
        <EmptyState compact title={tp("insights.items.noQuestions")} />
      ) : (
        <List label={tp("insights.items.questions")}>
          {questions.map((q, idx) => {
            const low = q.pctCorrect != null && q.answered >= MIN_ANSWERED && q.pctCorrect < LOW_CORRECT_PCT;
            const maxChosen = Math.max(1, ...q.options.map((o) => o.chosen || 0));
            return (
              <li key={q.id} className={`px-3 py-3 text-ui space-y-2 ${low ? "bg-warning-soft/60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-medium text-fg">
                    <span className="mr-1.5 text-caption font-bold text-fg-subtle">{tp("insights.items.qNumber", { n: q.position ?? idx + 1 })}</span>
                    {q.prompt}
                  </p>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-fg">
                      {q.pctCorrect == null ? (q.type === "multiple_choice" ? tp("insights.items.noAnswers") : tp("insights.items.notAutoMarked")) : tp("insights.items.pctCorrect", { pct: fmtPct(q.pctCorrect) })}
                    </span>
                    <span className="block text-caption text-fg-subtle">{tp("insights.items.answered", { n: q.answered })}</span>
                  </span>
                </div>
                {low ? (
                  <p className="inline-flex items-center gap-1 text-caption font-semibold text-warning-fg">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> {tp("insights.items.manyWrong")}
                  </p>
                ) : null}
                {q.options.length > 0 ? (
                  <ul className="space-y-1" aria-label={tp("insights.items.optionsFor", { n: q.position ?? idx + 1 })}>
                    {q.options.map((o) => (
                      <li key={String(o.id)} className="flex items-center gap-2 text-caption">
                        <span className="w-4 shrink-0">
                          {o.correct ? <CheckCircle2 className="w-4 h-4 text-success-fg" aria-label={tp("insights.items.correctAnswer")} /> : null}
                        </span>
                        <span className={`min-w-0 flex-1 truncate ${o.correct ? "font-semibold text-success-fg" : "text-fg-muted"}`}>{o.text}</span>
                        <span className="hidden sm:block h-2 w-24 shrink-0 rounded-full bg-surface-sunken overflow-hidden" aria-hidden="true">
                          <span className={`block h-full ${o.correct ? "bg-success" : "bg-line-strong"}`} style={{ width: `${((o.chosen || 0) / maxChosen) * 100}%` }} />
                        </span>
                        <span className="w-16 shrink-0 text-right text-fg-muted">{tp("insights.items.chose", { n: o.chosen })}</span>
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
  const { tp } = useProgressText();
  const items = Array.isArray(data.items) ? data.items : [];
  const [quiz, setQuiz] = useState(null); // { id, title }

  return (
    <div className="space-y-6">
      <DataTable
        caption={tp("insights.items.caption")}
        rows={items}
        rowKey={(i) => i.moduleItemId}
        empty={tp("insights.noGradedWork")}
        columns={[
          {
            key: "title",
            header: tp("common.item"),
            className: "min-w-[12rem]",
            render: (i) => {
              const href = itemHref(courseId, i);
              return href ? (
                <Link href={href} className="font-medium text-fg hover:text-brand-fg hover:underline">{i.title}</Link>
              ) : <span className="font-medium">{i.title}</span>;
            },
          },
          { key: "type", header: tp("common.type"), render: (i) => <span className="text-caption text-fg-muted">{itemType(tp, i.type) || i.type}</span> },
          { key: "week", header: tp("common.weekHeader"), className: "whitespace-nowrap text-caption text-fg-muted", render: (i) => (i.module ? weekLabel(tp, i.module) : "—") },
          { key: "due", header: tp("common.due"), className: "whitespace-nowrap text-caption text-fg-muted", render: (i) => (i.dueDate ? formatDate(i.dueDate) : tp("common.noDueDate")) },
          { key: "handedIn", header: tp("insights.items.handedIn"), align: "right", className: "whitespace-nowrap", render: (i) => tp("common.nOfTotal", { n: i.handedIn ?? 0, total: i.learners ?? 0 }) },
          { key: "late", header: tp("common.late"), align: "right", render: (i) => i.late ?? "—" },
          { key: "missing", header: tp("common.missing"), align: "right", render: (i) => <span className={i.missing ? "font-semibold text-danger-fg" : ""}>{i.missing ?? "—"}</span> },
          {
            key: "avg",
            header: tp("common.average"),
            align: "right",
            render: (i) => (i.averagePct == null ? <span className="text-caption text-fg-subtle whitespace-nowrap">{tp("common.noResultsYet")}</span> : (
              <span className="whitespace-nowrap">
                <span className="font-semibold">{fmtPct(i.averagePct)}</span>
                <span className="block text-caption text-fg-subtle">{tp("insights.items.marked", { n: i.graded ?? 0 })}</span>
              </span>
            )),
          },
          {
            key: "analysis",
            header: <span className="sr-only">{tp("insights.items.analysis")}</span>,
            align: "right",
            render: (i) => (i.type === "quiz" ? (
              <button
                type="button"
                onClick={() => setQuiz({ id: i.contentId, title: i.title })}
                aria-pressed={quiz?.id === i.contentId}
                className="text-caption font-semibold text-brand-fg hover:underline whitespace-nowrap"
              >
                {tp("insights.items.analysis")}
              </button>
            ) : null),
          },
        ]}
      />
      {quiz ? <QuizAnalysis key={quiz.id} quizId={quiz.id} title={quiz.title} onClose={() => setQuiz(null)} /> : null}
    </div>
  );
}
