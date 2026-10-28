"use client";

import { Sparkles, AlertTriangle, X, Loader2 } from "lucide-react";
import { isActiveJob } from "@/lib/ai";
import { useProgressText, jobKindLabel, jobStatus } from "@/components/progress/text";

/** "AI draft — review before using" label. */
export function AiDraftLabel({ text, className = "" }) {
  const { tp } = useProgressText();
  return (
    <span className={`inline-flex items-center gap-1 text-caption font-bold text-info-fg bg-info-soft border border-info/30 rounded-full px-2 py-0.5 ${className}`}>
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
      <p className={`flex items-start gap-1.5 text-caption text-fg-subtle ${className}`}>
        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{tp("ai.offPrefix")} {status.reason || tp("ai.notAvailable")}</span>
      </p>
    );
  }
  if (!status.modelRunning) {
    return (
      <p role="status" className={`flex items-start gap-1.5 text-caption text-warning-fg ${className}`}>
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{tp("ai.modelDown")}</span>
      </p>
    );
  }
  return null;
}

/**
 * Stands in for an AI button when AI is off for this user or school, so teachers can see the
 * feature exists and why it's unavailable (the reason is in the tooltip and for screen readers).
 * Renders nothing while the status loads or when AI is allowed.
 */
export function AiOffBadge({ status, className = "" }) {
  const { tp } = useProgressText();
  if (!status || status.loading || status.allowed) return null;
  const reason = status.reason || tp("ai.notAvailable");
  return (
    <span className={`inline-flex items-center gap-1 text-caption font-semibold text-fg-subtle ${className}`} title={reason}>
      <Sparkles className="w-3 h-3" aria-hidden="true" />{tp("ai.offShort")}
      <span className="sr-only">: {reason}</span>
    </span>
  );
}

/** A job's progress: label, bar, queue position, Cancel. Not a card: a plain block. */
export function JobProgress({ job, label, onCancel, cancelling, onDismiss, className = "" }) {
  const { tp } = useProgressText();
  if (!job) {
    return (
      <p role="status" className={`flex items-center gap-2 text-caption text-fg-subtle ${className}`}>
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
          <p className="text-ui font-semibold text-fg">{label || jobKindLabel(tp, job.kind)}</p>
          <p role="status" className={`text-caption ${failed ? "text-danger-fg" : "text-fg-subtle"}`}>
            {active ? <Loader2 className="inline w-3 h-3 mr-1 animate-spin align-[-2px]" aria-hidden="true" /> : null}
            {jobStatus(tp, job)}
            {active ? tp("ai.takesMinutes") : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {active && onCancel ? (
            <button type="button" onClick={onCancel} disabled={cancelling} className="text-caption font-semibold text-fg-muted border border-line hover:bg-surface-hover disabled:opacity-50 px-3 py-1.5 rounded-lg">
              {cancelling ? tp("ai.cancelling") : tp("common.cancel")}
            </button>
          ) : null}
          {!active && onDismiss ? (
            <button type="button" onClick={onDismiss} aria-label={tp("ai.hideThis")} className="p-1.5 rounded-md text-fg-subtle hover:text-fg-muted hover:bg-surface-hover">
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
          className="h-1.5 w-full rounded-full bg-line overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all ${job.status === "queued" ? "bg-line-strong w-1/12 animate-pulse" : "bg-brand"}`}
            style={job.status === "queued" ? undefined : { width: `${Math.max(pct, 5)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
