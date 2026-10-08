"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/LanguageContext";

// Attendance text lives in languages/attendance/<code>.js under the `attendance` key.
// tx("key", { n: 3 }) fills {n}; txn("key", n, vars) picks "<key>One" or "<key>Other".
export function useAttendanceText() {
  const { t } = useLanguage();
  const tx = useCallback((key, vars) => {
    const raw = t(`attendance.${key}`);
    const s = typeof raw === "string" ? raw : key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
  }, [t]);
  const txn = useCallback((key, n, vars = {}) => tx(`${key}${Number(n) === 1 ? "One" : "Other"}`, { n, ...vars }), [tx]);
  return { tx, txn };
}

export const STATUSES = ["present", "late", "absent", "excused"];

// Colour plus letter, never colour alone. `on` when chosen, `off` otherwise.
export const STATUS_STYLE = {
  present: {
    on: "bg-emerald-600 border-emerald-600 text-white",
    off: "border-emerald-300 text-emerald-800 dark:text-emerald-300 dark:border-emerald-800",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  },
  late: {
    on: "bg-amber-500 border-amber-500 text-slate-950",
    off: "border-amber-300 text-amber-800 dark:text-amber-300 dark:border-amber-800",
    chip: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  },
  absent: {
    on: "bg-rose-600 border-rose-600 text-white",
    off: "border-rose-300 text-rose-800 dark:text-rose-300 dark:border-rose-800",
    chip: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
  },
  excused: {
    on: "bg-sky-600 border-sky-600 text-white",
    off: "border-sky-300 text-sky-800 dark:text-sky-300 dark:border-sky-800",
    chip: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900",
  },
  none: {
    chip: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
  },
};

/** Status label key: statusPresent, statusLate, statusAbsent, statusExcused, statusNone. */
export const statusKey = (s) => (s ? `status${s[0].toUpperCase()}${s.slice(1)}` : "statusNone");
export const letterKey = (s) => `letter${s[0].toUpperCase()}${s.slice(1)}`;

export function StatusChip({ status }) {
  const { tx } = useAttendanceText();
  const style = STATUS_STYLE[status] || STATUS_STYLE.none;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${style.chip}`}>
      {status ? <span aria-hidden="true" className="font-bold">{tx(letterKey(status))}</span> : null}
      {tx(statusKey(status))}
    </span>
  );
}

/** Same rules as the server's attendance reasons: a run of absences, or a low rate. */
export function attendanceFlags(summary, rules) {
  if (!summary) return [];
  const r = { minSessions: 3, lowRate: 0.8, consecutiveAbsences: 3, ...(rules || {}) };
  if ((summary.consecutiveAbsences || 0) >= r.consecutiveAbsences) return [{ code: "absent_in_a_row", n: summary.consecutiveAbsences }];
  if ((summary.counted || 0) >= r.minSessions && summary.rate != null && summary.rate < r.lowRate) {
    return [{ code: "low_attendance", pct: Math.round(summary.rate * 100), n: summary.counted, below: Math.round(r.lowRate * 100) }];
  }
  return [];
}

export const pct = (rate) => (rate == null || !Number.isFinite(Number(rate)) ? "—" : `${Math.round(Number(rate) * 100)}%`);
export const attended = (s) => (s ? (s.present || 0) + (s.late || 0) : 0);
