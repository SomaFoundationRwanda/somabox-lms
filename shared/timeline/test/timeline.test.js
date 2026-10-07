import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, diffDays, isDateString, endOfDay, todayIn, dateIn, resolveTimeline, itemStatus, shiftModuleOffsets, weekday,
} from "../index.js";

test("calendar arithmetic is on dates, across months, leap years, and DST", () => {
  assert.equal(addDays("2026-01-30", 3), "2026-02-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(diffDays("2026-03-28", "2026-03-30"), 2); // European DST change in between
  assert.equal(addDays("2026-10-24", 7), "2026-10-31");
  assert.equal(weekday("2026-10-05"), 1);
  assert.ok(isDateString("2026-02-28"));
  assert.ok(!isDateString("2026-02-30"));
  assert.ok(!isDateString("2026-2-3"));
});

test("end of day is in the school's time zone", () => {
  assert.equal(endOfDay("2026-10-07", "Africa/Kigali"), "2026-10-07T21:59:59.000Z");
  assert.equal(endOfDay("2026-07-01", "Europe/Paris"), "2026-07-01T21:59:59.000Z");
  assert.equal(endOfDay("2026-01-01", "Europe/Paris"), "2026-01-01T22:59:59.000Z");
  assert.equal(todayIn("Africa/Kigali", new Date("2026-10-07T22:30:00Z")), "2026-10-08");
  assert.equal(dateIn("2026-10-07T22:30:00Z", "Africa/Kigali"), "2026-10-08");
});

test("Week 1 starts on the course start date; the baseline is the week before", () => {
  const withBaseline = resolveTimeline({
    startDate: "2026-01-05",
    modules: [{ id: 1, kind: "baseline", week_offset: 0 }, { id: 2, kind: "regular", week_offset: 1 }, { id: 3, kind: "regular", week_offset: 3, day_offset: 2 }],
  });
  assert.deepEqual(withBaseline.modules.map((m) => m.startDate), ["2025-12-29", "2026-01-05", "2026-01-21"]);

  // Adding or removing a baseline doesn't move anything else.
  const noBaseline = resolveTimeline({
    startDate: "2026-01-05",
    modules: [{ id: 2, kind: "regular", week_offset: 1 }, { id: 9, kind: "unassigned", week_offset: null }],
  });
  assert.equal(noBaseline.modules[0].startDate, "2026-01-05");
  assert.equal(noBaseline.modules[1].startDate, null);
});

test("item dates are relative to the module start", () => {
  const { items } = resolveTimeline({
    startDate: "2026-01-05",
    modules: [{ id: 2, kind: "regular", week_offset: 2 }],
    items: [{ id: 10, module_id: 2, release_day: 1, due_day: 6, close_day: 9 }, { id: 11, module_id: 2, release_day: 0, due_day: null }],
  });
  assert.deepEqual(items[0], { id: 10, releaseDate: "2026-01-13", dueDate: "2026-01-18", closeDate: "2026-01-21", status: undefined });
  assert.equal(items[1].dueDate, null);
});

test("no start date means no dates", () => {
  const r = resolveTimeline({ startDate: null, modules: [{ id: 1, kind: "regular", week_offset: 1 }], items: [{ id: 1, module_id: 1, due_day: 6 }] });
  assert.equal(r.modules[0].startDate, null);
  assert.equal(r.items[0].dueDate, null);
});

test("item status follows release, due, and close dates", () => {
  const dates = { releaseDate: "2026-01-06", dueDate: "2026-01-11", closeDate: "2026-01-14" };
  assert.equal(itemStatus(dates, "2026-01-05"), "upcoming");
  assert.equal(itemStatus(dates, "2026-01-11"), "open");
  assert.equal(itemStatus(dates, "2026-01-12"), "past_due");
  assert.equal(itemStatus(dates, "2026-01-15"), "closed");
  assert.equal(itemStatus({ ...dates, closeDate: null }, "2026-01-12"), "closed");
});

test("shifting keeps week/day offsets normalised", () => {
  assert.deepEqual(shiftModuleOffsets({ kind: "regular", week_offset: 2, day_offset: 5 }, 3), { week_offset: 3, day_offset: 1 });
  assert.deepEqual(shiftModuleOffsets({ kind: "regular", week_offset: 3, day_offset: 0 }, -7), { week_offset: 2, day_offset: 0 });
  assert.throws(() => shiftModuleOffsets({ kind: "regular", week_offset: 1, day_offset: 0 }, -1));
  assert.deepEqual(shiftModuleOffsets({ kind: "baseline", week_offset: 0, day_offset: 0 }, 2), { week_offset: 0, day_offset: 2 });
  assert.throws(() => shiftModuleOffsets({ kind: "baseline", week_offset: 0, day_offset: 0 }, 7));
});
