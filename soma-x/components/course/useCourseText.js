"use client";

import { useCallback, useMemo } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { toLocalDate } from "@/lib/dates";

// The English labels the server gives each course navigation item by default
// (DEFAULT_NAV_ITEMS in the backend). When a course's label still equals the default we show
// the translated one; when the teacher renamed it, we show the teacher's label as written.
export const DEFAULT_NAV_LABELS = {
  home: "Home",
  announcements: "Announcements",
  syllabus: "Syllabus",
  modules: "Modules",
  calendar: "Calendar",
  grades: "Grades",
  people: "People",
  assignments: "Assignments",
  rubrics: "Rubrics",
  files: "Files",
  collaborations: "Collaborations",
  outcomes: "Outcomes",
  quizzes: "Quizzes",
  pages: "Pages",
  discussions: "Discussions",
  settings: "Settings",
  insights: "Insights",
  attendance: "Attendance",
  ai: "AI drafts",
  progress: "My progress",
};

/** A locale Intl can format with for a UI language ("rw" falls back where Intl lacks it). */
export function intlLocale(lang) {
  const tries = lang === "rw" ? ["rw", "en-RW", "en"] : [lang || "en", "en"];
  for (const l of tries) {
    try {
      if (Intl.DateTimeFormat.supportedLocalesOf([l]).length) return l;
    } catch {
      /* try the next one */
    }
  }
  return undefined;
}

/**
 * Course screen text helpers on top of useLanguage():
 * - t(key): course text, e.g. t("nav.home") reads "course.nav.home"
 * - tf(key, vars): the same with {placeholders} filled
 * - tOr(key, fallback): the translation, or fallback when the key doesn't exist
 * - navLabel(navKey, serverLabel): translated nav label unless the teacher renamed it
 * - weekLabel(module), lifecycleLabel(course): translated module/course labels
 * - locale: for toLocaleDateString / Intl
 * - fmtDay(dateStr, opts): a 'YYYY-MM-DD' calendar day in the UI language ("" if unusable)
 * - fmtDate(value, opts) / fmtDateTime(value, opts): an instant (ISO string or Date)
 */
export function useCourseText() {
  const { t: tRoot, lang } = useLanguage();
  const t = useCallback((key) => tRoot(`course.${key}`) ?? key, [tRoot]);
  const tf = useCallback((key, vars) => fill(t(key), vars), [t]);
  // For keys built from data (e.g. a role): the translation, or `fallback` when there is none.
  const tOr = useCallback((key, fallback) => tRoot(`course.${key}`) ?? fallback, [tRoot]);
  const locale = useMemo(() => intlLocale(lang), [lang]);

  const navLabel = useCallback((navKey, serverLabel) => {
    const fallback = DEFAULT_NAV_LABELS[navKey];
    if (serverLabel && fallback && serverLabel.trim() !== fallback) return serverLabel;
    return tRoot(`course.nav.${navKey}`) ?? serverLabel ?? fallback ?? navKey;
  }, [tRoot]);

  const weekLabel = useCallback((m) => {
    if (!m) return "";
    if (m.kind === "baseline") return t("weeks.baseline");
    if (m.kind === "unassigned" || m.week_offset === null || m.week_offset === undefined) return t("weeks.unassigned");
    return tf("weeks.week", { n: m.week_offset });
  }, [t, tf]);

  const lifecycleLabel = useCallback((course) => {
    const key = ["draft", "open", "closed", "archived"].includes(course?.lifecycle) ? course.lifecycle : "draft";
    return t(`lifecycle.${key}`);
  }, [t]);

  const fmtDay = useCallback((dateStr, opts = { weekday: "short", day: "numeric", month: "short" }) => {
    const d = toLocalDate(dateStr);
    if (!d) return "";
    try { return d.toLocaleDateString(locale, opts); } catch { return d.toLocaleDateString(undefined, opts); }
  }, [locale]);

  const fmtDate = useCallback((value, opts) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    try { return d.toLocaleDateString(locale, opts); } catch { return d.toLocaleDateString(undefined, opts); }
  }, [locale]);

  const fmtDateTime = useCallback((value, opts) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    try { return d.toLocaleString(locale, opts); } catch { return d.toLocaleString(undefined, opts); }
  }, [locale]);

  return { t, tf, tOr, lang, locale, navLabel, weekLabel, lifecycleLabel, fmtDay, fmtDate, fmtDateTime };
}
