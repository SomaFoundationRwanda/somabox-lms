"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { HelpCircle, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { trackEvent } from "@/lib/usage";
import { useOptionalCourse } from "@/context/CourseContext";

/**
 * "What is this?" help for a concept, from the explainers in the current language
 * (English if not translated yet, and it says so). Opens on click, closes on Escape or
 * outside click, and logs each open so admins can see where teachers look for help.
 *
 * k: key under explainers, e.g. "items.quiz" or "pages.modules".
 * variant: "link" (text + icon, default) | "icon" (icon only, for tight spots).
 * audience: "teacher" (default: hidden from learners inside a course) | "everyone".
 */
export default function Explainer({ k, variant = "link", label, className = "", align = "left", audience = "teacher" }) {
  const { explain, lang } = useLanguage();
  // Inside a course, teacher help is only shown to teachers (learners would find it confusing).
  const course = useOptionalCourse();
  const hidden = audience === "teacher" && course && !course.isTeacher;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();
  const params = useParams();
  const { entry, isFallback } = explain(k);
  const ui = explain("ui").entry || {};

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!entry || hidden) return null;
  const buttonLabel = label || ui.whatIsThis || "What is this?";

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next) trackEvent("explainer_opened", { key: k, lang, fallback: isFallback }, params?.courseId);
  };

  return (
    <span ref={wrapRef} className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={variant === "icon" ? `${buttonLabel}: ${entry.title}` : undefined}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0D9488] hover:text-[#0b7c72] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 rounded"
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
        {variant === "icon" ? null : <span>{buttonLabel}</span>}
      </button>
      {open ? (
        <span
          id={panelId}
          role="dialog"
          aria-label={entry.title}
          className={`absolute z-30 top-full mt-1.5 w-72 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900 ${align === "right" ? "right-0" : "left-0"}`}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white">{entry.title}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={ui.close || "Close"} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-slate-300">{entry.what}</span>
          {entry.when ? (
            <span className="mt-2 block text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <strong className="text-slate-800 dark:text-slate-100">{ui.useItWhen || "Use it when"}:</strong> {entry.when}
            </span>
          ) : null}
          {entry.mistake ? (
            <span className="mt-2 block rounded-lg bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <strong>{ui.commonMistake || "Common mistake"}:</strong> {entry.mistake}
            </span>
          ) : null}
          {isFallback ? (
            <span className="mt-2 block text-[10px] italic text-slate-400">{ui.shownInEnglish || "Not translated yet: shown in English"}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** The explainer's "what it is" sentence, for empty states. */
export function ExplainerText({ k, className = "" }) {
  const { explain } = useLanguage();
  const { entry } = explain(k);
  if (!entry) return null;
  return <span className={className}>{entry.what}</span>;
}
