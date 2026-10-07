"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { aiFetch, useAiJob, JOB_KIND_LABELS } from "@/lib/ai";
import { JobProgress } from "./AiBits";
import DraftCard, { ApprovedNote } from "./DraftCard";

/**
 * Follows one AI job inline (setup wizard, outcomes, rubric): progress + Cancel while it runs,
 * then its drafts as review cards with Add to course / Reject.
 *
 * onApproved(draft, result) after a draft is added; onClose() hides the panel.
 */
export default function AiJobPanel({ SERVER_URL, courseId, job: initialJob, label, outcomes: outcomesProp, modules, confirmApprove, onApproved, onClose }) {
  const [drafts, setDrafts] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [outcomes, setOutcomes] = useState(outcomesProp || null);
  const [decided, setDecided] = useState({}); // draftId -> { status, message }

  const loadDrafts = async (job) => {
    if (job.status !== "done") return;
    const results = await Promise.all((job.drafts || []).map((d) => aiFetch(`${SERVER_URL}/courses/${courseId}/ai/drafts/${d.id}`)));
    const failed = results.find((r) => !r.ok);
    if (failed) setLoadError(failed.message);
    setDrafts(results.filter((r) => r.ok).map((r) => r.data));
    if (!outcomesProp) {
      const o = await aiFetch(`${SERVER_URL}/courses/${courseId}/outcomes`);
      if (o.ok && Array.isArray(o.data)) setOutcomes(o.data);
    }
  };

  const { job, error, cancel, cancelling } = useAiJob(SERVER_URL, courseId, initialJob?.id, { initial: initialJob, onFinish: loadDrafts });

  useEffect(() => { if (outcomesProp) setOutcomes(outcomesProp); }, [outcomesProp]);

  const finished = job && !["queued", "running"].includes(job.status);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-start justify-between gap-2">
        <JobProgress
          className="flex-1"
          job={job}
          label={label || JOB_KIND_LABELS[initialJob?.kind]}
          onCancel={cancel}
          cancelling={cancelling}
        />
        {finished && onClose ? (
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
      {loadError ? <p role="alert" className="text-xs text-rose-600">{loadError}</p> : null}

      {job?.status === "done" && drafts && drafts.length === 0 ? (
        <p className="text-xs text-slate-500">The AI didn&apos;t produce a draft. Try again with more detail.</p>
      ) : null}

      {(drafts || []).map((d) => {
        const decision = decided[d.id] || (d.status !== "pending" ? { status: d.status } : null);
        if (decision?.status === "approved") {
          return <ApprovedNote key={d.id} draft={{ ...d, ...decision.draft }} courseId={courseId} message={decision.message} />;
        }
        if (decision?.status === "rejected") {
          return <p key={d.id} className="text-xs text-slate-500">Draft rejected. Nothing was added.</p>;
        }
        return (
          <DraftCard
            key={d.id}
            draft={d}
            SERVER_URL={SERVER_URL}
            courseId={courseId}
            modules={modules}
            outcomes={outcomes || []}
            confirmApprove={confirmApprove}
            onUpdated={(next) => setDrafts((list) => list.map((x) => (x.id === next.id ? next : x)))}
            onDecided={(next, result) => {
              setDecided((m) => ({ ...m, [d.id]: { ...result, draft: next } }));
              if (result.status === "approved") onApproved?.(next, result);
            }}
          />
        );
      })}

      {job?.status === "done" && drafts?.length ? (
        <p className="text-[11px] text-slate-500">
          Drafts also wait in <Link href={`/course/${courseId}/ai`} className="font-semibold text-[#0D9488] hover:underline">AI drafts</Link> if you want to decide later.
        </p>
      ) : null}
    </div>
  );
}
