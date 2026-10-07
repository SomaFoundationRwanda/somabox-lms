"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { BookOpen, ClipboardCheck, FileDown, Heading, ListChecks, MessagesSquare, PencilLine, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { trackEvent } from "@/lib/usage";
import { moduleWeekLabel } from "@/lib/moduleLabels";

// Learner goal -> what to create. `kind` refines quizzes.
export const CREATE_GOALS = [
  { id: "read", itemType: "page", icon: BookOpen },
  { id: "submit", itemType: "assignment", icon: PencilLine },
  { id: "quiz", itemType: "quiz", kind: "graded", icon: ClipboardCheck },
  { id: "practice", itemType: "quiz", kind: "practice", icon: ListChecks },
  { id: "discuss", itemType: "discussion", icon: MessagesSquare },
  { id: "download", itemType: "file", icon: FileDown },
  { id: "organise", itemType: "sub_header", icon: Heading },
];

/**
 * "What should I create?" — asks what learners should do and which week, then calls
 * onChoose({ moduleId, itemType, kind }) so the page opens the right editor in that module.
 * modules: [{ id, title, kind, week_offset }] (Unassigned is left out).
 */
export default function WhatShouldICreate({ open, onClose, modules, defaultModuleId, onChoose }) {
  const { explain } = useLanguage();
  const params = useParams();
  const helper = explain("helper").entry || {};
  const titleId = useId();
  const dialogRef = useRef(null);
  const choices = (modules || []).filter((m) => m.kind !== "unassigned");
  const [goal, setGoal] = useState(null);
  const [moduleId, setModuleId] = useState(defaultModuleId || choices[0]?.id || "");

  useEffect(() => {
    if (!open) return undefined;
    setGoal(null);
    setModuleId(defaultModuleId || choices[0]?.id || "");
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const create = () => {
    const chosen = CREATE_GOALS.find((g) => g.id === goal);
    if (!chosen || !moduleId) return;
    trackEvent("create_helper_used", { goal: chosen.id, itemType: chosen.itemType }, params?.courseId);
    onChoose({ moduleId: Number(moduleId), itemType: chosen.itemType, kind: chosen.kind });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 p-5 outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-white">{helper.title || "What should learners do?"}</h2>
            <p className="mt-1 text-xs text-slate-500">{helper.intro}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={helper.cancel || "Cancel"} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <fieldset className="mt-4">
          <legend className="sr-only">{helper.title}</legend>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
            {CREATE_GOALS.map((g) => {
              const text = helper.goals?.[g.id] || {};
              const Icon = g.icon;
              return (
                <label key={g.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${goal === g.id ? "bg-teal-50 dark:bg-teal-950/30" : ""}`}>
                  <input type="radio" name="create-goal" value={g.id} checked={goal === g.id} onChange={() => setGoal(g.id)} className="accent-[#0D9488]" />
                  <Icon className="w-4 h-4 text-[#0D9488] shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{text.label || g.id}</span>
                    <span className="block text-xs text-slate-500">{text.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-4 block text-xs font-semibold text-slate-600">
          {helper.module || "Add it to"}
          <select
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {choices.map((m) => (
              <option key={m.id} value={m.id}>{moduleWeekLabel(m)}: {m.title}</option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">{helper.cancel || "Cancel"}</button>
          <button
            type="button"
            onClick={create}
            disabled={!goal || !moduleId}
            className="rounded-lg bg-[#203A3A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {helper.create || "Create it"}
          </button>
        </div>
      </div>
    </div>
  );
}
