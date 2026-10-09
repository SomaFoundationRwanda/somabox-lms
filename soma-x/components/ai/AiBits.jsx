"use client";

import { Sparkles, AlertTriangle, X, Loader2 } from "lucide-react";
import { isActiveJob } from "@/lib/ai";
import { useProgressText, jobKindLabel, jobStatus } from "@/components/progress/text";

/** "AI draft — review before using" label. */
export function AiDraftLabel({ text, className = "" }) {
  const { tp } = useProgressText();
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold text-violet-800 bg-violet-50 border border-violet-200 dark:text-violet-200 dark:bg-violet-950/40 dark:border-violet-800 rounded-full px-2 py-0.5 ${className}`}>
      <Sparkles className="w-3 h-3" aria-hidden="true" /> {text || tp("ai.draftLabel")}
    </span>
  );
}

/**
 * Inline note about AI availability: why it's off (reason) or that the model isn't running.
 * Renders nothing when AI is allowed and the model is up.
 */
export function AiStatusNote({ status, className = "" }) {
  const { tp } = useProgressText();
  if (!status || status.loading) return null;
  if (!status.allowed) {
    return (
      <p className={`flex items-start gap-1.5 text-xs text-slate-500 ${className}`}>
        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{tp("ai.offPrefix")} {status.reason || tp("ai.notAvailable")}</span>
      </p>
    );
  }
  if (!status.modelRunning) {
    return (
      <p role="status" className={`flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300 ${className}`}>
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{tp("ai.modelDown")}</span>
      </p>
    );
  }
  return null;
}

/** A job's progress: label, bar, queue position, Cancel. Not a card: a plain block. */
export function JobProgress({ job, label, onCancel, cancelling, onDismiss, className = "" }) {
  const { tp } = useProgressText();
  if (!job) {
    return (
      <p role="status" className={`flex items-center gap-2 text-xs text-slate-500 ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> {tp("common.starting")}
      </p>
    );
  }
  const active = isActiveJob(job);
  const total = Math.max(1, Number(job.total) || 1);
  const done = Math.min(total, Number(job.progress) || 0);
  const pct = job.status === "done" ? 100 : Math.round((done / total) * 100);
  const failed = job.status === "failed";
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label || jobKindLabel(tp, job.kind)}</p>
          <p role="status" className={`text-xs ${failed ? "text-rose-600" : "text-slate-500"}`}>
            {active ? <Loader2 className="inline w-3 h-3 mr-1 animate-spin align-[-2px]" aria-hidden="true" /> : null}
            {jobStatus(tp, job)}
            {active ? tp("ai.takesMinutes") : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {active && onCancel ? (
            <button type="button" onClick={onCancel} disabled={cancelling} className="text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 rounded-lg">
              {cancelling ? tp("ai.cancelling") : tp("common.cancel")}
            </button>
          ) : null}
          {!active && onDismiss ? (
            <button type="button" onClick={onDismiss} aria-label={tp("ai.hideThis")} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
      {active || job.status === "done" ? (
        <div
          role="progressbar"
          aria-label={tp("ai.progressAria", { label: label || jobKindLabel(tp, job.kind) || tp("ai.aiJob") })}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={job.status === "done" ? total : done}
          className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all ${job.status === "queued" ? "bg-slate-400 w-1/12 animate-pulse" : "bg-[var(--brand-secondary)]"}`}
            style={job.status === "queued" ? undefined : { width: `${Math.max(pct, 5)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
