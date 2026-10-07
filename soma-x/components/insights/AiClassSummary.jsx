"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob, useAiJob } from "@/lib/ai";
import { AiDraftLabel, AiStatusNote, JobProgress } from "@/components/ai/AiBits";
import { Section } from "@/components/layout";
import { basedOn, fmtWhen } from "./bits";

// The latest AI class summary, and a button to write a new one. The model only ever sees
// outcome codes and numbers, never learners' names.
export default function AiClassSummary({ summary, learners, onDone }) {
  const { SERVER_URL, courseId } = useCourse();
  const { showToast } = useToast();
  const aiStatus = useAiStatus();
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const { job: live, cancel, cancelling } = useAiJob(SERVER_URL, courseId, job?.id, {
    initial: job,
    onFinish: (j) => {
      setJob(null);
      if (j.status === "done") {
        showToast("AI summary ready", "success");
        onDone?.();
      } else if (j.status === "failed") {
        setError(j.error || "The AI couldn't write a summary. Try again.");
      }
    },
  });

  const start = async () => {
    setError("");
    setStarting(true);
    const r = await startAiJob(SERVER_URL, courseId, { kind: "class_summary" });
    setStarting(false);
    if (!r.ok) {
      setError(r.data?.code === "AI_DISABLED" ? r.message || "AI help is turned off for your account." : r.message);
      return;
    }
    setJob(r.data);
  };

  const suggestions = Array.isArray(summary?.suggestions) ? summary.suggestions : [];
  const canRun = aiStatus.allowed && !aiStatus.loading;

  return (
    <Section
      divided
      title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-600" aria-hidden="true" /> AI summary</span>}
      actions={canRun && !job ? (
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 px-3 py-1.5 rounded-lg"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          {starting ? "Starting…" : summary ? "Write a new summary" : "Summarise the class with AI"}
        </button>
      ) : null}
    >
      <div className="space-y-3">
        <AiStatusNote status={aiStatus} />
        {job ? <JobProgress job={live} label="Writing the class summary" onCancel={cancel} cancelling={cancelling} /> : null}
        {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
        {aiStatus.allowed && !aiStatus.modelRunning ? (
          <p className="text-[11px] text-amber-800 dark:text-amber-300">The AI model isn&apos;t running on this box, so a new summary will fail until it&apos;s started.</p>
        ) : null}

        {summary ? (
          <div className="space-y-2 border-l-2 border-violet-200 dark:border-violet-800 pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <AiDraftLabel text="AI summary — check it against the numbers below" />
              <span className="text-[11px] text-slate-500">
                Made {fmtWhen(summary.createdAt)}
                {summary.basedOn ? ` · ${basedOn(summary.basedOn.learnersWithData, summary.basedOn.learners)}` : ""}
              </span>
            </div>
            {summary.summary ? <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-line">{summary.summary}</p> : null}
            {suggestions.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Suggestions</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
                  {suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : !job ? (
          <p className="text-xs text-slate-500">
            {learners?.learnersWithData ? "No AI summary yet." : "An AI summary needs some results first."}
          </p>
        ) : null}

        <p className="text-[11px] text-slate-500">
          Only outcome codes and class numbers are sent to the AI, never learners&apos; names.
        </p>
      </div>
    </Section>
  );
}
