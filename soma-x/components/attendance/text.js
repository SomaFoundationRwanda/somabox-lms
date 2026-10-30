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
    on: "bg-success border-success text-on-success",
    off: "border-success/30 text-success-fg",
    chip: "bg-success-soft text-success-fg border-success/30",
  },
  late: {
    on: "bg-warning border-warning text-on-warning",
    off: "border-warning/30 text-warning-fg",
    chip: "bg-warning-soft text-warning-fg border-warning/30",
  },
  absent: {
    on: "bg-danger border-danger text-on-danger",
    off: "border-danger/30 text-danger-fg",
    chip: "bg-danger-soft text-danger-fg border-danger/30",
  },
  excused: {
    on: "bg-info border-info text-on-info",
    off: "border-info/30 text-info-fg",
    chip: "bg-info-soft text-info-fg border-info/30",
  },
  none: {
    chip: "bg-surface-sunken text-fg-muted border-line",
  },
};

/** Status label key: statusPresent, statusLate, statusAbsent, statusExcused, statusNone. */
export const statusKey = (s) => (s ? `status${s[0].toUpperCase()}${s.slice(1)}` : "statusNone");
export const letterKey = (s) => `letter${s[0].toUpperCase()}${s.slice(1)}`;

export function StatusChip({ status }) {
  const { tx } = useAttendanceText();
  const style = STATUS_STYLE[status] || STATUS_STYLE.none;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption font-semibold ${style.chip}`}>
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
