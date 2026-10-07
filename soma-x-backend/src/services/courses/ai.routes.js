// AI in a course: start generation jobs, follow their progress, and review the drafts they
// produce. Nothing AI-generated reaches learners until a teacher approves a draft (which
// creates unpublished items) and then publishes those items.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { requireTeacher, courseExists } from "./shared.js";
import { sendItemError } from "./items.js";
import { aiAccess } from "../ai/access.js";
import { JOB_KINDS, enqueueJob, queuePosition, requestCancel } from "../ai/jobs.js";
import { applyDraft, checkPayload } from "../ai/drafts.js";

const router = express.Router();

// Teacher of the course, with AI switched on for them.
async function requireAiTeacher(req, res, courseId) {
  const auth = await requireTeacher(req, res, courseId);
  if (!auth) return null;
  const access = await aiAccess(req.user);
  if (!access.allowed) {
    res.status(403).json({ message: access.reason, code: "AI_DISABLED" });
    return null;
  }
  return auth;
}

async function jobView(job) {
  const drafts = await localDb.prepare("SELECT id, type, status FROM ai_drafts WHERE job_id = ? ORDER BY id").all(job.id);
  return {
    id: job.id, kind: job.kind, status: job.status, progress: job.progress, total: job.total,
    error: job.error, moduleId: job.module_id, createdAt: job.created_at, finishedAt: job.finished_at,
    requestedBy: job.requested_by, position: await queuePosition(job), drafts,
  };
}

router.post("/:id/ai/jobs", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireAiTeacher(req, res, courseId)) return;
    const kind = String(req.body.kind || "");
    if (!JOB_KINDS[kind]) return res.status(400).json({ message: `kind must be one of: ${Object.keys(JOB_KINDS).join(", ")}` });

    const job = await enqueueJob({
      courseId, kind,
      moduleId: req.body.moduleId ? Number(req.body.moduleId) : null,
      assignmentId: req.body.assignmentId ? Number(req.body.assignmentId) : null,
      scholarEmail: req.body.scholarEmail,
      input: req.body.input || {},
      user: req.user,
    });
    return res.status(202).json(await jobView(job));
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error starting AI job:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/ai/jobs", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const active = req.query.active === "1";
    const jobs = await localDb.prepare(`
      SELECT * FROM ai_jobs WHERE course_id = ? ${active ? "AND status IN ('queued', 'running')" : ""}
      ORDER BY id DESC LIMIT 50
    `).all(courseId);
    return res.json(await Promise.all(jobs.map(jobView)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/ai/jobs/:jobId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const job = await localDb.prepare("SELECT * FROM ai_jobs WHERE id = ? AND course_id = ?").get(req.params.jobId, courseId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    return res.json(await jobView(job));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/jobs/:jobId/cancel", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const job = await localDb.prepare("SELECT * FROM ai_jobs WHERE id = ? AND course_id = ?").get(req.params.jobId, courseId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    await requestCancel(job.id);
    return res.json(await jobView(await localDb.prepare("SELECT * FROM ai_jobs WHERE id = ?").get(job.id)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ===== Drafts =====

const draftView = (d) => ({
  id: d.id, jobId: d.job_id, type: d.type, status: d.status, moduleId: d.module_id, assignmentId: d.assignment_id,
  scholarEmail: d.scholar_email, payload: d.payload, edited: d.edited, createdBy: d.created_by, createdAt: d.created_at,
  decidedBy: d.decided_by, decidedAt: d.decided_at, resultRefs: d.result_refs,
});

async function loadDraft(res, courseId, draftId) {
  const draft = await localDb.prepare("SELECT * FROM ai_drafts WHERE id = ? AND course_id = ?").get(draftId, courseId);
  if (!draft) { res.status(404).json({ message: "Draft not found" }); return null; }
  return draft;
}

router.get("/:id/ai/drafts", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : null;
    // Grading suggestions are reviewed on the grading screen, not in the drafts list.
    const rows = await localDb.prepare(`
      SELECT * FROM ai_drafts WHERE course_id = ? AND type <> 'grading' ${status ? "AND status = ?" : ""} ORDER BY id DESC LIMIT 100
    `).all(...(status ? [courseId, status] : [courseId]));
    return res.json(rows.map(draftView));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/ai/drafts/:draftId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const draft = await loadDraft(res, courseId, req.params.draftId);
    if (!draft) return;
    return res.json(draftView(draft));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Teacher edits a pending draft before approving it.
router.patch("/:id/ai/drafts/:draftId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const draft = await loadDraft(res, courseId, req.params.draftId);
    if (!draft) return;
    if (draft.status !== "pending") return res.status(409).json({ message: `This draft was already ${draft.status}` });
    checkPayload(draft.type, req.body.payload);
    await localDb.prepare("UPDATE ai_drafts SET payload = ?::jsonb, edited = true WHERE id = ?").run(JSON.stringify(req.body.payload), draft.id);
    return res.json(draftView(await localDb.prepare("SELECT * FROM ai_drafts WHERE id = ?").get(draft.id)));
  } catch (error) {
    if (sendItemError(res, error)) return;
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/drafts/:draftId/approve", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    const draft = await loadDraft(res, courseId, req.params.draftId);
    if (!draft) return;
    if (draft.status !== "pending") return res.status(409).json({ message: `This draft was already ${draft.status}` });
    checkPayload(draft.type, draft.payload);

    const refs = await localDb.transaction(async () => {
      const created = await applyDraft(draft, auth.email);
      await localDb.prepare(`
        UPDATE ai_drafts SET status = 'approved', decided_by = ?, decided_at = CURRENT_TIMESTAMP, result_refs = ?::jsonb WHERE id = ?
      `).run(auth.email, JSON.stringify(created), draft.id);
      return created;
    })();
    return res.json({ message: "Added to the course as unpublished drafts. Review them, then publish.", resultRefs: refs });
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error approving AI draft:", error);
    return res.status(500).json({ message: error.message });
  }
});

// The latest grading suggestion for one learner's submission (shown on the grading screen).
router.get("/:id/ai/grading-suggestion", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const draft = await localDb.prepare(`
      SELECT * FROM ai_drafts WHERE course_id = ? AND type = 'grading' AND assignment_id = ? AND LOWER(scholar_email) = LOWER(?)
      ORDER BY id DESC LIMIT 1
    `).get(courseId, Number(req.query.assignmentId) || 0, String(req.query.scholarEmail || ""));
    return res.json(draft ? draftView(draft) : null);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/drafts/:draftId/reject", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    const draft = await loadDraft(res, courseId, req.params.draftId);
    if (!draft) return;
    if (draft.status !== "pending") return res.status(409).json({ message: `This draft was already ${draft.status}` });
    await localDb.prepare("UPDATE ai_drafts SET status = 'rejected', decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?").run(auth.email, draft.id);
    return res.json({ message: "Draft rejected" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
