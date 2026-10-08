"use client";

import { Fragment, createElement, useCallback, useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import en from "@/languages/progress/en";

// Text for grades, outcomes, insights, AI drafts and learner progress lives in
// languages/progress/<code>.js under the `progress` key.
//   tp("grades.title")                  -> current language, else English, else the key
//   tp("insights.figuresAsOf", { date }) -> fills {date}
//   tpn("common.results", 3)             -> picks "resultsOne" or "resultsOther", fills {n}
// Plain helpers that run outside a component take `tp` as an argument (default: English).

const lookup = (obj, key) => key.split(".").reduce((o, k) => o?.[k], obj);

/** English-only text function, the default for helpers called without a `tp`. */
export const enTp = (key, vars) => {
  const raw = lookup(en, key);
  return fill(typeof raw === "string" ? raw : key, vars);
};

/** "<key>One" for 1, "<key>Other" otherwise, with {n} filled. */
export const plural = (tp, key, n, vars = {}) => tp(`${key}${Number(n) === 1 ? "One" : "Other"}`, { n, ...vars });

/** A locale Intl can format with for the UI language ("rw" falls back to "en-RW", then "en"). */
export function intlLocale(lang) {
  const wanted = lang === "rw" ? ["rw", "en-RW", "en"] : [lang || "en", "en"];
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(wanted)[0] || "en";
  } catch {
    return "en";
  }
}

/** Date/time string in the UI language; falls back to the browser default if Intl refuses. */
export function fmtDateTime(value, locale, opts) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString(locale, opts);
  } catch {
    return d.toLocaleString(undefined, opts);
  }
}

/** Like fill(), but values may be React nodes (e.g. a link inside a sentence). */
export function fillNode(text, vars = {}) {
  return String(text || "").split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    const value = m ? vars[m[1]] : part;
    return createElement(Fragment, { key: i }, value ?? "");
  });
}

export function useProgressText() {
  const { t, lang } = useLanguage();
  const tp = useCallback((key, vars) => {
    const raw = t(`progress.${key}`);
    return fill(typeof raw === "string" ? raw : key, vars);
  }, [t]);
  const tpn = useCallback((key, n, vars) => plural(tp, key, n, vars), [tp]);
  /** Text for a key that may not exist (a value from the server): `fallback` when missing. */
  const tpOr = useCallback((key, fallback, vars) => {
    const raw = t(`progress.${key}`);
    return typeof raw === "string" ? fill(raw, vars) : fallback;
  }, [t]);
  const locale = useMemo(() => intlLocale(lang), [lang]);
  return { tp, tpn, tpOr, lang, locale };
}

// ---- Labels for fixed values ----

const has = (tp, key) => tp(key) !== key;

/** "Assignment" / "Quiz" / "Discussion". */
export const itemTypeLabel = (tp, type) => (type && has(tp, `itemTypes.${type}`) ? tp(`itemTypes.${type}`) : type || "");

/** "Fill the week", "Rubric", ... for an AI job kind. */
export const jobKindLabel = (tp, kind) => (kind && has(tp, `ai.jobKinds.${kind}`) ? tp(`ai.jobKinds.${kind}`) : kind || "");

/** "Page", "Quiz", ... for an AI draft type. */
export const draftTypeLabel = (tp, type) => (type && has(tp, `ai.draftTypes.${type}`) ? tp(`ai.draftTypes.${type}`) : type || "");

/** "Week 3", "Week 0 · Baseline", "Unassigned" for a module. */
export function weekLabel(tp, m) {
  if (!m) return "";
  if (m.kind === "baseline") return tp("common.weekBaseline");
  if (m.kind === "unassigned" || m.week_offset === null || m.week_offset === undefined) return tp("common.unassigned");
  return tp("common.weekN", { n: m.week_offset });
}

/** "Waiting: 2 ahead of you" / "Working: step 1 of 4" / "Finished" for an AI job. */
export function jobStatus(tp, job) {
  if (!job) return "";
  if (job.status === "queued") return job.position > 0 ? tp("ai.status.waitingAhead", { n: job.position }) : tp("ai.status.waiting");
  if (job.status === "running") {
    return job.total > 1 ? tp("ai.status.workingStep", { step: Math.min(job.progress + 1, job.total), total: job.total }) : tp("ai.status.working");
  }
  if (job.status === "done") return tp("ai.status.done");
  if (job.status === "failed") return job.error || tp("ai.status.failed");
  if (job.status === "cancelled") return tp("ai.status.cancelled");
  return job.status;
}

// draftResultLink() (lib/ai.js) returns English labels; show them in the UI language.
const RESULT_LINK_KEYS = {
  "Open the assignment": "openAssignment",
  "Open Outcomes": "openOutcomes",
  "Open Modules to review and publish": "openModulesReview",
  "Open Modules": "openModules",
};
export const resultLinkLabel = (tp, label) => (RESULT_LINK_KEYS[label] ? tp(`ai.links.${RESULT_LINK_KEYS[label]}`) : label);
