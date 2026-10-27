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
  // English as written in Rwanda: day before month ("Fri 30 Oct"), like en-GB.
  const tries = lang === "rw" ? ["rw", "en-RW", "en-GB", "en"] : !lang || lang === "en" ? ["en-GB", "en"] : [lang, "en"];
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
 * - tpts(n): a number of points ("1 pt", "4 pts")
 * - navLabel(navKey, serverLabel): translated nav label unless the teacher renamed it
 * - weekLabel(module), lifecycleLabel(course): translated module/course labels
 * - ownWeekTitle(module): the week's title without a repeated "Week 3" ("" if that's all it is)
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
  // "1 pt", "4 pts".
  const tpts = useCallback((n) => fill(t(Number(n) === 1 ? "common.point" : "common.points"), { n }), [t]);
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

  // A week's own title, without a leading "Week 3" / "Week 3:" that only repeats its label (in any
  // language); "" when the title is nothing more than the label.
  const ownWeekTitle = useCallback((m) => {
    const title = String(m?.title || "").trim();
    const label = weekLabel(m);
    const strip = (prefix) => (prefix && title.toLowerCase().startsWith(prefix.toLowerCase()) ? title.slice(prefix.length).replace(/^\s*[:\-–·|]\s*/, "").trim() : null);
    const english = title.replace(/^\s*(week|wk)\s*\d+\s*[:\-–·|]?\s*/i, "").trim();
    return strip(label) ?? (english !== title ? english : title);
  }, [weekLabel]);

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

  // A date and time to the minute ("27 Oct 2026, 12:51"), unless opts say otherwise.
  const fmtDateTime = useCallback((value, opts = { dateStyle: "medium", timeStyle: "short" }) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    try { return d.toLocaleString(locale, opts); } catch { return d.toLocaleString(undefined, opts); }
  }, [locale]);

  return { t, tf, tOr, tpts, lang, locale, navLabel, weekLabel, ownWeekTitle, lifecycleLabel, fmtDay, fmtDate, fmtDateTime };
}
