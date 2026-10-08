// Attendance figures. Present and late both count as attending; excused sessions don't count
// either way; a session where a learner wasn't marked doesn't count either (nothing invented).
import { localDb } from "../../helpers/db-manager.js";

export const STATUSES = ["present", "late", "absent", "excused"];
export const ATTENDANCE_RULES = { minSessions: 3, lowRate: 0.8, consecutiveAbsences: 3 };

/**
 * Per learner: { userId, present, late, absent, excused, counted, rate (0..1|null),
 * consecutiveAbsences (most recent run), lastAbsentOn }.
 */
export async function attendanceByLearner(courseId, userIds = null) {
  const rows = await localDb.prepare(`
    SELECT r.user_id, r.status, s.session_date::text AS date
    FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
    WHERE s.course_id = ?
    ORDER BY s.session_date ASC, s.id ASC
  `).all(courseId);
  const byUser = new Map();
  for (const r of rows) {
    const id = Number(r.user_id);
    if (userIds && !userIds.includes(id)) continue;
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(r);
  }
  const result = new Map();
  for (const id of userIds || byUser.keys()) {
    result.set(Number(id), summarise(Number(id), byUser.get(Number(id)) || []));
  }
  return result;
}

export function summarise(userId, records) {
  const s = { userId, present: 0, late: 0, absent: 0, excused: 0 };
  for (const r of records) s[r.status] += 1;
  const counted = s.present + s.late + s.absent;
  let run = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].status === "excused") continue;
    if (records[i].status !== "absent") break;
    run += 1;
  }
  const lastAbsent = [...records].reverse().find((r) => r.status === "absent");
  return {
    ...s,
    counted,
    rate: counted ? Math.round(((s.present + s.late) / counted) * 100) / 100 : null,
    consecutiveAbsences: run,
    lastAbsentOn: lastAbsent?.date ?? null,
  };
}

/** Teacher-facing reasons (for Insights flags), or [] if attendance is fine or too sparse to judge. */
export function attendanceReasons(summary) {
  if (!summary) return [];
  const reasons = [];
  if (summary.consecutiveAbsences >= ATTENDANCE_RULES.consecutiveAbsences) {
    reasons.push({ code: "absent_in_a_row", message: `Absent for the last ${summary.consecutiveAbsences} sessions` });
  } else if (summary.counted >= ATTENDANCE_RULES.minSessions && summary.rate < ATTENDANCE_RULES.lowRate) {
    reasons.push({ code: "low_attendance", message: `Attended ${Math.round(summary.rate * 100)}% of ${summary.counted} sessions` });
  }
  return reasons;
}
