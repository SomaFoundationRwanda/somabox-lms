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
import { useProgressText, aiErrorText } from "@/components/progress/text";

// The latest AI class summary, and a button to write a new one. The model only ever sees
// outcome codes and numbers, never learners' names.
export default function AiClassSummary({ summary, learners, onDone }) {
  const { SERVER_URL, courseId } = useCourse();
  const { showToast } = useToast();
  const { tp, locale } = useProgressText();
  const aiStatus = useAiStatus();
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const { job: live, cancel, cancelling } = useAiJob(SERVER_URL, courseId, job?.id, {
    initial: job,
    onFinish: (j) => {
      setJob(null);
      if (j.status === "done") {
        showToast(tp("ai.summary.ready"), "success");
        onDone?.();
      } else if (j.status === "failed") {
        setError(j.error ? aiErrorText(tp, j.error) : tp("ai.summary.failed"));
      }
    },
  });

  const start = async () => {
    setError("");
    setStarting(true);
    const r = await startAiJob(SERVER_URL, courseId, { kind: "class_summary" });
    setStarting(false);
    if (!r.ok) {
      setError(r.data?.code === "AI_DISABLED" ? r.message || tp("ai.summary.disabled") : r.message);
      return;
    }
    setJob(r.data);
  };

  const suggestions = Array.isArray(summary?.suggestions) ? summary.suggestions : [];
  const canRun = aiStatus.allowed && !aiStatus.loading;

  return (
    <Section
      divided
      title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-info-fg" aria-hidden="true" /> {tp("ai.summary.title")}</span>}
      actions={canRun && !job ? (
        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="inline-flex items-center gap-1.5 text-caption font-semibold text-info-fg border border-info/30 hover:bg-info-soft disabled:opacity-50 px-3 py-1.5 rounded-lg"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          {starting ? tp("common.starting") : summary ? tp("ai.summary.writeNew") : tp("ai.summary.summarise")}
        </button>
      ) : null}
    >
      <div className="space-y-3">
        <AiStatusNote status={aiStatus} />
        {job ? <JobProgress job={live} label={tp("ai.summary.writing")} onCancel={cancel} cancelling={cancelling} /> : null}
        {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
        {aiStatus.allowed && !aiStatus.modelRunning ? (
          <p className="text-caption text-warning-fg">{tp("ai.summary.modelDown")}</p>
        ) : null}

        {summary ? (
          <div className="space-y-2 border-l-2 border-info/30 pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <AiDraftLabel text={tp("ai.summary.label")} />
              <span className="text-caption text-fg-subtle">
                {tp("ai.summary.made", { when: fmtWhen(summary.createdAt, locale) })}
                {summary.basedOn ? ` · ${basedOn(summary.basedOn.learnersWithData, summary.basedOn.learners, tp)}` : ""}
              </span>
            </div>
            {summary.summary ? <p className="text-ui text-fg whitespace-pre-line">{summary.summary}</p> : null}
            {suggestions.length > 0 ? (
              <div>
                <p className="text-caption font-semibold text-fg-muted">{tp("ai.summary.suggestions")}</p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5 text-ui text-fg-muted">
                  {suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : !job ? (
          <p className="text-caption text-fg-subtle">
            {learners?.learnersWithData ? tp("ai.summary.none") : tp("ai.summary.needsResults")}
          </p>
        ) : null}

        <p className="text-caption text-fg-subtle">
          {tp("ai.summary.privacy")}
        </p>
      </div>
    </Section>
  );
}
