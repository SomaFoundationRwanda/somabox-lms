// Box-to-cloud sync. Triggers write every change of a synced table to sync_outbox (migration
// 0014); this module pushes those rows to the cloud in batches on a schedule (never at login),
// filtered by the admin's sync scope. The cloud is append-only: each outbox row becomes one
// record keyed by its own sync_id, so a retried batch can't create duplicates.
import { localDb } from "../../helpers/db-manager.js";
import { createTransport } from "./transports.js";
import { deviceInfo, syncHistory } from "./device.js";

export const DEFAULT_SCOPE = {
  courses: true,
  enrollments: true,
  grades: true,
  outcomeResults: true,
  events: true,
  attendance: true,
  people: "pseudonymous", // "none" | "pseudonymous" | "full"
  submissionText: false,
};

// Which scope switch each synced table falls under.
const CATEGORY = {
  courses: "courses",
  outcomes: "courses",
  enrollments: "enrollments",
  assignment_submissions: "grades",
  submission_scores: "grades",
  grade_audit_log: "grades",
  quiz_attempts: "grades",
  outcome_results: "outcomeResults",
  usage_events: "events",
  attendance_sessions: "attendance",
  attendance_records: "attendance",
  users: "people",
};

// Columns holding an email address, per table. Outside "full" people mode they're replaced by
// the person's sync_id, so the cloud can join records without learning who anyone is.
const EMAIL_COLUMNS = {
  courses: ["created_by_teacher_email"],
  enrollments: ["user_email"],
  assignment_submissions: ["scholar_email", "graded_by_teacher_email"],
  grade_audit_log: ["scholar_email", "changed_by"],
  submission_scores: ["graded_by"],
  attendance_sessions: ["created_by"],
  attendance_records: ["marked_by"],
};
const TEXT_COLUMNS = { assignment_submissions: ["body", "feedback"] };
const PSEUDONYMOUS_USER_FIELDS = ["id", "sync_id", "role", "grade_level", "is_active", "created_at"];

const BATCH_SIZE = () => Math.max(1, Number(process.env.SYNC_BATCH_SIZE) || 200);
const MAX_BATCHES = 50;
const KEEP_SENT_DAYS = 30;

export async function getSetting(key, fallback) {
  const row = await localDb.prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export async function syncScope() {
  const stored = await getSetting("sync_scope", {});
  return { ...DEFAULT_SCOPE, ...(stored && typeof stored === "object" ? stored : {}) };
}

export async function boxId() {
  return String(await getSetting("box_id", ""));
}

/** Validates and saves a new scope (partial updates allowed). Returns the full scope. */
export async function saveSyncScope(changes, actorEmail) {
  const next = { ...(await syncScope()) };
  for (const [key, value] of Object.entries(changes || {})) {
    if (!(key in DEFAULT_SCOPE)) throw Object.assign(new Error(`Unknown sync setting: ${key}`), { status: 400 });
    if (key === "people") {
      if (!["none", "pseudonymous", "full"].includes(value)) throw Object.assign(new Error("people must be none, pseudonymous or full"), { status: 400 });
    } else if (typeof value !== "boolean") {
      throw Object.assign(new Error(`${key} must be true or false`), { status: 400 });
    }
    next[key] = value;
  }
  await localDb.prepare(`
    INSERT INTO system_settings (key, value, updated_by, updated_at) VALUES ('sync_scope', ?::jsonb, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
  `).run(JSON.stringify(next), actorEmail);
  return next;
}

/**
 * The record sent to the cloud for one outbox row, or null if the scope keeps it on the box.
 * personRef(email) resolves an email to that person's sync_id.
 */
export async function toCloudRecord(row, { scope, box, personRef }) {
  const category = CATEGORY[row.entity];
  if (!category) return null;
  if (category === "people" ? scope.people === "none" : !scope[category]) return null;

  let data = { ...row.payload };
  delete data.password_hash;
  if (row.entity === "users" && scope.people !== "full") {
    data = Object.fromEntries(PSEUDONYMOUS_USER_FIELDS.filter((k) => k in data).map((k) => [k, data[k]]));
  }
  if (scope.people !== "full") {
    for (const col of EMAIL_COLUMNS[row.entity] || []) {
      if (data[col] == null) continue;
      data[`${col.replace(/_email$|$/, "")}_person`] = await personRef(data[col]);
      delete data[col];
    }
  }
  if (!scope.submissionText) {
    for (const col of TEXT_COLUMNS[row.entity] || []) {
      if (col in data) data[col] = null;
    }
  }
  return {
    syncId: row.sync_id,
    boxId: box,
    entity: row.entity,
    op: row.op,
    entitySyncId: row.entity_sync_id,
    occurredAt: row.created_at,
    data,
  };
}

async function logRun(started, status, details) {
  await localDb.prepare("INSERT INTO sync_log (started_at, finished_at, status, details) VALUES (?, CURRENT_TIMESTAMP, ?, ?)")
    .run(started, status, JSON.stringify(details));
}

let running = null;

/**
 * Sends pending outbox rows in batches until none are left, a batch fails, or MAX_BATCHES.
 * Returns { status: ok|failed|not_configured|nothing_to_send|busy, sent, skipped, pending, error? }.
 */
export async function pushOutbox({ transport = createTransport() } = {}) {
  if (running) return { status: "busy" };
  running = (async () => {
    const started = new Date();
    const pendingBefore = await pendingCount();
    if (!transport) {
      const result = { status: "not_configured", sent: 0, skipped: 0, pending: pendingBefore };
      await logRun(started, result.status, result);
      return result;
    }
    if (pendingBefore === 0) {
      await cleanupSent();
      // Nothing new: still tell the cloud this box is alive, what it is, and how syncing has gone.
      try {
        await transport.status?.({ boxId: await boxId(), device: deviceInfo(), history: await syncHistory() });
      } catch (err) {
        const result = { status: "failed", sent: 0, skipped: 0, pending: 0, error: err.message || String(err) };
        await logRun(started, result.status, result);
        return result;
      }
      return { status: "nothing_to_send", sent: 0, skipped: 0, pending: 0 };
    }

    const scope = await syncScope();
    const box = await boxId();
    const people = new Map();
    const personRef = async (email) => {
      const key = String(email).toLowerCase();
      if (!people.has(key)) {
        const user = await localDb.prepare("SELECT sync_id FROM users WHERE LOWER(email) = ?").get(key);
        people.set(key, user?.sync_id ?? null);
      }
      return people.get(key);
    };

    let sent = 0;
    let skipped = 0;
    let error = null;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const rows = await localDb.prepare("SELECT * FROM sync_outbox WHERE sent_at IS NULL ORDER BY id LIMIT ?").all(BATCH_SIZE());
      if (!rows.length) break;
      const records = [];
      const skippedIds = [];
      for (const row of rows) {
        const record = await toCloudRecord(row, { scope, box, personRef });
        if (record) records.push(record);
        else skippedIds.push(row.id);
      }
      const ids = rows.map((r) => r.id);
      try {
        if (records.length) await transport.send(records, { boxId: box, device: deviceInfo(), history: await syncHistory() });
      } catch (err) {
        error = err.message || String(err);
        await localDb.prepare(`UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id IN (${ids.map(() => "?").join(",")})`)
          .run(error.slice(0, 500), ...ids);
        break;
      }
      await localDb.prepare(`UPDATE sync_outbox SET sent_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
      if (skippedIds.length) {
        await localDb.prepare(`UPDATE sync_outbox SET skipped = true WHERE id IN (${skippedIds.map(() => "?").join(",")})`).run(...skippedIds);
      }
      sent += records.length;
      skipped += skippedIds.length;
    }
    await cleanupSent();
    const result = { status: error ? "failed" : "ok", sent, skipped, pending: await pendingCount(), ...(error ? { error } : {}) };
    await logRun(started, result.status, result);
    if (!error && sent > 0) {
      await localDb.prepare("UPDATE unit_branding SET last_synced_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    }
    return result;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function pendingCount() {
  return Number((await localDb.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE sent_at IS NULL").get()).n);
}

async function cleanupSent() {
  await localDb.prepare("DELETE FROM sync_outbox WHERE sent_at IS NOT NULL AND sent_at < NOW() - make_interval(days => ?)").run(KEEP_SENT_DAYS);
}

/** For the admin screen: transport, queue size, and recent runs. */
export async function syncStatus() {
  const transport = createTransport();
  const pending = await localDb.prepare("SELECT COUNT(*) AS n, MIN(created_at) AS oldest, MAX(attempts) AS attempts FROM sync_outbox WHERE sent_at IS NULL").get();
  const runs = await localDb.prepare("SELECT started_at, finished_at, status, details FROM sync_log ORDER BY id DESC LIMIT 10").all();
  const lastOk = await localDb.prepare("SELECT finished_at FROM sync_log WHERE status = 'ok' ORDER BY id DESC LIMIT 1").get();
  const parse = (d) => { try { return JSON.parse(d); } catch { return d; } };
  return {
    boxId: await boxId(),
    device: deviceInfo(),
    transport: transport?.name ?? null,
    configured: !!transport,
    intervalMinutes: intervalMinutes(),
    pending: Number(pending.n),
    oldestPendingAt: pending.oldest,
    failedAttempts: Number(pending.attempts || 0),
    lastSuccessAt: lastOk?.finished_at ?? null,
    runs: runs.map((r) => ({ startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, details: parse(r.details) })),
    scope: await syncScope(),
  };
}

export function intervalMinutes() {
  return Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES) || 15);
}

// Scheduled pushes. After a failure (the internet link is down, say) the wait doubles each time,
// up to 6 hours, so a box offline for weeks doesn't keep retrying every few minutes.
let timer = null;
let failures = 0;
export function scheduleSync() {
  if (timer) return;
  const base = intervalMinutes() * 60 * 1000;
  const tick = async () => {
    let result;
    try {
      result = await pushOutbox();
    } catch (error) {
      console.error("Sync run failed:", error.message);
      result = { status: "failed" };
    }
    failures = result.status === "failed" ? failures + 1 : 0;
    const wait = failures ? Math.min(base * 2 ** failures, 6 * 60 * 60 * 1000) : base;
    timer = setTimeout(tick, wait);
    timer.unref?.();
  };
  timer = setTimeout(tick, 30 * 1000);
  timer.unref?.();
}
