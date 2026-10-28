"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Course setup text from the server (setup-status checklist, blocking steps, warnings and
 * baseline problems) in the UI language. Each server row has an id + params next to its
 * English text; unknown ids fall back to that English text.
 */
export default function useSetupText() {
  const { t, lang } = useLanguage();

  const vars = useCallback((params = {}) => {
    const out = { ...params };
    for (const [k, v] of Object.entries(out)) {
      if (isDay(v)) {
        try { out[k] = new Date(`${v}T00:00:00`).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" }); } catch { /* keep the raw date */ }
      }
    }
    if (Array.isArray(params.titles)) {
      const names = params.titles.map((n) => `"${n}"`).join(", ");
      out.titles = params.more > 0 ? `${names} ${fill(t("teacher.setup.text.andMore"), { n: params.more })}` : names;
    }
    return out;
  }, [t, lang]);

  const text = useCallback((group, id, params, fallback) => {
    const template = id ? t(`teacher.setup.text.${group}.${id}`) : null;
    return template ? fill(template, vars(params)) : fallback;
  }, [t, vars]);

  return {
    checklistLabel: (item) => text("checklist", item.labelKey || item.id, {}, item.label),
    blockingText: (b) => text("blocking", b.id, b.params, b.message),
    warningText: (w) => text("warnings", w.id, w.params, w.message),
    // One line on what a warning means and what to do (warnings aren't errors), and the link's
    // own words ("Add graded work") instead of a bare "Fix".
    warningHelp: (w) => t(`teacher.setupHelp.warnings.${w.id}`) || "",
    blockingHelp: (b) => t(`teacher.setupHelp.blocking.${b.id}`) || "",
    actionLabel: (row, fallback) => t(`teacher.setupHelp.actions.${row.id}`) || fallback,
    // codes: [{ id, params }] from the server; fallback: its English strings, used when codes are missing.
    baselineProblems: (codes, fallback = []) => (Array.isArray(codes) && codes.length
      ? codes.map((c, i) => text("baseline", c.id, c.params, fallback[i]))
      : fallback),
  };
}
