// Shared display helpers for course modules.
// kind: "baseline" (week_offset 0), "regular" (week_offset >= 1), "unassigned" (week_offset null)

export function isUnassignedModule(m) {
  return m?.kind === "unassigned";
}

export function moduleWeekLabel(m) {
  if (!m) return "";
  if (m.kind === "baseline") return "Week 0 · Baseline";
  if (m.kind === "unassigned") return "Unassigned";
  if (m.week_offset === null || m.week_offset === undefined) return "Unassigned";
  return `Week ${m.week_offset}`;
}

const LIFECYCLE_LABELS = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  archived: "Archived",
};

export function courseLifecycleLabel(course) {
  return LIFECYCLE_LABELS[course?.lifecycle] || "Draft";
}
