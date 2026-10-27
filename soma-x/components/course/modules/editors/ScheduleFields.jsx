"use client";

import { useId } from "react";
import { addDays, isDateString } from "@somabox/timeline";
import { useCourseText } from "@/components/course/useCourseText";
import { Label, TextInput } from "@/components/form";

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

const SCHEDULE_ERRORS_EN = {
  releaseRange: "Release day must be a whole number from 0 to 365.",
  dueRange: "Due day must be a whole number from 0 to 365.",
  closeRange: "Close day must be a whole number from 0 to 365.",
  dueBeforeRelease: "The due day can't be before the release day.",
  closeWithoutDue: "Set a due day before adding a cutoff.",
  closeBeforeDue: "The close day must be on or after the due day.",
};

/** Returns a message when the combination is invalid, else "". Pass the course t() to get
 *  it in the UI language (keys under course.schedule.errors). */
export function scheduleError({ releaseDay, dueDay, closeDay }, t) {
  const r = toDay(releaseDay) ?? 0;
  const d = toDay(dueDay);
  const c = toDay(closeDay);
  const msg = (key) => (t ? t(`schedule.errors.${key}`) : SCHEDULE_ERRORS_EN[key]);
  for (const [v, key] of [[r, "releaseRange"], [d, "dueRange"], [c, "closeRange"]]) {
    if (v !== null && (!Number.isInteger(v) || v < 0 || v > 365)) return msg(key);
  }
  if (d !== null && d < r) return msg("dueBeforeRelease");
  if (c !== null && d === null) return msg("closeWithoutDue");
  if (c !== null && c < d) return msg("closeBeforeDue");
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
  const { t, fmtDay } = useCourseText();
  const n = toDay(value);
  if (n === null) return <span className="text-caption text-fg-subtle">{empty}</span>;
  if (!isDateString(start) || !Number.isInteger(n) || n < 0) {
    return <span className="text-caption text-fg-subtle">{t("schedule.daysFromStart")}</span>;
  }
  return <span className="text-caption font-semibold text-brand-fg">{fmtDay(addDays(start, n))}</span>;
}

export default function ScheduleFields({ values, onChange, moduleStartDate, showDue = true, className = "" }) {
  const id = useId();
  const { t, tf, fmtDay } = useCourseText();
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value });
  const error = scheduleError(values, t);

  return (
    <div className={`p-3 bg-surface-sunken border border-line rounded-xl space-y-2 ${className}`}>
      <div className={`grid gap-3 ${showDue ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"}`}>
        <div>
          <Label htmlFor={`${id}-release`}>{t("schedule.opensOnDay")}</Label>
          <TextInput id={`${id}-release`} type="number" min="0" max="365" step="1" value={values.releaseDay} onChange={set("releaseDay")} size="sm" className="w-full" />
          <Preview start={moduleStartDate} value={values.releaseDay === "" ? "0" : values.releaseDay} />
        </div>
        {showDue && (
          <>
            <div>
              <Label htmlFor={`${id}-due`}>{t("schedule.dueOnDay")}</Label>
              <TextInput id={`${id}-due`} type="number" min="0" max="365" step="1" value={values.dueDay} onChange={set("dueDay")} placeholder={t("common.noDueDate")} size="sm" className="w-full" />
              <Preview start={moduleStartDate} value={values.dueDay} empty={t("schedule.emptyNoDue")} />
            </div>
            <div>
              <Label htmlFor={`${id}-close`}>{t("schedule.closesOnDay")}</Label>
              <TextInput id={`${id}-close`} type="number" min="0" max="365" step="1" value={values.closeDay} onChange={set("closeDay")} placeholder={t("schedule.noCutoff")} size="sm" className="w-full" />
              <Preview start={moduleStartDate} value={values.closeDay} empty={t("schedule.emptyNoCutoff")} />
            </div>
          </>
        )}
      </div>
      <p className="text-caption text-fg-subtle">
        {isDateString(moduleStartDate)
          ? tf("schedule.countFromDate", { date: fmtDay(moduleStartDate) })
          : t("schedule.countNoDate")}
      </p>
      {error && <p className="text-caption font-medium text-danger-fg" role="alert">{error}</p>}
    </div>
  );
}
