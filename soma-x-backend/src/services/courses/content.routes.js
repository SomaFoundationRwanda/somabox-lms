// Activity feed, announcements, syllabus, files, collaborations, pages, discussions.
import express from "express";
import { recordEditAfterPublish } from "../insights/events.js";
import fs from "fs";
import path from "path";
import { localDb } from "../../helpers/db-manager.js";
import { config } from "../../config/index.js";
import {
  normalizeEmail,
  isTeacherRole,
  requireTeacher,
  requireEnrolled,
  requireNavVisible,
  courseExists,
  linkDiscussionAssignment,
  calculateEstimatedReadMinutes,
  syncPageFileReferences,
  userFullName,
  upload,
} from "./shared.js";
import {
  OUTCOME_REQUIRED_MESSAGE,
  createModuleContent,
  deleteContent,
  needsOutcomeBeforePublish,
  sendItemError,
  syncListingPublished,
  updateItemDays,
} from "./items.js";
import { refreshDueDates } from "./schedule.js";

const router = express.Router();

// ===== Activity feed (backs the "activity" Home page type) =====

router.get("/:id/activity", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const items = [];

    const announcements = await localDb.prepare("SELECT * FROM announcements WHERE course_id = ? AND published = 1 ORDER BY created_at DESC LIMIT 10").all(courseId);
    for (const a of announcements) {
      items.push({ type: "announcement", id: a.id, summary: `New announcement: "${a.title}"`, createdAt: a.created_at });
    }

    const discussions = await localDb.prepare("SELECT * FROM discussions WHERE course_id = ? AND published = 1 ORDER BY created_at DESC LIMIT 10").all(courseId);
    for (const d of discussions) {
      items.push({ type: "discussion", id: d.id, summary: `New discussion: "${d.title}"`, createdAt: d.created_at });
    }

    if (isTeacher) {
      const recentSubmissions = await localDb.prepare(`
        SELECT s.*, a.title AS assignment_title FROM assignment_submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE a.course_id = ? ORDER BY s.submitted_at DESC LIMIT 10
      `).all(courseId);
      for (const s of recentSubmissions) {
        items.push({ type: "grade", id: s.id, summary: `${await userFullName(s.scholar_email)} submitted "${s.assignment_title}"`, createdAt: s.submitted_at });
      }
    } else {
      const myGraded = await localDb.prepare(`
        SELECT s.*, a.title AS assignment_title FROM assignment_submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE a.course_id = ? AND LOWER(s.scholar_email) = LOWER(?) AND s.graded_at IS NOT NULL
        ORDER BY s.graded_at DESC LIMIT 10
      `).all(courseId, auth.email);
      for (const s of myGraded) {
        items.push({ type: "grade", id: s.id, summary: `"${s.assignment_title}" was graded: ${s.grade}`, createdAt: s.graded_at });
      }
    }

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(items.slice(0, 20));
  } catch (error) {
    console.error("Error fetching activity:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Announcements =====

router.get("/:id/announcements", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "announcements");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawAnnouncements = await localDb.prepare("SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const rows = rawAnnouncements.filter((a) => isTeacher || Number(a.published) === 1);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching announcements:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/announcements", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = await localDb.prepare(`INSERT INTO announcements (course_id, title, body, published, created_by_teacher_email) VALUES (?, ?, ?, 1, ?)`)
      .run(courseId, title, req.body.body || "", auth.email);
    return res.status(201).json(await localDb.prepare("SELECT * FROM announcements WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/announcements/:announcementId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, body, published, pinned } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (body !== undefined) { updates.push("body = ?"); params.push(body); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (pinned !== undefined) { updates.push("pinned = ?"); params.push(pinned ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.announcementId, courseId);
    await localDb.prepare(`UPDATE announcements SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM announcements WHERE id = ?").get(req.params.announcementId));
  } catch (error) {
    console.error("Error updating announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/announcements/:announcementId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM announcements WHERE id = ? AND course_id = ?").run(req.params.announcementId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Syllabus =====

router.get("/:id/syllabus", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "syllabus");
    if (!auth) return;

    const dueDates = await localDb.prepare("SELECT id, title, due_at, points_possible FROM assignments WHERE course_id = ? AND due_at IS NOT NULL AND published = 1 ORDER BY due_at ASC").all(courseId);
    const quizDueDates = await localDb.prepare("SELECT id, title, due_at FROM quizzes WHERE course_id = ? AND due_at IS NOT NULL AND published = 1 ORDER BY due_at ASC").all(courseId);

    return res.json({
      body: course.syllabus_body || "",
      schedule: [
        ...dueDates.map((d) => ({ kind: "assignment", ...d })),
        ...quizDueDates.map((d) => ({ kind: "quiz", ...d, points_possible: null })),
      ].sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
    });
  } catch (error) {
    console.error("Error fetching syllabus:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/syllabus", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    await localDb.prepare("UPDATE courses SET syllabus_body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.body.body || "", courseId);
    return res.json({ message: "Syllabus updated" });
  } catch (error) {
    console.error("Error updating syllabus:", error);
    return res.status(500).json({ message: error.message });
  }
});


// ===== Files =====

router.get("/:id/files", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireNavVisible(req, res, courseId, "files")) return;

    const rawFiles = await localDb.prepare("SELECT * FROM course_files WHERE course_id = ? ORDER BY uploaded_at DESC").all(courseId);
    const rows = rawFiles.map((f) => ({
      ...f,
      downloadUrl: f.filename.startsWith("lessons/") ? `/${f.filename}` : `/course-files/${courseId}/${f.filename}`,
    }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching files:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/files/upload", upload.single("file"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const info = await localDb.prepare(`
      INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);

    const fileRecord = await localDb.prepare("SELECT * FROM course_files WHERE id = ?").get(info.lastInsertRowid);
    const downloadUrl = `/course-files/${courseId}/${fileRecord.filename}`;

    return res.status(201).json({
      file_id: fileRecord.id,
      fileId: fileRecord.id,
      url: downloadUrl,
      downloadUrl,
      mime_type: fileRecord.content_type,
      original_name: fileRecord.original_name,
      size: req.file.size || 0,
    });
  } catch (error) {
    console.error("Error uploading file to editor:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/files", upload.single("file"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const info = await localDb.prepare(`
      INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);

    const fileRecord = await localDb.prepare("SELECT * FROM course_files WHERE id = ?").get(info.lastInsertRowid);
    return res.status(201).json({
      ...fileRecord,
      downloadUrl: `/course-files/${courseId}/${fileRecord.filename}`,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/files/:fileId/usage", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const usedInPages = await localDb.prepare(`
      SELECT p.id, p.title
      FROM page_file_references r
      JOIN course_pages p ON r.page_id = p.id
      WHERE r.file_id = ? AND p.course_id = ?
    `).all(req.params.fileId, courseId);

    return res.json({ fileId: Number(req.params.fileId), usedInPages });
  } catch (error) {
    console.error("Error checking file usage:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/files/:fileId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const force = String(req.query.force || "").toLowerCase() === "true";
    const usedInPages = await localDb.prepare(`
      SELECT p.id, p.title
      FROM page_file_references r
      JOIN course_pages p ON r.page_id = p.id
      WHERE r.file_id = ? AND p.course_id = ?
    `).all(req.params.fileId, courseId);

    if (usedInPages.length > 0 && !force) {
      return res.status(409).json({
        message: `This file is currently used in ${usedInPages.length} page(s).`,
        usedInPages,
      });
    }

    const file = await localDb.prepare("SELECT filename FROM course_files WHERE id = ? AND course_id = ?").get(req.params.fileId, courseId);
    await localDb.prepare("DELETE FROM page_file_references WHERE file_id = ?").run(req.params.fileId);
    await localDb.prepare("DELETE FROM course_files WHERE id = ? AND course_id = ?").run(req.params.fileId, courseId);
    // Remove the upload from disk too, unless it's shared lesson content or another record uses it.
    if (file?.filename && !file.filename.startsWith("lessons/")) {
      const stillUsed = await localDb.prepare("SELECT 1 FROM course_files WHERE course_id = ? AND filename = ?").get(courseId, file.filename);
      const courseDir = path.resolve(config.paths.courseFiles, courseId);
      const target = path.resolve(courseDir, file.filename);
      if (!stillUsed && target.startsWith(courseDir + path.sep)) fs.rmSync(target, { force: true });
    }
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Collaborations =====
// A shared-link registry (title + external URL, optionally scoped to specific
// members) — intentionally simple, not embedded real-time editing.

router.get("/:id/collaborations", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "collaborations");
    if (!auth) return;

    const rows = await localDb.prepare("SELECT * FROM collaborations WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const memberStmt = await localDb.prepare("SELECT user_email FROM collaboration_members WHERE collaboration_id = ?");
    const visible = (await Promise.all(rows.map(async (c) => {
      const memberRows = await memberStmt.all(c.id);
      const members = memberRows.map((m) => m.user_email);
      return { ...c, memberCount: members.length, members };
    }))).filter((c) => isTeacherRole(auth.enrollment.role) || c.memberCount === 0 || c.members.some((m) => m.toLowerCase() === auth.email.toLowerCase()) || normalizeEmail(c.created_by_teacher_email) === auth.email);

    return res.json(visible.map(({ members, ...rest }) => rest));
  } catch (error) {
    console.error("Error fetching collaborations:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/collaborations", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = await localDb.prepare("INSERT INTO collaborations (course_id, title, url, created_by_teacher_email) VALUES (?, ?, ?, ?)")
      .run(courseId, title, req.body.url || "", auth.email);
    const collaborationId = Number(info.lastInsertRowid);

    const memberEmails = Array.isArray(req.body.memberEmails) ? req.body.memberEmails : [];
    const insertMember = await localDb.prepare("INSERT OR IGNORE INTO collaboration_members (collaboration_id, user_email) VALUES (?, ?)");
    memberEmails.forEach((email) => {
      const normalized = normalizeEmail(email);
      if (normalized) insertMember.run(collaborationId, normalized);
    });

    return res.status(201).json(await localDb.prepare("SELECT * FROM collaborations WHERE id = ?").get(collaborationId));
  } catch (error) {
    console.error("Error creating collaboration:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/collaborations/:collaborationId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const collaboration = await localDb.prepare("SELECT * FROM collaborations WHERE id = ? AND course_id = ?").get(req.params.collaborationId, courseId);
    if (!collaboration) return res.status(404).json({ message: "Collaboration not found" });

    const isOwner = normalizeEmail(collaboration.created_by_teacher_email) === auth.email;
    if (!isOwner && !isTeacherRole(auth.enrollment.role)) {
      return res.status(403).json({ message: "Not allowed to delete this collaboration" });
    }

    await localDb.prepare("DELETE FROM collaborations WHERE id = ?").run(req.params.collaborationId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting collaboration:", error);
    return res.status(500).json({ message: error.message });
  }
});


// ===== Pages =====

router.get("/:id/pages", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "pages");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawPages = await localDb.prepare("SELECT * FROM course_pages WHERE course_id = ? ORDER BY updated_at DESC").all(courseId);
    const rows = rawPages.filter((p) => isTeacher || Number(p.published) === 1);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching pages:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/pages/:pageId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const page = await localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const userView = await localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)")
      .get(page.id, auth.email);

    let teacherStats = null;
    if (isTeacherRole(auth.enrollment.role)) {
      const totalEnrolled = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(courseId))?.c || 0);
      const viewedCount = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ?").get(page.id))?.c || 0);
      const completedCount = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ? AND completed_at IS NOT NULL").get(page.id))?.c || 0);
      teacherStats = { totalEnrolled, viewedCount, completedCount };
    }

    return res.json({
      ...page,
      myView: userView ? {
        first_viewed_at: userView.first_viewed_at,
        last_viewed_at: userView.last_viewed_at,
        scroll_pct_reached: Number(userView.scroll_pct_reached) || 0,
        completed: Boolean(userView.completed_at),
        completed_at: userView.completed_at,
      } : null,
      teacherStats,
    });
  } catch (error) {
    console.error("Error fetching page:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/pages/:pageId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, body, bodyJson, bodyHtml, published } = req.body;
    const existing = await localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!existing) return res.status(404).json({ message: "Page not found" });

    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (body !== undefined) { updates.push("body = ?"); params.push(body); }
    if (bodyJson !== undefined) { updates.push("body_json = ?"); params.push(typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)); }
    if (bodyHtml !== undefined) { updates.push("body_html = ?"); params.push(bodyHtml); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }

    const newBodyJson = bodyJson !== undefined ? (typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)) : existing.body_json;
    const newBodyHtml = bodyHtml !== undefined ? bodyHtml : existing.body_html;
    const newBodyText = body !== undefined ? body : existing.body;
    const readMins = calculateEstimatedReadMinutes(newBodyJson, newBodyHtml, newBodyText);
    updates.push("estimated_read_minutes = ?");
    params.push(readMins);

    if (updates.length) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(req.params.pageId, courseId);
      await localDb.prepare(`UPDATE course_pages SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    }

    if (newBodyJson) {
      await syncPageFileReferences(req.params.pageId, newBodyJson);
    }
    // Keep the page's module listing in step with its title and published state.
    if (title !== undefined) await localDb.prepare("UPDATE module_items SET title = ? WHERE item_type = 'page' AND content_id = ?").run(title, existing.id);
    if (published !== undefined) await syncListingPublished("page", existing.id, published);

    await recordEditAfterPublish(req, courseId, "page", existing.id, existing.published);
    return res.json(await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(req.params.pageId));
  } catch (error) {
    console.error("Error updating page:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/pages/:pageId/view", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const page = await localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const scrollPct = Math.min(100, Math.max(0, Number(req.body.scrollPct || req.body.scroll_pct) || 0));

    const existing = await localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)").get(page.id, auth.email);

    if (!existing) {
      const completedAt = scrollPct >= 90 ? new Date().toISOString() : null;
      await localDb.prepare(`
        INSERT INTO page_views (page_id, user_email, scroll_pct_reached, completed_at)
        VALUES (?, ?, ?, ?)
      `).run(page.id, auth.email, scrollPct, completedAt);
    } else {
      const maxScroll = Math.max(Number(existing.scroll_pct_reached) || 0, scrollPct);
      let completedAt = existing.completed_at;
      if (!completedAt && maxScroll >= 90) {
        completedAt = new Date().toISOString();
      }
      await localDb.prepare(`
        UPDATE page_views
        SET last_viewed_at = CURRENT_TIMESTAMP, scroll_pct_reached = ?, completed_at = ?
        WHERE page_id = ? AND LOWER(user_email) = LOWER(?)
      `).run(maxScroll, completedAt, page.id, auth.email);
    }

    const updatedView = await localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)").get(page.id, auth.email);

    return res.json({
      pageId: page.id,
      completed: Boolean(updatedView.completed_at),
      completed_at: updatedView.completed_at,
      scroll_pct_reached: Number(updatedView.scroll_pct_reached),
    });
  } catch (error) {
    console.error("Error recording page view:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/pages/:pageId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const page = await localDb.prepare("SELECT id FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!page) return res.status(404).json({ message: "Page not found" });
    await deleteContent(courseId, "page", page.id);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting page:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Discussions =====

router.get("/:id/discussions", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "discussions");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawDiscussions = await localDb.prepare("SELECT * FROM discussions WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const rows = await Promise.all(rawDiscussions
      .filter((d) => isTeacher || Number(d.published) === 1)
      .map(async (d) => {
        const replyCountRow = await localDb.prepare("SELECT COUNT(*) AS c FROM discussion_replies WHERE discussion_id = ?").get(d.id);
        const replyCount = Number(replyCountRow?.c || 0);
        return { ...d, replyCount };
      }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching discussions:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/discussions", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });
    const isTeacher = isTeacherRole(auth.enrollment.role);

    // Every discussion lives in a module. Learners can start one in any module they can see.
    if (!req.body.moduleId) return res.status(400).json({ message: "Choose the module this discussion belongs to (moduleId)" });
    const moduleRow = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.body.moduleId, courseId);
    if (!moduleRow || (!isTeacher && (Number(moduleRow.published) !== 1 || moduleRow.kind === "unassigned"))) {
      return res.status(404).json({ message: "Module not found" });
    }

    const isGraded = !!(req.body.graded && isTeacher);
    const pointsPossible = Number(req.body.pointsPossible) || 0;

    const created = await localDb.transaction(async () => {
      const result = await createModuleContent({
        courseId,
        moduleId: moduleRow.id,
        itemType: "discussion",
        data: { title, body: req.body.body || "" },
        actorEmail: auth.email,
        publish: isTeacher ? !!req.body.published && !isGraded : true,
      });
      if (isGraded) {
        await localDb.prepare("UPDATE discussions SET graded = 1, points_possible = ? WHERE id = ?").run(pointsPossible, result.contentId);
        await linkDiscussionAssignment(courseId, result.contentId, title, pointsPossible, auth.email);
        await refreshDueDates(courseId);
      }
      return result;
    })();

    return res.status(201).json(await localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(created.contentId));
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error creating discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/discussions/:discussionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const discussion = await localDb.prepare("SELECT * FROM discussions WHERE id = ? AND course_id = ?").get(req.params.discussionId, courseId);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const { title, body, published, graded, pointsPossible } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (body !== undefined) { updates.push("body = ?"); params.push(body); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (pointsPossible !== undefined) { updates.push("points_possible = ?"); params.push(Number(pointsPossible) || 0); }

    if (graded !== undefined) {
      const willBeGraded = !!graded;
      updates.push("graded = ?"); params.push(willBeGraded ? 1 : 0);

      if (willBeGraded && !discussion.linked_assignment_id) {
        const effectiveTitle = title !== undefined ? title : discussion.title;
        const effectivePoints = pointsPossible !== undefined ? (Number(pointsPossible) || 0) : discussion.points_possible;
        await linkDiscussionAssignment(courseId, discussion.id, effectiveTitle, effectivePoints, auth.email);
      } else if (!willBeGraded && discussion.linked_assignment_id) {
        await localDb.prepare("UPDATE discussions SET linked_assignment_id = NULL WHERE id = ?").run(discussion.id);
        await localDb.prepare("DELETE FROM item_outcomes WHERE item_type = 'assignment' AND item_id = ?").run(discussion.linked_assignment_id);
        await localDb.prepare("DELETE FROM assignments WHERE id = ? AND course_id = ?").run(discussion.linked_assignment_id, courseId);
      }
    }

    const hasDays = ["releaseDay", "dueDay", "closeDay"].some((k) => req.body[k] !== undefined);
    if (!updates.length && !hasDays) return res.status(400).json({ message: "No fields to update" });

    // Publishing a graded discussion publishes its assignment, which needs an outcome first.
    const current = await localDb.prepare("SELECT linked_assignment_id FROM discussions WHERE id = ?").get(discussion.id);
    if (published && current?.linked_assignment_id && await needsOutcomeBeforePublish("assignment", current.linked_assignment_id)) {
      return res.status(422).json({ message: OUTCOME_REQUIRED_MESSAGE, code: "OUTCOME_REQUIRED" });
    }

    params.push(req.params.discussionId, courseId);
    if (updates.length) await localDb.prepare(`UPDATE discussions SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    if (title !== undefined) await localDb.prepare("UPDATE module_items SET title = ? WHERE item_type = 'discussion' AND content_id = ?").run(title, discussion.id);
    await updateItemDays(courseId, "discussion", discussion.id, req.body);
    if (graded !== undefined) await refreshDueDates(courseId);
    if (published !== undefined) {
      await syncListingPublished("discussion", discussion.id, published);
      if (current?.linked_assignment_id) {
        await localDb.prepare("UPDATE assignments SET published = ? WHERE id = ?").run(published ? 1 : 0, current.linked_assignment_id);
      }
    }
    await recordEditAfterPublish(req, courseId, "discussion", discussion.id, discussion.published);
    return res.json(await localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(req.params.discussionId));
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error updating discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/discussions/:discussionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireEnrolled(req, res, courseId)) return;

    const discussion = await localDb.prepare("SELECT * FROM discussions WHERE id = ? AND course_id = ?").get(req.params.discussionId, courseId);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const rawReplies = await localDb.prepare("SELECT * FROM discussion_replies WHERE discussion_id = ? ORDER BY created_at ASC").all(discussion.id);
    const replies = await Promise.all(rawReplies.map(async (r) => ({ ...r, authorName: await userFullName(r.author_email) })));

    return res.json({ ...discussion, replies });
  } catch (error) {
    console.error("Error fetching discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/discussions/:discussionId/replies", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ message: "body is required" });

    const info = await localDb.prepare(`
      INSERT INTO discussion_replies (discussion_id, parent_reply_id, body, author_email)
      VALUES (?, ?, ?, ?)
    `).run(req.params.discussionId, req.body.parentReplyId || null, body, auth.email);

    return res.status(201).json(await localDb.prepare("SELECT * FROM discussion_replies WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error posting reply:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
