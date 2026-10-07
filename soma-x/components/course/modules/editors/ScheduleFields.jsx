"use client";

import { useId } from "react";
import { addDays, isDateString } from "@somabox/timeline";
import { formatDate } from "@/lib/dates";

// Release / due / close day inputs (days after the module's first day) with a live preview
// of the dates they resolve to when the module's start date is known.

const toDay = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/** Initial string values for the inputs from an item's offsets. */
export function initialScheduleValues(days, { defaultDue = 6 } = {}) {
  const str = (v) => (v === null || v === undefined || v === "" ? "" : String(v));
  const hasItem = days && (days.release_day !== undefined || days.due_day !== undefined);
  return {
    releaseDay: str(days?.release_day ?? 0),
    dueDay: hasItem ? str(days.due_day) : String(defaultDue),
    closeDay: str(days?.close_day),
  };
}

/** Returns a message when the combination is invalid, else "". */
export function scheduleError({ releaseDay, dueDay, closeDay }) {
  const r = toDay(releaseDay) ?? 0;
  const d = toDay(dueDay);
  const c = toDay(closeDay);
  for (const [v, name] of [[r, "Release day"], [d, "Due day"], [c, "Close day"]]) {
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > 365)) return `${name} must be a whole number from 0 to 365.`;
  }
  if (d !== null && d < r) return "The due day can't be before the release day.";
  if (c !== null && d === null) return "Set a due day before adding a cutoff.";
  if (c !== null && c < d) return "The close day must be on or after the due day.";
  return "";
}

/** { releaseDay, dueDay, closeDay } as numbers or null, ready for the API. */
export function schedulePayload({ releaseDay, dueDay, closeDay }) {
  return {
    releaseDay: toDay(releaseDay) ?? 0,
    dueDay: toDay(dueDay),
    closeDay: toDay(dueDay) === null ? null : toDay(closeDay),
  };
}

function Preview({ start, value, empty }) {
  const n = toDay(value);
  if (n === null) return <span className="text-[10px] text-slate-400">{empty}</span>;
  if (!isDateString(start) || !Number.isInteger(n) || n < 0) {
    return <span className="text-[10px] text-slate-400">Days from module start</span>;
  }
  return <span className="text-[10px] font-semibold text-[#0D9488]">{formatDate(addDays(start, n))}</span>;
}

export default function ScheduleFields({ values, onChange, moduleStartDate, showDue = true, className = "" }) {
  const id = useId();
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value });
  const error = scheduleError(values);
  const inputCls = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none bg-white focus:border-[#0D9488]";

  return (
    <div className={`p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 ${className}`}>
      <div className={`grid gap-3 ${showDue ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"}`}>
        <div>
          <label htmlFor={`${id}-release`} className="block text-[11px] font-bold text-slate-700 mb-1">Opens on day</label>
          <input id={`${id}-release`} type="number" min="0" max="365" step="1" value={values.releaseDay} onChange={set("releaseDay")} className={inputCls} />
          <Preview start={moduleStartDate} value={values.releaseDay === "" ? "0" : values.releaseDay} />
        </div>
        {showDue && (
          <>
            <div>
              <label htmlFor={`${id}-due`} className="block text-[11px] font-bold text-slate-700 mb-1">Due on day</label>
              <input id={`${id}-due`} type="number" min="0" max="365" step="1" value={values.dueDay} onChange={set("dueDay")} placeholder="No due date" className={inputCls} />
              <Preview start={moduleStartDate} value={values.dueDay} empty="Empty = no due date" />
            </div>
            <div>
              <label htmlFor={`${id}-close`} className="block text-[11px] font-bold text-slate-700 mb-1">Closes on day</label>
              <input id={`${id}-close`} type="number" min="0" max="365" step="1" value={values.closeDay} onChange={set("closeDay")} placeholder="No cutoff" className={inputCls} />
              <Preview start={moduleStartDate} value={values.closeDay} empty="Empty = accepted late, no cutoff" />
            </div>
          </>
        )}
      </div>
      <p className="text-[10px] text-slate-500">
        Days count from the module&apos;s first day (day 0)
        {isDateString(moduleStartDate) ? `, ${formatDate(moduleStartDate)}.` : ". Dates appear once the course has a start date."}
      </p>
      {error && <p className="text-[11px] font-medium text-rose-600" role="alert">{error}</p>}
    </div>
  );
}
