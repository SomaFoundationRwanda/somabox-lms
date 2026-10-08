"use client";

// Retry queue for learners' assignment submissions ONLY. When the box can't be reached (the
// request never gets an HTTP answer), the submission is kept in this browser's storage and sent
// again when the connection is back: on the `online` event, every 30 s while something is
// waiting, and on the next page load. Re-sending is safe because the server keeps one submission
// per learner per assignment. Quiz submissions must never go through here: a retry could create
// an extra attempt.

const PENDING_PREFIX = "somabox.pendingSubmission:";
const NOTICE_PREFIX = "somabox.submissionNotice:";
const RETRY_MS = 30_000;
export const QUEUE_EVENT = "somabox:submission-queue";

// HTTP answers that say "try again later" rather than "this submission is refused":
// a lost session (the learner logs in again) and a gateway that couldn't reach the box.
const RETRYABLE_STATUSES = new Set([0, 401, 502, 503, 504]);

const keyOf = (prefix, userId, courseId, assignmentId) => `${prefix}${userId}:${courseId}:${assignmentId}`;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

function keysFor(prefix, userId) {
  const keys = [];
  try {
    const start = `${prefix}${userId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(start)) keys.push(k);
    }
  } catch { /* storage unavailable */ }
  return keys;
}

function emit(detail) {
  try { window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail })); } catch { /* ignore */ }
}

/** True when a fetch failure means "no connection" (it threw, or came back with status 0). */
export function isNetworkFailure(errOrResponse) {
  if (!errOrResponse) return false;
  if (typeof errOrResponse.status === "number") return errOrResponse.status === 0;
  return errOrResponse instanceof TypeError || errOrResponse.name === "TypeError";
}

/** Keeps a submission on this device. Returns false if the browser won't store it. */
export function queueSubmission({ userId, courseId, assignmentId, body }) {
  if (!userId) return false;
  const ok = write(keyOf(PENDING_PREFIX, userId, courseId, assignmentId), {
    userId, courseId: String(courseId), assignmentId: String(assignmentId), body: body ?? "", queuedAt: new Date().toISOString(),
  });
  if (ok) {
    clearNotice({ userId, courseId, assignmentId });
    emit({ type: "queued", courseId: String(courseId), assignmentId: String(assignmentId) });
  }
  return ok;
}

export function getPendingSubmission({ userId, courseId, assignmentId }) {
  if (!userId) return null;
  return read(keyOf(PENDING_PREFIX, userId, courseId, assignmentId));
}

export function clearPendingSubmission({ userId, courseId, assignmentId }) {
  if (!userId) return;
  remove(keyOf(PENDING_PREFIX, userId, courseId, assignmentId));
}

/** A server refusal for a queued submission, kept until the learner dismisses it. */
export function getNotice({ userId, courseId, assignmentId }) {
  if (!userId) return null;
  return read(keyOf(NOTICE_PREFIX, userId, courseId, assignmentId));
}

export function clearNotice({ userId, courseId, assignmentId }) {
  if (!userId) return;
  remove(keyOf(NOTICE_PREFIX, userId, courseId, assignmentId));
}

export function hasPending(userId) {
  return !!userId && keysFor(PENDING_PREFIX, userId).length > 0;
}

/** How many submissions are still waiting on this device for this user. */
export function pendingCount(userId) {
  return userId ? keysFor(PENDING_PREFIX, userId).length : 0;
}

/**
 * Deletes everything this queue keeps for a user on this device: waiting submissions and
 * refusal notices. Called on logout so the next person on a shared device can't read them.
 */
export function clearUserQueue(userId) {
  if (!userId) return;
  for (const key of [...keysFor(PENDING_PREFIX, userId), ...keysFor(NOTICE_PREFIX, userId)]) remove(key);
  emit({ type: "cleared" });
}

let flushing = false;

/** Tries to send every waiting submission for this user once. */
export async function flushQueue(serverUrl, userId, { onSent, onRefused } = {}) {
  if (flushing || !serverUrl || !userId) return;
  flushing = true;
  try {
    for (const key of keysFor(PENDING_PREFIX, userId)) {
      const entry = read(key);
      if (!entry?.courseId || !entry?.assignmentId) { remove(key); continue; }
      let res;
      try {
        res = await fetch(`${serverUrl}/courses/${entry.courseId}/assignments/${entry.assignmentId}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: entry.body }),
        });
      } catch {
        return; // still offline: keep everything and stop for now
      }
      if (RETRYABLE_STATUSES.has(res.status)) {
        if (res.status === 0) return;
        continue;
      }
      const payload = await res.json().catch(() => ({}));
      // The learner may have submitted again (and been queued again) while this was in flight.
      const current = read(key);
      if (current && current.queuedAt === entry.queuedAt) remove(key);
      const detail = { courseId: entry.courseId, assignmentId: entry.assignmentId };
      if (res.ok) {
        emit({ type: "sent", ...detail, late: !!payload.late });
        onSent?.(entry, payload);
      } else {
        const fallback = { CLOSED: "This assignment is closed.", NOT_OPEN_YET: "This assignment is not open yet." }[payload.code];
        const message = payload.message || fallback || "Your saved work couldn't be submitted.";
        write(keyOf(NOTICE_PREFIX, userId, entry.courseId, entry.assignmentId), { message, at: new Date().toISOString() });
        emit({ type: "refused", ...detail, message });
        onRefused?.(entry, message);
      }
    }
  } finally {
    flushing = false;
  }
}

/** Starts retrying for a learner. Returns a function that stops it. */
export function startSubmissionQueue(serverUrl, userId, handlers = {}) {
  if (typeof window === "undefined" || !serverUrl || !userId) return () => {};
  const tick = () => { if (hasPending(userId)) flushQueue(serverUrl, userId, handlers); };
  const onOnline = () => tick();
  window.addEventListener("online", onOnline);
  const timer = setInterval(tick, RETRY_MS);
  tick();
  return () => {
    window.removeEventListener("online", onOnline);
    clearInterval(timer);
  };
}
