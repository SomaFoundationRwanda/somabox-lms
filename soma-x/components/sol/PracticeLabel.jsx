"use client";

import { useLanguage } from "@/context/LanguageContext";

// Science-of-Learning practice (spaced reviews, interleaving, refreshers, the diagnostic) is a
// separate stream from graded course work: it never feeds outcome mastery. Shown wherever SoL
// data appears so nobody reads practice numbers as grades. Inline (a span) so it fits in text.
export default function PracticeLabel({ className = "" }) {
  const t = useLanguage()?.t;
  return (
    <span className={`inline-flex items-center rounded-full border border-line bg-surface-sunken px-2 py-0.5 text-caption font-semibold text-fg-muted ${className}`}>
      {t?.("learner.practice.label") ?? "Practice — doesn't count toward outcome mastery"}
    </span>
  );
}
