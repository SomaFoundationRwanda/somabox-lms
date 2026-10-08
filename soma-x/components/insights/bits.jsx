"use client";

import { formatInstantDate } from "@/lib/dates";
import { useProgressText, enTp, plural, fmtDateTime, itemTypeLabel } from "@/components/progress/text";
import Loader from "@/components/ui/Loader";

// Shared display helpers for Insights (teachers) and My progress (learners).
// Every figure can be null: null shows as a dash or "No results yet", never as 0.

export const DASH = "—";

/** 72 -> "72%", null -> "—". */
export const fmtPct = (v) => (v == null || !Number.isFinite(Number(v)) ? DASH : `${Math.round(Number(v))}%`);

/** 0.83 -> "83%", null -> "—" (rates from 0..1). */
export const fmtRate = (r) => (r == null || !Number.isFinite(Number(r)) ? DASH : `${Math.round(Number(r) * 100)}%`);

/** +12 -> "+12 pts", -3 -> "−3 pts", null -> "—". `tp` gives the UI language (default English). */
export function fmtDelta(d, tp = enTp) {
  if (d == null || !Number.isFinite(Number(d))) return DASH;
  const n = Math.round(Number(d));
  if (n > 0) return tp("bits.deltaUp", { n });
  if (n < 0) return tp("bits.deltaDown", { n: Math.abs(n) });
  return tp("bits.deltaZero");
}

/** Normalized gain 0.42 -> "42%" (share of the possible improvement), null -> "—". */
export const fmtGain = (g) => (g == null || !Number.isFinite(Number(g)) ? DASH : `${Math.round(Number(g) * 100)}%`);

export function DeltaText({ value, className = "" }) {
  const { tp } = useProgressText();
  if (value == null) return <span className={`text-slate-400 ${className}`}>{DASH}</span>;
  const n = Math.round(Number(value));
  const tone = n > 0 ? "text-emerald-700 dark:text-emerald-400" : n < 0 ? "text-rose-700 dark:text-rose-400" : "text-slate-600 dark:text-slate-300";
  return <span className={`font-semibold whitespace-nowrap ${tone} ${className}`}>{fmtDelta(value, tp)}</span>;
}

/** Whole days between an instant and today (viewer's local calendar). */
function daysAgo(value, now = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

/** "Today", "Yesterday", "3 days ago", or "No activity yet" (in the language `tp` gives). */
export function relativeDay(value, tp = enTp, locale = undefined) {
  const empty = tp("common.noActivityYet");
  if (!value) return empty;
  const n = daysAgo(value);
  if (n == null) return empty;
  if (n <= 0) return tp("common.today");
  if (n === 1) return tp("common.yesterday");
  if (n < 60) return tp("common.daysAgo", { n });
  return locale ? fmtDateTime(value, locale, { day: "numeric", month: "short", year: "numeric" }) : formatInstantDate(value, { day: "numeric", month: "short", year: "numeric" });
}

/** "made 3 Oct, 14:05" (in `locale` when given). */
export function fmtWhen(value, locale = undefined) {
  if (!value) return "";
  return fmtDateTime(value, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ---- Bands ----
// `label` is the English name; the UI shows bands.<key> from languages/progress.
export const BANDS = [
  { key: "needsReteach", label: "Needs reteach", bar: "bg-rose-500", chip: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900" },
  { key: "onTrack", label: "On track", bar: "bg-sky-500", chip: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900" },
  { key: "mastered", label: "Mastered", bar: "bg-emerald-600", chip: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900" },
  { key: "noData", label: "No data", bar: "bg-slate-300 dark:bg-slate-600", chip: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700" },
];

/** Band for a percentage using the thresholds from the response. */
export function bandFor(value, thresholds) {
  const mastery = thresholds?.mastery ?? 85;
  const reteach = thresholds?.reteach ?? 60;
  if (value == null) return BANDS[3];
  if (value < reteach) return BANDS[0];
  if (value >= mastery) return BANDS[2];
  return BANDS[1];
}

export function BandChip({ value, thresholds, label }) {
  const { tp } = useProgressText();
  const b = bandFor(value, thresholds);
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold rounded-full border px-1.5 py-0.5 whitespace-nowrap ${b.chip}`}>
      {label || tp(`bands.${b.key}`)}
    </span>
  );
}

/**
 * A stacked bar of learners per band, with a legend listing the counts (the legend is the
 * accessible text; the bar itself is decorative).
 */
export function BandBar({ bands, thresholds, title }) {
  const { tp } = useProgressText();
  const counts = BANDS.map((b) => ({ ...b, n: Number(bands?.[b.key] || 0) }));
  const total = counts.reduce((s, b) => s + b.n, 0);
  const mastery = thresholds?.mastery ?? 85;
  const reteach = thresholds?.reteach ?? 60;
  const hint = {
    needsReteach: tp("bands.hintNeedsReteach", { n: reteach }),
    onTrack: tp("bands.hintOnTrack", { low: reteach, high: mastery - 1 }),
    mastered: tp("bands.hintMastered", { n: mastery }),
    noData: tp("bands.hintNoData"),
  };
  return (
    <div className="space-y-1.5">
      {title ? <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</p> : null}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
        {total > 0 ? counts.map((b) => (b.n > 0 ? <div key={b.key} className={b.bar} style={{ width: `${(b.n / total) * 100}%` }} /> : null)) : null}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
        {counts.map((b) => (
          <li key={b.key} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${b.bar}`} aria-hidden="true" />
            <span><strong className="font-semibold">{b.n}</strong> {tp(`bands.${b.key}`).toLowerCase()} <span className="text-slate-400">({hint[b.key]})</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Recent results as small bars (oldest to newest). Each bar has a tooltip; a visually hidden
 * list gives the same information to screen readers.
 */
export function TrajectoryBars({ trajectory, thresholds, label }) {
  const { tp } = useProgressText();
  const points = Array.isArray(trajectory) ? trajectory.filter((t) => t && t.pct != null) : [];
  if (points.length === 0) return <p className="text-xs text-slate-500">{tp("common.noResultsYetDot")}</p>;
  const mastery = thresholds?.mastery ?? 85;
  return (
    <div>
      <div className="relative flex h-20 items-end gap-1.5 border-b border-slate-200 dark:border-slate-700" aria-hidden="true">
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-500/60" style={{ bottom: `${mastery}%` }} />
        {points.map((t, i) => (
          <div key={`${t.sourceType}-${t.sourceId}-${t.attempt ?? ""}-${i}`} className="flex h-full flex-1 min-w-[6px] max-w-[2.5rem] flex-col justify-end" title={`${t.title || tp("common.result")}: ${fmtPct(t.pct)}${t.at ? ` · ${formatInstantDate(t.at, { day: "numeric", month: "short" })}` : ""}`}>
            <div className={`w-full rounded-t ${bandFor(t.pct, thresholds).bar}`} style={{ height: `${Math.max(3, Math.min(100, Number(t.pct)))}%` }} />
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{tp("bits.trajectoryNote", { n: mastery })}</p>
      <ol className="sr-only" aria-label={label || tp("bits.recentResults")}>
        {points.map((t, i) => (
          <li key={i}>{t.title || tp("common.result")}: {fmtPct(t.pct)}{t.at ? `, ${formatInstantDate(t.at)}` : ""}</li>
        ))}
      </ol>
    </div>
  );
}

// ---- Work states ----
// `label` is the English name; the UI shows workStates.<state> from languages/progress.
export const WORK_STATES = {
  done_on_time: { label: "On time", cls: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900" },
  done_late: { label: "Late", cls: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900" },
  missing: { label: "Missing", cls: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900" },
  to_do: { label: "To do", cls: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900" },
  upcoming: { label: "Upcoming", cls: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700" },
};

export function WorkStateBadge({ state, label }) {
  const { tp } = useProgressText();
  const s = WORK_STATES[state] || { label: state || DASH, cls: WORK_STATES.upcoming.cls };
  const text = label || (WORK_STATES[state] ? tp(`workStates.${state}`) : s.label);
  return <span className={`inline-flex items-center text-[10px] font-semibold rounded-full border px-1.5 py-0.5 whitespace-nowrap ${s.cls}`}>{text}</span>;
}

/** Link to a graded item's page. */
export function itemHref(courseId, item) {
  if (!item) return null;
  if (item.type === "quiz") return `/course/${courseId}/quizzes/${item.contentId}`;
  if (item.type === "discussion") return `/course/${courseId}/discussions/${item.contentId}`;
  if (item.type === "assignment") return `/course/${courseId}/assignments/${item.contentId}`;
  return null;
}

export const ITEM_TYPE_LABELS = { assignment: "Assignment", quiz: "Quiz", discussion: "Discussion" };

/** Item type in the UI language ("" for an unknown type). */
export const itemType = (tp, type) => (ITEM_TYPE_LABELS[type] ? itemTypeLabel(tp, type) : "");

/** One key figure: label, big value, and a small line under it. Plain, not a card. */
export function Figure({ label, value, sub, children }) {
  return (
    <div className="min-w-0 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5">
        <span className="text-xl font-bold text-slate-900 dark:text-white">{value}</span>
        {sub ? <span className="block text-xs text-slate-500 dark:text-slate-400">{sub}</span> : null}
        {children}
      </dd>
    </div>
  );
}

/** "based on 12 of 30 learners" (in the language `tp` gives). */
export const basedOn = (n, total, tp = enTp) => plural(tp, "bits.basedOn", total ?? 0, { n: n ?? 0, total: total ?? 0 });

// While an insights/attendance/progress panel waits for data: the SOMABOX loader, centred
// where the rows will appear (taller when more rows are expected).
export function LoadingRows({ count = 3 }) {
  const { tp } = useProgressText();
  return (
    <Loader
      variant="page"
      size={count > 3 ? 56 : 48}
      className={count > 3 ? "min-h-[30vh]" : "min-h-[20vh]"}
      label={tp("common.loading")}
    />
  );
}

export function ErrorNote({ message, onRetry }) {
  const { tp } = useProgressText();
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 p-4 flex items-center justify-between gap-3">
      <p className="text-sm text-rose-700 dark:text-rose-300">{message}</p>
      {onRetry ? <button type="button" onClick={onRetry} className="text-xs font-semibold text-rose-700 hover:text-rose-900">{tp("common.retry")}</button> : null}
    </div>
  );
}
