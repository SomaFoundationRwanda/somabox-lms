// Relative timing, setup status, opening a course, and the Home weekly loop.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  isTeacherRole,
  requireTeacher,
  requireEnrolled,
  courseExists,
} from "./shared.js";

const router = express.Router();

// ==========================================
// RELATIVE TIMING & OUTCOME MASTERY ENGINE
// ==========================================

export function computeResolvedDate(baseDateIso, weekOffset = 0, dayOffset = 0) {
  const base = baseDateIso ? new Date(baseDateIso) : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString();
  const totalDays = (Number(weekOffset) || 0) * 7 + (Number(dayOffset) || 0);
  const resolved = new Date(base.getTime() + totalDays * 86400000);
  return resolved.toISOString();
}


// Shift timeline (start date or single module)
router.patch("/:id/shift-timeline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const shiftDays = Number(req.body.shiftDays) || 0;
    const fromModuleId = req.body.fromModuleId ? Number(req.body.fromModuleId) : null;

    if (fromModuleId) {
      const targetMod = await localDb.prepare("SELECT position FROM modules WHERE id = ? AND course_id = ?").get(fromModuleId, courseId);
      if (targetMod) {
        const mods = await localDb.prepare("SELECT id FROM modules WHERE course_id = ? AND position >= ?").all(courseId, targetMod.position);
        for (const m of mods) {
          await localDb.prepare("UPDATE modules SET day_offset = COALESCE(day_offset, 0) + ? WHERE id = ?").run(shiftDays, m.id);
        }
      }
    } else {
      const curStart = course.start_date ? new Date(course.start_date) : new Date();
      const newStart = new Date(curStart.getTime() + shiftDays * 86400000).toISOString();
      await localDb.prepare("UPDATE courses SET start_date = ? WHERE id = ?").run(newStart, courseId);
    }

    return res.json({ message: `Shifted timeline by ${shiftDays} days`, course: await courseExists(courseId) });
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

// Opened Course Weekly Loop API (Home Screen Data Driver)
router.get("/:id/home-loop", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    // Ungraded counts and missing-tag warnings are class-wide teacher data.
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const startDateIso = course.start_date || course.created_at || new Date().toISOString();
    const startDate = new Date(startDateIso);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / 86400000);
    const currentWeekNumber = Math.max(0, Math.floor(daysDiff / 7));

    const rawModules = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY week_offset ASC, position ASC").all(courseId);
    const currentModule = rawModules.find(m => Number(m.week_offset) === currentWeekNumber) || rawModules[0] || null;

    let beat = "prepare";
    let beatTitle = `Week ${currentWeekNumber || 1} is empty / needs preparation`;
    let primaryAction = { label: "Fill Module & Add Items", href: `/course/${courseId}/modules` };

    if (currentModule) {
      const dayInWeek = ((daysDiff % 7) + 7) % 7;
      const items = await localDb.prepare("SELECT * FROM module_items WHERE module_id = ?").all(currentModule.id);
      
      let ungradedCount = 0;
      for (const item of isTeacher ? items : []) {
        if (item.item_type === 'assignment' && item.content_id) {
          const uRow = await localDb.prepare("SELECT COUNT(*) AS c FROM assignment_submissions WHERE assignment_id = ? AND grade IS NULL").get(item.content_id);
          ungradedCount += Number(uRow?.c || 0);
        }
      }

      if (ungradedCount > 0) {
        beat = "grade";
        beatTitle = `${ungradedCount} ungraded submission${ungradedCount === 1 ? "" : "s"} need rubric scoring`;
        primaryAction = { label: "Launch Rubric Grading", href: `/course/${courseId}/grades` };
      } else if (dayInWeek <= 1) {
        beat = "prepare";
        beatTitle = `Week ${currentWeekNumber} Prepare Phase: Review module items and AI drafts`;
        primaryAction = { label: "Review & Fill Week", href: `/course/${courseId}/modules` };
      } else if (dayInWeek === 2) {
        beat = "release";
        beatTitle = `Week ${currentWeekNumber} is live for students`;
        primaryAction = { label: "View Live Timeline", href: `/course/${courseId}/modules` };
      } else if (dayInWeek <= 5) {
        beat = "collect";
        beatTitle = `Week ${currentWeekNumber} Active Submissions & Participation`;
        primaryAction = { label: "Check Student Submissions", href: `/course/${courseId}/grades` };
      } else {
        beat = "review";
        beatTitle = `End of Week ${currentWeekNumber}: Review outcome mastery vs baseline`;
        primaryAction = { label: "View Outcome Pulse", href: `/course/${courseId}/outcomes` };
      }
    }

    const needsAttention = [];
    const itemsWithoutOutcomes = !isTeacher ? [] : await localDb.prepare(`
      SELECT mi.id, mi.title, mi.item_type
      FROM module_items mi
      JOIN modules m ON m.id = mi.module_id
      LEFT JOIN item_outcomes io ON io.item_type = mi.item_type AND io.item_id = mi.content_id
      WHERE m.course_id = ? AND io.id IS NULL AND mi.item_type IN ('assignment', 'quiz')
    `).all(courseId);

    if (itemsWithoutOutcomes.length > 0) {
      needsAttention.push({
        id: "missing-outcomes",
        title: `${itemsWithoutOutcomes.length} graded item(s) missing outcome tags`,
        actionLabel: "Tag Outcomes",
        href: `/course/${courseId}/modules`
      });
    }

    const timeline = rawModules.map(m => {
      const resolvedStart = computeResolvedDate(startDateIso, m.week_offset, m.day_offset);
      const isCurrent = Number(m.week_offset) === currentWeekNumber;
      return {
        ...m,
        resolvedStartDate: resolvedStart,
        isCurrent
      };
    });

    return res.json({
      currentBeat: beat,
      currentWeekNumber,
      beatTitle,
      primaryAction,
      needsAttention,
      timeline
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
