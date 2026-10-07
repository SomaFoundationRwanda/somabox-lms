"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { moduleWeekLabel } from "@/lib/moduleLabels";
import { DRAFT_TYPE_LABELS, approveDraft, rejectDraft, saveDraftPayload, draftResultLink } from "@/lib/ai";
import { AiDraftLabel } from "./AiBits";
import DraftPreview from "./DraftPreview";
import DraftEditor from "./DraftEditor";

const TYPE_TONES = {
  page: "text-sky-800 bg-sky-50 border-sky-200",
  quiz: "text-indigo-800 bg-indigo-50 border-indigo-200",
  assignment: "text-amber-800 bg-amber-50 border-amber-200",
  story: "text-rose-800 bg-rose-50 border-rose-200",
  outline: "text-teal-800 bg-teal-50 border-teal-200",
  outcome: "text-teal-800 bg-teal-50 border-teal-200",
  rubric: "text-slate-800 bg-slate-50 border-slate-200",
};

const APPROVE_NOTE = {
  page: "Creates an unpublished page in this week.",
  quiz: "Creates an unpublished quiz in this week.",
  assignment: "Creates an unpublished assignment (with its rubric) in this week.",
  story: "Creates an unpublished page, quiz and discussion in this week.",
  outline: "Creates these outcomes and new unpublished weeks.",
  outcome: "Adds this outcome to the course.",
  rubric: "Saves this as the assignment's rubric.",
};

/**
 * One pending AI draft for review: type badge, AI label, target week, readable preview, and
 * Edit / Add to course / Reject. An AI draft review item is allowed to be a card.
 *
 * onDecided(draft, { status, message, resultRefs }) after approve/reject; onUpdated(draft) after edit.
 * confirmApprove(draft) → string|null: a confirm question shown before approving.
 */
export default function DraftCard({ draft, SERVER_URL, courseId, modules, outcomes, onDecided, onUpdated, confirmApprove, headingLevel = 3 }) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const module = draft.moduleId ? (modules || []).find((m) => Number(m.id) === Number(draft.moduleId)) : null;
  const Heading = `h${headingLevel}`;
  const pending = draft.status === "pending";

  const save = async (payload) => {
    setBusy("save");
    setError("");
    const r = await saveDraftPayload(SERVER_URL, courseId, draft.id, payload);
    setBusy("");
    if (!r.ok) { setError(r.message); return; }
    setEditing(false);
    showToast("Draft updated", "success");
    onUpdated?.(r.data);
  };

  const approve = async () => {
    let question = null;
    if (confirmApprove) question = confirmApprove(draft);
    else if (draft.type === "outcome" && draft.payload?.outcomeId) question = "This replaces the existing outcome's wording and mastery levels. Continue?";
    else if (draft.type === "rubric") question = "This replaces the assignment's rubric if it already has one. Continue?";
    if (question && !window.confirm(question)) return;
    setBusy("approve");
    setError("");
    const r = await approveDraft(SERVER_URL, courseId, draft.id);
    setBusy("");
    if (!r.ok) { setError(r.message); showToast(r.message, "error"); return; }
    showToast(r.data?.message || "Added to the course", "success", 6000);
    onDecided?.({ ...draft, status: "approved", resultRefs: r.data?.resultRefs }, { status: "approved", message: r.data?.message, resultRefs: r.data?.resultRefs });
  };

  const reject = async () => {
    if (!window.confirm("Reject this AI draft? It won't be added to the course.")) return;
    setBusy("reject");
    setError("");
    const r = await rejectDraft(SERVER_URL, courseId, draft.id);
    setBusy("");
    if (!r.ok) { setError(r.message); showToast(r.message, "error"); return; }
    showToast("Draft rejected", "success");
    onDecided?.({ ...draft, status: "rejected" }, { status: "rejected", message: r.data?.message });
  };

  return (
    <article aria-label={`${DRAFT_TYPE_LABELS[draft.type] || draft.type} draft`} className="rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-900/40 p-3 sm:p-4 space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <Heading className={`text-[11px] font-bold uppercase tracking-wide border rounded-md px-2 py-0.5 ${TYPE_TONES[draft.type] || TYPE_TONES.rubric}`}>
          {DRAFT_TYPE_LABELS[draft.type] || draft.type}
        </Heading>
        <AiDraftLabel />
        {module ? <span className="text-xs font-semibold text-[#0D9488]">{moduleWeekLabel(module)}{module.title ? ` · ${module.title}` : ""}</span> : null}
        {draft.type === "rubric" && draft.assignmentId ? (
          <Link href={`/course/${courseId}/assignments/${draft.assignmentId}`} className="text-xs font-semibold text-[#0D9488] hover:underline">For this assignment</Link>
        ) : null}
        {draft.edited ? <span className="text-[11px] text-slate-500">Edited</span> : null}
      </header>

      {editing ? (
        <DraftEditor
          type={draft.type}
          payload={draft.payload}
          outcomes={outcomes}
          saving={busy === "save"}
          error={error}
          onSave={save}
          onCancel={() => { setEditing(false); setError(""); }}
        />
      ) : (
        <>
          <DraftPreview type={draft.type} payload={draft.payload} outcomes={outcomes} />
          {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}
          {pending ? (
            <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 max-w-sm">{APPROVE_NOTE[draft.type] || ""} Nothing reaches learners until you publish it.</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setEditing(true)} disabled={!!busy} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 disabled:opacity-50 px-3 py-2 rounded-lg">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button type="button" onClick={reject} disabled={!!busy} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 px-3 py-2 rounded-lg">
                  <X className="w-3.5 h-3.5" /> {busy === "reject" ? "Rejecting…" : "Reject"}
                </button>
                <button type="button" onClick={approve} disabled={!!busy} className="inline-flex items-center gap-1 text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 px-3.5 py-2 rounded-lg">
                  <Check className="w-3.5 h-3.5" /> {busy === "approve" ? "Adding…" : "Add to course"}
                </button>
              </div>
            </footer>
          ) : null}
        </>
      )}
    </article>
  );
}

/** Short "added" confirmation with a link to where the new (unpublished) items are. */
export function ApprovedNote({ draft, courseId, message, onDismiss }) {
  const link = draftResultLink(draft, courseId);
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200">
      <span>{message || "Added to the course as unpublished drafts. Review them, then publish."}</span>
      <span className="flex items-center gap-2">
        <Link href={link.href} className="font-bold underline">{link.label}</Link>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label="Hide" className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40"><X className="w-3.5 h-3.5" /></button>
        ) : null}
      </span>
    </div>
  );
}

/** Collapsible read-only view of an already decided draft. */
export function DecidedDraftRow({ draft, modules, outcomes, courseId }) {
  const [open, setOpen] = useState(false);
  const module = draft.moduleId ? (modules || []).find((m) => Number(m.id) === Number(draft.moduleId)) : null;
  const title = draft.payload?.title || (draft.type === "outline" ? `${(draft.payload?.modules || []).length} weeks, ${(draft.payload?.outcomes || []).length} outcomes` : DRAFT_TYPE_LABELS[draft.type]);
  const link = draft.status === "approved" ? draftResultLink(draft, courseId) : null;
  return (
    <li className="text-sm">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />}
          <span className="text-[10px] font-bold uppercase text-slate-500 shrink-0">{DRAFT_TYPE_LABELS[draft.type] || draft.type}</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{title}</span>
        </button>
        {module ? <span className="hidden sm:inline text-xs text-slate-500 shrink-0">{moduleWeekLabel(module)}</span> : null}
        <span className={`text-[10px] font-bold uppercase rounded-full px-2 py-0.5 shrink-0 ${draft.status === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
          {draft.status === "approved" ? (draft.edited ? "Added (edited)" : "Added") : "Rejected"}
        </span>
      </div>
      {open ? (
        <div className="px-3 pb-3 sm:pl-9 space-y-2">
          <p className="text-[11px] text-slate-500">
            {draft.decidedBy ? `${draft.status === "approved" ? "Added" : "Rejected"} by ${draft.decidedBy}` : ""}
            {draft.decidedAt ? ` · ${new Date(draft.decidedAt).toLocaleString()}` : ""}
          </p>
          {link ? <Link href={link.href} className="text-xs font-semibold text-[#0D9488] hover:underline">{link.label}</Link> : null}
          <DraftPreview type={draft.type} payload={draft.payload} outcomes={outcomes} />
        </div>
      ) : null}
    </li>
  );
}
