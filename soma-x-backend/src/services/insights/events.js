// Usage events recorded by the server (the browser sends its own through POST /analytics/events).
import { localDb } from "../../helpers/db-manager.js";

const CONTENT_FIELDS = new Set(["title", "description", "body", "body_json", "body_html", "bodyJson", "bodyHtml", "questions", "pointsPossible", "points_possible", "outcomeIds", "graded"]);

export async function recordEvent(user, courseId, type, data = {}) {
  try {
    await localDb.prepare(`
      INSERT INTO usage_events (user_id, role, course_id, event_type, data) VALUES (?, ?, ?, ?, ?::jsonb)
    `).run(user?.id ?? null, user?.role ?? null, courseId ?? null, type, JSON.stringify(data));
  } catch (error) {
    // Usage logging must never break the request it describes.
    console.error(`Could not record ${type} event:`, error.message);
  }
}

/**
 * A teacher changed what learners see in an item that was already published (wasPublished is
 * the state before this edit). Publishing or unpublishing alone is not an edit.
 */
export async function recordEditAfterPublish(req, courseId, itemType, contentId, wasPublished) {
  if (Number(wasPublished) !== 1) return;
  const fields = Object.keys(req.body || {}).filter((k) => CONTENT_FIELDS.has(k));
  if (!fields.length) return;
  await recordEvent(req.user, courseId, "item_edited_after_publish", { itemType, contentId: Number(contentId), fields });
}
