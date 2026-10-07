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
  normalizeDueAt,
  calculateEstimatedReadMinutes,
  syncPageFileReferences,
  CONTENT_TABLE_MAP,
  upload,
} from "./shared.js";

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
            };
            if (item.item_type === 'assignment' && item.content_ref_id) {
              const assignment = await localDb.prepare("SELECT due_at, points_possible FROM assignments WHERE id = ?").get(item.content_ref_id);
              if (assignment) {
                enriched.due_at = assignment.due_at;
                enriched.points_possible = assignment.points_possible;
              }
            }
            if (item.item_type === 'quiz' && item.content_ref_id) {
              const quiz = await localDb.prepare("SELECT due_at FROM quizzes WHERE id = ?").get(item.content_ref_id);
              if (quiz) enriched.due_at = quiz.due_at;
            }
            if (item.item_type === 'file' && item.content_ref_id) {
              const file = await localDb.prepare("SELECT original_name, filename, content_type FROM course_files WHERE id = ?").get(item.content_ref_id);
              if (file) {
                enriched.original_name = file.original_name;
                enriched.filename = file.filename;
                enriched.content_type = file.content_type;
              }
            }
            return enriched;
          }));
        return { ...moduleRow, published: Number(moduleRow.published) === 1, items };
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

    const maxPosition = Number((await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM modules WHERE course_id = ?").get(courseId))?.m ?? -1);

    const info = await localDb.prepare(`
      INSERT INTO modules (course_id, title, description, position, published, due_at, created_by_teacher_email)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(courseId, title, req.body.description || "", maxPosition + 1, normalizeDueAt(req.body.dueAt), auth.email);

    return res.status(201).json({ id: Number(info.lastInsertRowid), title, position: maxPosition + 1 });
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

    const { title, description, published, position, dueAt } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (position !== undefined) { updates.push("position = ?"); params.push(Number(position)); }
    if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.moduleId, courseId);
    await localDb.prepare(`UPDATE modules SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);

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

    await localDb.prepare("DELETE FROM modules WHERE id = ? AND course_id = ?").run(req.params.moduleId, courseId);
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

    const maxPosition = Number((await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleRow.id))?.m ?? -1);

    // Sub-header: no content record
    if (itemType === 'sub_header') {
      const info = await localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, 'sub_header', NULL, ?, ?, ?, 1, NULL, NULL)
      `).run(moduleRow.id, title, maxPosition + 1, indentLevel);

      return res.status(201).json({
        id: Number(info.lastInsertRowid), itemType: 'sub_header', title,
        position: maxPosition + 1, indent_level: indentLevel, content_ref_id: null
      });
    }

    // All other types: create content record + module item in a transaction
    const createItemTx = localDb.transaction(async () => {
      let contentRefId;
      let contentRefTable = CONTENT_TABLE_MAP[itemType];

      if (itemType === 'page') {
        const bodyJsonStr = req.body.bodyJson ? (typeof req.body.bodyJson === 'string' ? req.body.bodyJson : JSON.stringify(req.body.bodyJson)) : null;
        const readMins = calculateEstimatedReadMinutes(bodyJsonStr, req.body.bodyHtml, req.body.body);
        const r = await localDb.prepare(`
          INSERT INTO course_pages (course_id, title, body, body_json, body_html, estimated_read_minutes, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.body || "", bodyJsonStr, req.body.bodyHtml || null, readMins, auth.email);
        contentRefId = Number(r.lastInsertRowid);
        await syncPageFileReferences(contentRefId, bodyJsonStr);
      } else if (itemType === 'assignment') {
        const r = await localDb.prepare(`
          INSERT INTO assignments (course_id, title, description, due_at, points_possible, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), Number(req.body.pointsPossible) || 100, auth.email);
        contentRefId = Number(r.lastInsertRowid);
      } else if (itemType === 'quiz') {
        const r = await localDb.prepare(`
          INSERT INTO quizzes (course_id, title, description, due_at, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), auth.email);
        contentRefId = Number(r.lastInsertRowid);

        // Insert quiz questions if provided
        const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
        const insertQuestion = await localDb.prepare(`
          INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        questions.forEach((q, idx) => {
          const opts = Array.isArray(q.options) ? JSON.stringify(q.options) : JSON.stringify([]);
          insertQuestion.run(
            contentRefId, idx,
            String(q?.prompt || "").trim() || "Untitled question",
            q?.questionType === "open" ? "open" : "multiple_choice",
            opts,
            q?.correctOption || null,
            Number(q?.points) || 1
          );
        });
      } else if (itemType === 'discussion') {
        const r = await localDb.prepare(`
          INSERT INTO discussions (course_id, title, body, published, created_by_teacher_email)
          VALUES (?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.body || "", auth.email);
        contentRefId = Number(r.lastInsertRowid);
      } else {
        // file type handled by separate upload endpoint
        throw new Error("Use POST /:id/modules/:moduleId/items/file for file uploads");
      }

      const info = await localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(moduleRow.id, itemType, contentRefId, title, maxPosition + 1, indentLevel, contentRefTable, contentRefId);

      return { moduleItemId: Number(info.lastInsertRowid), contentRefId, contentRefTable };
    });

    const result = await createItemTx();
    return res.status(201).json({
      id: result.moduleItemId, itemType, title, position: maxPosition + 1,
      indent_level: indentLevel, content_ref_id: result.contentRefId, content_ref_table: result.contentRefTable
    });
  } catch (error) {
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
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, 'file', ?, ?, ?, ?, 0, 'course_files', ?)
      `).run(moduleRow.id, fileId, title, maxPosition + 1, indentLevel, fileId);

      return { moduleItemId: Number(itemInfo.lastInsertRowid), fileId, position: maxPosition + 1 };
    });

    const result = await createFileTx();
    return res.status(201).json({
      id: result.moduleItemId, itemType: 'file', title, position: result.position,
      indent_level: indentLevel, content_ref_id: result.fileId, content_ref_table: 'course_files',
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

    const { published, position, title, indentLevel } = req.body;
    const updates = [];
    const params = [];
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (position !== undefined) { updates.push("position = ?"); params.push(Number(position)); }
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (indentLevel !== undefined) { updates.push("indent_level = ?"); params.push(Math.min(3, Math.max(0, Number(indentLevel)))); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    if (!await getCourseModuleItem(courseId, req.params.itemId)) return res.status(404).json({ message: "Module item not found" });
    params.push(req.params.itemId);
    await localDb.prepare(`UPDATE module_items SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.itemId));
  } catch (error) {
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

    const contentId = item.content_ref_id || item.item_ref_id;
    if (!contentId) return res.status(400).json({ message: "No content record linked" });

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
      const { title, description, dueAt, pointsPossible, published } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (description !== undefined) { updates.push("description = ?"); params.push(description); }
      if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
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
      const { title, description, dueAt, published, questions } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (description !== undefined) { updates.push("description = ?"); params.push(description); }
      if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        await localDb.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      // Replace quiz questions if provided
      if (Array.isArray(questions)) {
        await localDb.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(contentId);
        const insertQ = await localDb.prepare(`
          INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        questions.forEach((q, idx) => {
          insertQ.run(
            contentId, idx,
            String(q?.prompt || "").trim() || "Untitled question",
            q?.questionType === "open" ? "open" : "multiple_choice",
            JSON.stringify(Array.isArray(q?.options) ? q.options : []),
            q?.correctOption || null,
            Number(q?.points) || 1
          );
        });
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

    if (mode === 'delete_permanently' && item.item_type !== 'sub_header') {
      const contentId = item.content_ref_id || item.item_ref_id;
      if (contentId) {
        const tableMap = {
          page: { table: 'course_pages', idCol: 'id', courseCol: 'course_id' },
          assignment: { table: 'assignments', idCol: 'id', courseCol: 'course_id' },
          quiz: { table: 'quizzes', idCol: 'id', courseCol: 'course_id' },
          file: { table: 'course_files', idCol: 'id', courseCol: 'course_id' },
          discussion: { table: 'discussions', idCol: 'id', courseCol: 'course_id' },
        };
        const mapping = tableMap[item.item_type];
        if (mapping) {
          await localDb.prepare(`DELETE FROM ${mapping.table} WHERE ${mapping.idCol} = ? AND ${mapping.courseCol} = ?`).run(contentId, courseId);
        }
      }
    }

    await localDb.prepare("DELETE FROM module_items WHERE id = ?").run(req.params.itemId);
    return res.status(204).end();
  } catch (error) {
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
      if (item.item_type === "page" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/pages/${item.content_ref_id}`;
      } else if (item.item_type === "assignment" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/assignments/${item.content_ref_id}`;
      } else if (item.item_type === "quiz" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/quizzes/${item.content_ref_id}`;
      } else if (item.item_type === "discussion" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/discussions/${item.content_ref_id}`;
      } else if (item.item_type === "file") {
        targetUrl = `/course/${courseId}/files`;
      }

      sequence.push({
        module_item_id: item.id,
        module_id: mod.id,
        item_type: item.item_type,
        content_ref_id: item.content_ref_id,
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

    const { moduleItemId, itemType, contentRefId } = req.query;
    let idx = -1;

    if (moduleItemId) {
      idx = sequence.findIndex((s) => String(s.module_item_id) === String(moduleItemId));
    } else if (itemType && contentRefId) {
      idx = sequence.findIndex(
        (s) => s.item_type === itemType && String(s.content_ref_id) === String(contentRefId)
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
