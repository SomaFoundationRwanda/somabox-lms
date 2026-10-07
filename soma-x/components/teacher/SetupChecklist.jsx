"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ChevronRight, Rocket, Settings } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import Explainer from "@/components/help/Explainer";

/** True when a teacher still has something to look at: a draft course, an unfinished checklist item, or warnings. */
export function setupNeedsAttention(status) {
  if (!status || !Array.isArray(status.checklist)) return false;
  if (!status.isOpened) return true;
  return status.checklist.some((c) => !c.done) || (status.warnings || []).length > 0;
}

/**
 * Teacher "Course setup" section (flat, not a card): checklist, warnings and (for drafts) the Open course button.
 * status: the teacher shape of GET /courses/:id/setup-status. onChanged: called after the course opens.
 */
export default function SetupChecklist({ courseId, SERVER_URL, status, onChanged, showSettingsLink = true }) {
  const { showToast } = useToast();
  const [opening, setOpening] = useState(false);
  const [openErrors, setOpenErrors] = useState([]);

  if (!status || !Array.isArray(status.checklist)) return null;

  const checklist = status.checklist;
  const warnings = Array.isArray(status.warnings) ? status.warnings : [];
  const isDraft = !status.isOpened;
  const doneCount = checklist.filter((c) => c.done).length;

  const openCourse = async () => {
    setOpening(true);
    setOpenErrors([]);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/open-course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const blocking = Array.isArray(payload?.blocking) ? payload.blocking.map((b) => b.message).filter(Boolean) : [];
        setOpenErrors(blocking.length > 0 ? blocking : [payload?.message || "This course can't open yet."]);
        return;
      }
      showToast(payload?.message || "Course opened", "success");
      onChanged?.();
    } catch {
      setOpenErrors(["Could not open the course. Check your connection and try again."]);
    } finally {
      setOpening(false);
    }
  };

  return (
    <section aria-labelledby="setup-checklist-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="setup-checklist-title" className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-2">Course setup <Explainer k="pages.setup" variant="icon" /></h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isDraft
              ? "This course is a draft. Learners can't see it until you open it."
              : "The course is open. These items still need a look."}
            {" "}{doneCount} of {checklist.length} done.
          </p>
        </div>
        {isDraft && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">Draft</span>
        )}
      </div>

      <ul aria-label="Setup checklist" className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
        {checklist.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href || "#"}
              className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] hover:bg-slate-50 transition-colors"
            >
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-[#0D9488] shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
              )}
              <span className={`flex-1 min-w-0 text-sm ${item.done ? "text-slate-500" : "text-slate-800 font-medium"}`}>
                <span className="sr-only">{item.done ? "Done: " : "Not done: "}</span>
                {item.label}
              </span>
              {item.blocking && !item.done && (
                <span className="text-[10px] font-bold uppercase text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full shrink-0">Required</span>
              )}
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {warnings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase text-amber-700 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> Worth checking
          </h3>
          <ul className="divide-y divide-amber-200 border border-amber-200 rounded-xl overflow-hidden">
            {warnings.map((w) => (
              <li key={w.id} className="px-3 py-2.5 bg-amber-50/60 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-amber-900 flex-1 min-w-[12rem]">{w.message}</p>
                {w.href && (
                  <Link href={w.href} className="text-xs font-bold text-amber-700 hover:underline shrink-0">
                    Fix &rarr;
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {openErrors.length > 0 && (
        <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-1">
          <p className="font-bold">The course can't open yet:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {openErrors.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {showSettingsLink ? (
          <Link
            href={`/course/${courseId}/settings#course-setup`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488] hover:underline"
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" /> Course setup in Settings
          </Link>
        ) : <span />}
        {isDraft && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={openCourse}
              disabled={!status.canOpen || opening}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0D9488] hover:bg-teal-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Rocket className="w-4 h-4" aria-hidden="true" /> {opening ? "Opening..." : "Open course"}
            </button>
            {!status.canOpen && (
              <span className="text-[11px] text-slate-500">Finish the required items first.</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
