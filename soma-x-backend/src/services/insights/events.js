// Usage events recorded by the server (the browser sends its own through POST /analytics/events).
import { localDb } from "../../helpers/db-manager.js";
import { schoolToday } from "../courses/schedule.js";

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

// How often each person uses the box: one "active_day" event per person per school day (on
// their first request that day), synced like every usage event. Remembered here too, so only
// the first request of the day touches the database.
const activeDays = new Map(); // user id -> "YYYY-MM-DD"

export async function noteActiveDay(user) {
  if (!user?.id) return;
  const day = schoolToday();
  if (activeDays.get(user.id) === day) return;
  activeDays.set(user.id, day);
  try {
    await localDb.prepare(`
      INSERT INTO usage_events (user_id, role, event_type, data)
      SELECT ?, ?, 'active_day', jsonb_build_object('day', ?::text)
      WHERE NOT EXISTS (SELECT 1 FROM usage_events WHERE user_id = ? AND event_type = 'active_day' AND data->>'day' = ?)
    `).run(user.id, user.role, day, user.id, day);
  } catch (error) {
    activeDays.delete(user.id);
    console.error("Could not record an active day:", error.message);
  }
}

/** Tests only: forget who was seen today. */
export function forgetActiveDays() {
  activeDays.clear();
}
