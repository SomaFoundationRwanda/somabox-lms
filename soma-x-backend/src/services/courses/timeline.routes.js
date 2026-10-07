// Relative timing, setup status, opening a course, and the Home weekly loop.
import express from "express";
import { addDays, resolveTimeline, shiftModuleOffsets } from "@somabox/timeline";
import { localDb } from "../../helpers/db-manager.js";
import { loadCourseTimeline, refreshDueDates } from "./schedule.js";
import {
  isTeacherRole,
  requireTeacher,
  requireEnrolled,
  courseExists,
} from "./shared.js";

const router = express.Router();

// ===== Shift timeline =====
// Moves dates by rewriting offsets (never absolute dates):
// - no fromModuleId: the course start date moves, so every module and item moves with it;
// - fromModuleId: that module and every module after it (in week order) move; earlier ones stay.
// Send { preview: true } to see the result without saving.
router.patch("/:id/shift-timeline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const days = Number(req.body.days ?? req.body.shiftDays);
    if (!Number.isInteger(days) || days === 0) return res.status(400).json({ message: "days must be a whole number other than 0" });
    const fromModuleId = req.body.fromModuleId ? Number(req.body.fromModuleId) : null;
    const preview = !!req.body.preview;

    const before = await loadCourseTimeline(courseId);
    if (!before.startDate) return res.status(400).json({ message: "Set the course start date first" });

    let newStart = before.startDate;
    const moved = new Map();
    if (fromModuleId) {
      const ordered = before.modules.filter((m) => m.kind !== "unassigned")
        .sort((x, y) => (x.startDate < y.startDate ? -1 : x.startDate > y.startDate ? 1 : x.position - y.position));
      const fromIndex = ordered.findIndex((m) => Number(m.id) === fromModuleId);
      if (fromIndex === -1) return res.status(404).json({ message: "Module not found" });
      for (const m of ordered.slice(fromIndex)) {
        try {
          moved.set(Number(m.id), shiftModuleOffsets(m, days));
        } catch (error) {
          return res.status(400).json({ message: `"${m.title}": ${error.message}` });
        }
      }
    } else {
      newStart = addDays(before.startDate, days);
    }

    const after = resolveTimeline({
      startDate: newStart,
      modules: before.modules.map((m) => ({ ...m, ...(moved.get(Number(m.id)) || {}) })),
      items: before.items,
    });
    const afterModules = new Map(after.modules.map((m) => [Number(m.id), m]));
    const afterItems = new Map(after.items.map((i) => [Number(i.id), i]));
    const changes = before.modules
      .filter((m) => afterModules.get(Number(m.id))?.startDate !== m.startDate)
      .map((m) => ({ moduleId: m.id, title: m.title, fromStart: m.startDate, toStart: afterModules.get(Number(m.id)).startDate }));
    const itemChanges = before.items
      .filter((i) => i.dueDate && afterItems.get(Number(i.id))?.dueDate !== i.dueDate)
      .map((i) => ({ moduleItemId: i.id, title: i.title, fromDue: i.dueDate, toDue: afterItems.get(Number(i.id)).dueDate }));

    if (!preview) {
      await localDb.transaction(async () => {
        if (newStart !== before.startDate) {
          await localDb.prepare("UPDATE courses SET start_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newStart, courseId);
        }
        for (const [moduleId, offsets] of moved) {
          await localDb.prepare("UPDATE modules SET week_offset = ?, day_offset = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(offsets.week_offset, offsets.day_offset, moduleId);
        }
        await refreshDueDates(courseId);
      })();
    }

    return res.json({
      preview,
      message: preview ? `Preview: ${changes.length} module(s) and ${itemChanges.length} due date(s) would move` : `Moved ${changes.length} module(s) by ${days} day(s)`,
      startDate: newStart,
      modules: changes,
      items: itemChanges,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Setup status & Course Opening
// TODO(phase 4): add the full blocking list (baseline, graded items tagged, start date, no orphans).
async function getSetupRequirements(courseId) {
  const outcomesCount = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM outcomes WHERE course_id = ?").get(courseId))?.c || 0);
  const modulesCount = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM modules WHERE course_id = ? AND kind <> 'unassigned'").get(courseId))?.c || 0);
  const itemsCount = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM module_items mi JOIN modules m ON m.id = mi.module_id WHERE m.course_id = ? AND m.kind <> 'unassigned'").get(courseId))?.c || 0);
  const unassignedCount = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM module_items mi JOIN modules m ON m.id = mi.module_id WHERE m.course_id = ? AND m.kind = 'unassigned'").get(courseId))?.c || 0);

  const missingRequirements = [];
  if (outcomesCount === 0) missingRequirements.push("Define course learning outcomes");
  if (modulesCount === 0) missingRequirements.push("Add at least one module");
  if (itemsCount === 0) missingRequirements.push("Add items to modules");
  if (unassignedCount > 0) missingRequirements.push(`Move the ${unassignedCount} item${unassignedCount === 1 ? "" : "s"} in "Unassigned (fix me)" into a module`);

  return { outcomesCount, modulesCount, itemsCount, missingRequirements };
}

router.get("/:id/setup-status", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireEnrolled(req, res, courseId)) return;

    const setup = await getSetupRequirements(courseId);

    return res.json({
      lifecycle: course.lifecycle,
      isOpened: course.lifecycle !== "draft",
      setupStep: Number(course.setup_step) || 1,
      outcomesCount: setup.outcomesCount,
      modulesCount: setup.modulesCount,
      itemsCount: setup.itemsCount,
      canOpen: setup.missingRequirements.length === 0,
      missingRequirements: setup.missingRequirements
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/open-course", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const setup = await getSetupRequirements(courseId);
    if (setup.missingRequirements.length > 0) {
      return res.status(400).json({
        message: `This course can't open yet: ${setup.missingRequirements.join("; ")}`,
        missingRequirements: setup.missingRequirements
      });
    }

    if (course.lifecycle !== "draft") {
      return res.status(400).json({ message: `This course is already ${course.lifecycle}` });
    }
    await localDb.prepare("UPDATE courses SET lifecycle = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(courseId);
    return res.json({ message: "Course successfully opened!", course: await courseExists(courseId) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ===== Home weekly loop =====
// Driven by resolved dates: the current module is the one whose week contains today, and
// the "beat" comes from its items' release and due dates (not from the day of the week).
const SOON_DAYS = 2;

router.get("/:id/home-loop", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    // Ungraded counts and setup warnings are class-wide teacher data.
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const tl = await loadCourseTimeline(courseId);
    const today = tl.today;
    const dated = tl.modules.filter((m) => m.startDate)
      .filter((m) => isTeacher || Number(m.published) === 1)
      .sort((x, y) => (x.startDate < y.startDate ? -1 : x.startDate > y.startDate ? 1 : x.position - y.position));
    const current = dated.find((m) => m.startDate <= today && today <= m.endDate)
      || [...dated].reverse().find((m) => m.endDate < today && !dated.some((n) => n.startDate > today))
      || dated.find((m) => m.startDate > today)
      || null;

    const visibleItems = tl.items.filter((i) => i.item_type !== "sub_header" && (isTeacher || Number(i.published) === 1));
    const inCurrent = current ? visibleItems.filter((i) => Number(i.module_id) === Number(current.id)) : [];
    const soon = addDays(today, SOON_DAYS);
    const label = (m) => (m.kind === "baseline" ? "Baseline week" : `Week ${m.week_offset}`);

    // Ungraded work whose due date has passed, anywhere in the course.
    let ungradedCount = 0;
    if (isTeacher) {
      const row = await localDb.prepare(`
        SELECT COUNT(*) AS c FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
        WHERE a.course_id = ? AND s.grade IS NULL
      `).get(courseId);
      ungradedCount = Number(row?.c || 0);
    }
    const releasingUnpublished = inCurrent.filter((i) => Number(i.published) !== 1 && i.releaseDate && i.releaseDate <= soon);
    const openNow = inCurrent.filter((i) => i.status === "open" && i.dueDate);
    const nextDue = openNow.map((i) => i.dueDate).sort()[0];

    let beat = "prepare";
    let beatTitle;
    let primaryAction = { label: "Open Modules", href: `/course/${courseId}/modules` };
    if (!tl.startDate) {
      beatTitle = "Set the course start date to place each week on the calendar";
      primaryAction = { label: "Open Settings", href: `/course/${courseId}/settings` };
    } else if (!current) {
      beatTitle = "Add a module to start planning the weeks";
    } else if (isTeacher && ungradedCount > 0) {
      beat = "grade";
      beatTitle = `${ungradedCount} submission${ungradedCount === 1 ? "" : "s"} waiting to be graded`;
      primaryAction = { label: "Open Grades", href: `/course/${courseId}/grades` };
    } else if (today < current.startDate) {
      beatTitle = `${label(current)} starts on ${current.startDate}`;
    } else if (isTeacher && releasingUnpublished.length > 0) {
      beatTitle = `${releasingUnpublished.length} item${releasingUnpublished.length === 1 ? "" : "s"} in ${label(current)} release by ${soon} but aren't published`;
    } else if (openNow.length > 0) {
      beat = "collect";
      beatTitle = `${label(current)}: ${openNow.length} item${openNow.length === 1 ? "" : "s"} open, next due ${nextDue}`;
      primaryAction = isTeacher
        ? { label: "Check Submissions", href: `/course/${courseId}/grades` }
        : { label: "Open Calendar", href: `/course/${courseId}/calendar` };
    } else if (today > current.endDate || (inCurrent.length > 0 && inCurrent.every((i) => !i.dueDate || i.dueDate < today))) {
      beat = "review";
      beatTitle = `${label(current)} is finished: review progress before the next week`;
      primaryAction = { label: "View Outcomes", href: `/course/${courseId}/outcomes` };
    } else {
      beat = "release";
      beatTitle = `${label(current)} is live`;
    }

    const needsAttention = [];
    if (isTeacher) {
      if (!tl.startDate) {
        needsAttention.push({ id: "no-start-date", title: "The course has no start date, so nothing has a date yet", actionLabel: "Set Start Date", href: `/course/${courseId}/settings` });
      }
      const untagged = await localDb.prepare(`
        SELECT COUNT(*) AS c FROM module_items mi
        JOIN modules m ON m.id = mi.module_id
        LEFT JOIN quizzes q ON mi.item_type = 'quiz' AND q.id = mi.content_id
        WHERE m.course_id = ? AND mi.item_type IN ('assignment', 'quiz') AND COALESCE(q.kind, 'graded') <> 'practice'
          AND NOT EXISTS (SELECT 1 FROM item_outcomes io WHERE io.item_type = mi.item_type AND io.item_id = mi.content_id)
      `).get(courseId);
      if (Number(untagged?.c) > 0) {
        needsAttention.push({ id: "missing-outcomes", title: `${untagged.c} graded item(s) missing outcome tags`, actionLabel: "Tag Outcomes", href: `/course/${courseId}/modules` });
      }
      if (releasingUnpublished.length > 0) {
        needsAttention.push({ id: "release-soon", title: `${releasingUnpublished.length} item(s) release by ${soon} but aren't published`, actionLabel: "Review Items", href: `/course/${courseId}/modules` });
      }
      const unassigned = tl.items.filter((i) => tl.modules.find((m) => Number(m.id) === Number(i.module_id))?.kind === "unassigned").length;
      if (unassigned > 0) {
        needsAttention.push({ id: "unassigned", title: `${unassigned} item(s) are not in a week yet`, actionLabel: "Move Items", href: `/course/${courseId}/modules` });
      }
    }

    const timeline = tl.modules
      .filter((m) => m.kind !== "unassigned" && (isTeacher || Number(m.published) === 1))
      .map((m) => ({
        ...m,
        resolvedStartDate: m.startDate,
        resolvedEndDate: m.endDate,
        isCurrent: current ? Number(m.id) === Number(current.id) : false,
      }));

    return res.json({
      today,
      startDate: tl.startDate,
      currentBeat: beat,
      currentWeekNumber: current ? Number(current.week_offset) : null,
      currentModuleId: current?.id ?? null,
      beatTitle,
      primaryAction,
      needsAttention,
      timeline,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
