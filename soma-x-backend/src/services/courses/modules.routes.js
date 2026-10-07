// Modules, module items, item sequence, and progress.
import express from "express";
import fs from "fs";
import path from "path";
import { localDb } from "../../helpers/db-manager.js";
import { config } from "../../config/index.js";
import {
  isTeacherRole,
  requireTeacher,
  requireEnrolled,
  requireNavVisible,
  getCourseModuleItem,
  courseExists,
  calculateEstimatedReadMinutes,
  syncPageFileReferences,
  upload,
} from "./shared.js";
import {
  CONTENT_TABLES,
  OUTCOME_REQUIRED_MESSAGE,
  createModuleContent,
  deleteContent,
  getUnassignedModule,
  moveContentToModule,
  needsOutcomeBeforePublish,
  replaceQuizQuestions,
  sendItemError,
  updateItemDays,
} from "./items.js";
import { datesPayload, loadCourseTimeline, parseItemDays, refreshDueDates } from "./schedule.js";

const router = express.Router();

// Reorder routes must be registered before "/:moduleId" and "/items/:itemId", or
// "reorder" is captured as an id and these handlers never run.
// Batch reorder modules
router.patch("/:id/modules/reorder", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const moduleIds = Array.isArray(req.body.moduleIds) ? req.body.moduleIds : [];
    if (!moduleIds.length) return res.status(400).json({ message: "moduleIds array is required" });

    const updatePos = await localDb.prepare("UPDATE modules SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND course_id = ?");
    const tx = localDb.transaction(async (ids) => {
      for (const [index, id] of ids.entries()) await updatePos.run(index, id, courseId);
    });
    await tx(moduleIds);

    return res.json({ message: "Modules reordered" });
  } catch (error) {
    console.error("Error reordering modules:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Batch reorder items within a module
router.patch("/:id/modules/:moduleId/items/reorder", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds : [];
    if (!itemIds.length) return res.status(400).json({ message: "itemIds array is required" });

    const moduleRow = await localDb.prepare("SELECT id FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });

    const updatePos = await localDb.prepare("UPDATE module_items SET position = ? WHERE id = ? AND module_id = ?");
    const tx = localDb.transaction(async (ids) => {
      for (const [index, id] of ids.entries()) await updatePos.run(index, id, moduleRow.id);
    });
    await tx(itemIds);

    return res.json({ message: "Items reordered" });
  } catch (error) {
    console.error("Error reordering items:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Modules =====

router.get("/:id/modules", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "modules");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const modules = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC").all(courseId);
    // Resolved dates and statuses (from the course start date and each item's day offsets).
    const tl = await loadCourseTimeline(courseId);
    const moduleDates = new Map(tl.modules.map((m) => [Number(m.id), m]));
    const itemDates = new Map(tl.items.map((i) => [Number(i.id), i]));
    const result = await Promise.all(modules
      .filter((m) => isTeacher || Number(m.published) === 1)
      .map(async (moduleRow) => {
        const rawItems = await localDb.prepare("SELECT * FROM module_items WHERE module_id = ? ORDER BY position ASC").all(moduleRow.id);
        const items = await Promise.all(rawItems
          .filter((item) => isTeacher || Number(item.published) === 1)
          .map(async (item) => {
            const enriched = {
              ...item,
              published: Number(item.published) === 1,
              indent_level: Number(item.indent_level) || 0,
              ...datesPayload(itemDates.get(Number(item.id)) || {}),
            };
            if (item.item_type === 'assignment' && item.content_id) {
              const assignment = await localDb.prepare("SELECT due_at, points_possible FROM assignments WHERE id = ?").get(item.content_id);
              if (assignment) {
                enriched.due_at = assignment.due_at;
                enriched.points_possible = assignment.points_possible;
              }
            }
            if (item.item_type === 'quiz' && item.content_id) {
              const quiz = await localDb.prepare("SELECT due_at, kind FROM quizzes WHERE id = ?").get(item.content_id);
              if (quiz) {
                enriched.due_at = quiz.due_at;
                enriched.quiz_kind = quiz.kind;
              }
            }
            if (['assignment', 'quiz', 'page', 'discussion'].includes(item.item_type) && item.content_id) {
              enriched.outcomes = await localDb.prepare(`
                SELECT o.id, o.code, o.title FROM item_outcomes io JOIN outcomes o ON o.id = io.outcome_id
                WHERE io.item_type = ? AND io.item_id = ? ORDER BY o.id
              `).all(item.item_type, item.content_id);
            }
            if (item.item_type === 'file' && item.content_id) {
              const file = await localDb.prepare("SELECT original_name, filename, content_type FROM course_files WHERE id = ?").get(item.content_id);
              if (file) {
                enriched.original_name = file.original_name;
                enriched.filename = file.filename;
                enriched.content_type = file.content_type;
              }
            }
            return enriched;
          }));
        const dates = moduleDates.get(Number(moduleRow.id)) || {};
        return {
          ...moduleRow,
          published: Number(moduleRow.published) === 1,
          startDate: dates.startDate ?? null,
          endDate: dates.endDate ?? null,
          status: dates.status ?? "undated",
          items,
        };
      }));

    return res.json(result);
  } catch (error) {
    console.error("Error fetching modules:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/modules", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    // "baseline" is the course's Week 0 (at most one). Everything else is a regular week.
    const kind = req.body.kind === "baseline" ? "baseline" : "regular";
    if (kind === "baseline") {
      const existing = await localDb.prepare("SELECT id FROM modules WHERE course_id = ? AND kind = 'baseline'").get(courseId);
      if (existing) return res.status(409).json({ message: "This course already has a baseline (Week 0) module" });
    }
    let weekOffset = 0;
    if (kind === "regular") {
      const requested = Number(req.body.weekOffset);
      if (req.body.weekOffset !== undefined && (!Number.isInteger(requested) || requested < 1)) {
        return res.status(400).json({ message: "weekOffset must be a whole number of 1 or more (week 0 is the baseline module)" });
      }
      const lastWeek = Number((await localDb.prepare("SELECT COALESCE(MAX(week_offset), 0) AS w FROM modules WHERE course_id = ? AND kind = 'regular'").get(courseId))?.w ?? 0);
      weekOffset = req.body.weekOffset !== undefined ? requested : lastWeek + 1;
    }

    // New modules go before the "Unassigned (fix me)" holding module, which stays last.
    const maxPosition = Number((await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM modules WHERE course_id = ? AND kind <> 'unassigned'").get(courseId))?.m ?? -1);

    const info = await localDb.prepare(`
      INSERT INTO modules (course_id, title, description, position, published, created_by_teacher_email, kind, week_offset, day_offset)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0)
    `).run(courseId, title, req.body.description || "", maxPosition + 1, auth.email, kind, weekOffset);
    await refreshDueDates(courseId);

    return res.status(201).json({ id: Number(info.lastInsertRowid), title, position: maxPosition + 1, kind, week_offset: weekOffset });
  } catch (error) {
    console.error("Error creating module:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/modules/:moduleId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const moduleRow = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });

    const { title, description, published, position, weekOffset, dayOffset } = req.body;
    const updates = [];
    const params = [];
    if (weekOffset !== undefined) {
      const week = Number(weekOffset);
      if (moduleRow.kind !== "regular") return res.status(400).json({ message: "Only regular modules have a week number" });
      if (!Number.isInteger(week) || week < 1) return res.status(400).json({ message: "weekOffset must be a whole number of 1 or more (week 0 is the baseline module)" });
      updates.push("week_offset = ?"); params.push(week);
    }
    if (dayOffset !== undefined) {
      const day = Number(dayOffset);
      if (moduleRow.kind === "unassigned") return res.status(400).json({ message: "The Unassigned module has no dates" });
      if (!Number.isInteger(day) || day < 0 || day > 6) return res.status(400).json({ message: "dayOffset must be 0-6 (days into the module's week)" });
      updates.push("day_offset = ?"); params.push(day);
    }
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (position !== undefined) { updates.push("position = ?"); params.push(Number(position)); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.moduleId, courseId);
    await localDb.prepare(`UPDATE modules SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    if (weekOffset !== undefined || dayOffset !== undefined) await refreshDueDates(courseId);

    return res.json(await localDb.prepare("SELECT * FROM modules WHERE id = ?").get(req.params.moduleId));
  } catch (error) {
    console.error("Error updating module:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/modules/:moduleId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const moduleRow = await localDb.prepare("SELECT id FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });
    // Content always belongs to a module, so a module with items can't just disappear.
    const contentCount = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM module_items WHERE module_id = ? AND item_type <> 'sub_header'").get(moduleRow.id))?.c || 0);
    if (contentCount > 0) {
      return res.status(409).json({
        message: `This module still has ${contentCount} item${contentCount === 1 ? "" : "s"}. Move or delete them first.`,
        code: "MODULE_NOT_EMPTY",
      });
    }

    await localDb.prepare("DELETE FROM modules WHERE id = ? AND course_id = ?").run(moduleRow.id, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting module:", error);
    return res.status(500).json({ message: error.message });
  }
});


// ===== Module Items =====

// Create a new module item (+ underlying content record in one transaction)
router.post("/:id/modules/:moduleId/items", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleRow = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });

    const itemType = String(req.body.itemType || "").trim();
    const title = String(req.body.title || "").trim() || "Untitled";
    const indentLevel = Math.min(3, Math.max(0, Number(req.body.indentLevel) || 0));

    if (!['page', 'assignment', 'quiz', 'file', 'discussion', 'sub_header'].includes(itemType)) {
      return res.status(400).json({ message: "Invalid itemType. Must be: page, assignment, quiz, file, discussion, or sub_header" });
    }

    // Sub-header: a label inside the module, no content record
    if (itemType === 'sub_header') {
      const maxPosition = Number((await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleRow.id))?.m ?? -1);
      const info = await localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, content_id, title, position, indent_level, published)
        VALUES (?, 'sub_header', NULL, ?, ?, ?, 1)
      `).run(moduleRow.id, title, maxPosition + 1, indentLevel);

      return res.status(201).json({
        id: Number(info.lastInsertRowid), itemType: 'sub_header', title,
        position: maxPosition + 1, indent_level: indentLevel, content_id: null
      });
    }

    if (itemType === 'file') {
      return res.status(400).json({ message: "Use POST /:id/modules/:moduleId/items/file for file uploads" });
    }

    const result = await createModuleContent({
      courseId,
      moduleId: moduleRow.id,
      itemType,
      data: { ...req.body, title },
      actorEmail: auth.email,
      publish: req.body.published !== false,
      indentLevel,
    });
    return res.status(201).json({
      id: result.moduleItemId, itemType, title, position: result.position,
      indent_level: indentLevel, content_id: result.contentId, published: result.published,
      ...(result.notice ? { notice: result.notice } : {}),
    });
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error adding module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// File upload to module — creates course_files row + module_items link
router.post("/:id/modules/:moduleId/items/file", upload.single("file"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleRow = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const title = String(req.body.title || req.file.originalname || "").trim() || "Untitled File";
    const indentLevel = Math.min(3, Math.max(0, Number(req.body.indentLevel) || 0));
    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const createFileTx = localDb.transaction(async () => {
      const fileInfo = await localDb.prepare(`
        INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);
      const fileId = Number(fileInfo.lastInsertRowid);

      const maxPosition = Number((await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleRow.id))?.m ?? -1);
      const itemInfo = await localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, content_id, title, position, indent_level, published)
        VALUES (?, 'file', ?, ?, ?, ?, 0)
      `).run(moduleRow.id, fileId, title, maxPosition + 1, indentLevel);

      return { moduleItemId: Number(itemInfo.lastInsertRowid), fileId, position: maxPosition + 1 };
    });

    const result = await createFileTx();
    return res.status(201).json({
      id: result.moduleItemId, itemType: 'file', title, position: result.position,
      indent_level: indentLevel, content_id: result.fileId,
      original_name: req.file.originalname, downloadUrl: `/course-files/${courseId}/${folder ? `${folder}/` : ''}${storedName}`
    });
  } catch (error) {
    console.error("Error uploading file to module:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Edit module item metadata (position, indent, publish, title)
router.patch("/:id/modules/:moduleId/items/:itemId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { published, position, title, indentLevel, moduleId } = req.body;
    const updates = [];
    const params = [];
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (position !== undefined) { updates.push("position = ?"); params.push(Number(position)); }
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (indentLevel !== undefined) { updates.push("indent_level = ?"); params.push(Math.min(3, Math.max(0, Number(indentLevel)))); }
    const hasDays = ["releaseDay", "dueDay", "closeDay"].some((k) => req.body[k] !== undefined);
    if (!updates.length && moduleId === undefined && !hasDays) return res.status(400).json({ message: "No fields to update" });

    const item = await getCourseModuleItem(courseId, req.params.itemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });
    if (published && item.content_id && await needsOutcomeBeforePublish(item.item_type, item.content_id)) {
      return res.status(422).json({ message: OUTCOME_REQUIRED_MESSAGE, code: "OUTCOME_REQUIRED" });
    }

    await localDb.transaction(async () => {
      if (moduleId !== undefined && Number(moduleId) !== Number(item.module_id)) {
        if (CONTENT_TABLES[item.item_type]) {
          await moveContentToModule(courseId, item.item_type, item.content_id, moduleId);
        } else {
          const target = await localDb.prepare("SELECT id FROM modules WHERE id = ? AND course_id = ?").get(moduleId, courseId);
          if (!target) throw Object.assign(new Error("Module not found"), { status: 404 });
          await localDb.prepare("UPDATE module_items SET module_id = ? WHERE id = ?").run(target.id, item.id);
        }
      }
      if (updates.length) {
        await localDb.prepare(`UPDATE module_items SET ${updates.join(", ")} WHERE id = ?`).run(...params, item.id);
      }
      if (hasDays) {
        const days = parseItemDays(item.item_type, req.body, item);
        await localDb.prepare("UPDATE module_items SET release_day = ?, due_day = ?, close_day = ? WHERE id = ?")
          .run(days.release_day, days.due_day, days.close_day, item.id);
        await refreshDueDates(courseId);
      }
      // The listing and its content are published together.
      if (published !== undefined && CONTENT_TABLES[item.item_type]) {
        await localDb.prepare(`UPDATE ${CONTENT_TABLES[item.item_type]} SET published = ? WHERE id = ? AND course_id = ?`)
          .run(published ? 1 : 0, item.content_id, courseId);
      }
    })();
    return res.json(await localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(item.id));
  } catch (error) {
    if (sendItemError(res, error)) return;
    if (error.status === 404) return res.status(404).json({ message: error.message });
    console.error("Error updating module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Edit the underlying content record of a module item
router.patch("/:id/modules/:moduleId/items/:itemId/content", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const item = await getCourseModuleItem(courseId, req.params.itemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });
    if (item.item_type === 'sub_header') return res.status(400).json({ message: "Sub-headers have no content to edit" });

    const contentId = item.content_id;
    if (!contentId) return res.status(400).json({ message: "No content record linked" });
    if (req.body.published && await needsOutcomeBeforePublish(item.item_type, contentId)) {
      return res.status(422).json({ message: OUTCOME_REQUIRED_MESSAGE, code: "OUTCOME_REQUIRED" });
    }
    // The listing and its content are published together.
    if (req.body.published !== undefined) {
      await localDb.prepare("UPDATE module_items SET published = ? WHERE id = ?").run(req.body.published ? 1 : 0, item.id);
    }
    // Release/due/close days live on the listing, whatever the content type.
    await updateItemDays(courseId, item.item_type, contentId, req.body);

    if (item.item_type === 'page') {
      const { title, body, bodyJson, bodyHtml, published } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (body !== undefined) { updates.push("body = ?"); params.push(body); }
      if (bodyJson !== undefined) { updates.push("body_json = ?"); params.push(typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)); }
      if (bodyHtml !== undefined) { updates.push("body_html = ?"); params.push(bodyHtml); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      
      const existingPage = await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(contentId);
      const newBodyJson = bodyJson !== undefined ? (typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)) : existingPage?.body_json;
      const newBodyHtml = bodyHtml !== undefined ? bodyHtml : existingPage?.body_html;
      const newBodyText = body !== undefined ? body : existingPage?.body;
      const readMins = calculateEstimatedReadMinutes(newBodyJson, newBodyHtml, newBodyText);
      updates.push("estimated_read_minutes = ?");
      params.push(readMins);

      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        await localDb.prepare(`UPDATE course_pages SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (newBodyJson) {
        await syncPageFileReferences(contentId, newBodyJson);
      }
      // Also update module item title if page title changed
      if (title !== undefined) {
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(contentId));
    }

    if (item.item_type === 'assignment') {
      const { title, description, pointsPossible, published } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (description !== undefined) { updates.push("description = ?"); params.push(description); }
      if (pointsPossible !== undefined) { updates.push("points_possible = ?"); params.push(Number(pointsPossible)); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        await localDb.prepare(`UPDATE assignments SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (title !== undefined) {
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(await localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(contentId));
    }

    if (item.item_type === 'quiz') {
      const { title, description, published, questions, kind, attemptsAllowed, timeLimitMinutes } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (description !== undefined) { updates.push("description = ?"); params.push(description); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      if (kind !== undefined) {
        if (!["baseline", "practice", "graded"].includes(kind)) return res.status(400).json({ message: "kind must be baseline, practice, or graded" });
        updates.push("kind = ?"); params.push(kind);
      }
      if (attemptsAllowed !== undefined) {
        const n = attemptsAllowed === null || attemptsAllowed === "" ? null : Number(attemptsAllowed);
        if (n !== null && (!Number.isInteger(n) || n < 1)) return res.status(400).json({ message: "attemptsAllowed must be 1 or more, or empty for unlimited" });
        updates.push("attempts_allowed = ?"); params.push(n);
      }
      if (timeLimitMinutes !== undefined) {
        const n = timeLimitMinutes === null || timeLimitMinutes === "" ? null : Number(timeLimitMinutes);
        if (n !== null && (!Number.isInteger(n) || n < 1)) return res.status(400).json({ message: "timeLimitMinutes must be 1 or more, or empty for no limit" });
        updates.push("time_limit_minutes = ?"); params.push(n);
      }
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        await localDb.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      // Replace quiz questions if provided
      if (Array.isArray(questions)) {
        await localDb.transaction(() => replaceQuizQuestions(contentId, questions, courseId))();
      }
      if (title !== undefined) {
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      const quiz = await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(contentId);
      const quizQuestions = await localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC").all(contentId);
      return res.json({ ...quiz, questions: quizQuestions });
    }

    if (item.item_type === 'discussion') {
      const { title, body, published } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (body !== undefined) { updates.push("body = ?"); params.push(body); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      if (updates.length) {
        params.push(contentId, courseId);
        await localDb.prepare(`UPDATE discussions SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (title !== undefined) {
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(await localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(contentId));
    }

    return res.status(400).json({ message: "Unsupported item type for content edit" });
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error editing module item content:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Delete module item — ?mode=remove_from_module (default) | delete_permanently
router.delete("/:id/modules/:moduleId/items/:itemId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const mode = String(req.query.mode || "remove_from_module").trim();
    const item = await getCourseModuleItem(courseId, req.params.itemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });

    // Sub-headers and file links are just listings: removing them deletes nothing else.
    if (!CONTENT_TABLES[item.item_type]) {
      await localDb.prepare("DELETE FROM module_items WHERE id = ?").run(item.id);
      return res.status(204).end();
    }

    if (mode === 'delete_permanently') {
      await deleteContent(courseId, item.item_type, item.content_id);
      return res.status(204).end();
    }

    // Content always belongs to a module: "remove from module" parks it in the course's
    // "Unassigned (fix me)" module (unpublished) instead of leaving it orphaned.
    const unassigned = await getUnassignedModule(courseId);
    if (Number(item.module_id) === Number(unassigned.id)) {
      return res.status(400).json({ message: "This item is already unassigned. Move it into a module or delete it." });
    }
    await moveContentToModule(courseId, item.item_type, item.content_id, unassigned.id);
    await localDb.prepare("UPDATE module_items SET published = 0 WHERE id = ?").run(item.id);
    await localDb.prepare(`UPDATE ${CONTENT_TABLES[item.item_type]} SET published = 0 WHERE id = ?`).run(item.content_id);
    return res.status(204).end();
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error deleting module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Module Item Navigation Sequence & Progress =====

async function getCourseSequence(courseId, isTeacher) {
  const modules = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC").all(courseId);
  const sequence = [];

  for (const mod of modules) {
    if (!isTeacher && Number(mod.published) !== 1) continue;

    const items = await localDb.prepare(
      "SELECT * FROM module_items WHERE module_id = ? AND item_type != 'sub_header' ORDER BY position ASC"
    ).all(mod.id);

    for (const item of items) {
      if (!isTeacher && Number(item.published) !== 1) continue;

      let targetUrl = "";
      if (item.item_type === "page" && item.content_id) {
        targetUrl = `/course/${courseId}/pages/${item.content_id}`;
      } else if (item.item_type === "assignment" && item.content_id) {
        targetUrl = `/course/${courseId}/assignments/${item.content_id}`;
      } else if (item.item_type === "quiz" && item.content_id) {
        targetUrl = `/course/${courseId}/quizzes/${item.content_id}`;
      } else if (item.item_type === "discussion" && item.content_id) {
        targetUrl = `/course/${courseId}/discussions/${item.content_id}`;
      } else if (item.item_type === "file") {
        targetUrl = `/course/${courseId}/files`;
      }

      sequence.push({
        module_item_id: item.id,
        module_id: mod.id,
        item_type: item.item_type,
        content_id: item.content_id,
        title: item.title,
        module_title: mod.title,
        url: targetUrl,
        published: Number(item.published) === 1,
      });
    }
  }

  return sequence;
}

router.get("/:id/module-items/sequence", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const sequence = await getCourseSequence(courseId, isTeacher);
    return res.json(sequence);
  } catch (error) {
    console.error("Error fetching sequence:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/module-items/sequence-position", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const sequence = await getCourseSequence(courseId, isTeacher);

    const { moduleItemId, itemType } = req.query;
    const contentId = req.query.contentId || req.query.contentRefId;
    let idx = -1;

    if (moduleItemId) {
      idx = sequence.findIndex((s) => String(s.module_item_id) === String(moduleItemId));
    } else if (itemType && contentId) {
      idx = sequence.findIndex(
        (s) => s.item_type === itemType && String(s.content_id) === String(contentId)
      );
    }

    if (idx === -1) {
      return res.json({ index: 0, total: sequence.length, current: null, prev: null, next: null });
    }

    return res.json({
      index: idx + 1,
      total: sequence.length,
      current: sequence[idx],
      prev: idx > 0 ? sequence[idx - 1] : null,
      next: idx < sequence.length - 1 ? sequence[idx + 1] : null,
    });
  } catch (error) {
    console.error("Error fetching sequence position:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/module-items/:moduleItemId/progress", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const item = await getCourseModuleItem(courseId, req.params.moduleItemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });

    await localDb.prepare(`
      INSERT INTO module_item_progress (module_item_id, user_email, first_viewed_at, last_viewed_at, completed_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(module_item_id, user_email) DO UPDATE SET last_viewed_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
    `).run(item.id, auth.email);

    return res.json({ message: "Progress recorded", module_item_id: item.id });
  } catch (error) {
    console.error("Error recording progress:", error);
    return res.status(500).json({ message: error.message });
  }
});


export default router;
