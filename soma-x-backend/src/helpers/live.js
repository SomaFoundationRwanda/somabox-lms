// Live updates: the box tells open browsers when something they're showing changed, so the app
// never has to ask "anything new?" on a timer (Server-Sent Events, one stream per browser).
//
// What's sent is only *what* changed, never data: { kind, id? }. The browser then reloads the
// matching data, and only if it's showing it.
//   course       a course's content changed (by its teacher)       → everyone in the course
//   course-work  learners' work in a course changed                  → its teachers and assistants
//   courses      someone's list of courses changed (added, removed)  → that person
//   notifications someone has a new notification                     → that person
//   school       the school's name, logo or colours                  → everyone
//   catalogue    books, Explore content                              → everyone
//
// Streams are opened with a single-use ticket (POST /live/ticket, 60 s), so the session token
// never goes in a URL. They're closed when the browser goes, when the session ends (sign-out,
// password change, deactivation: closeSessionStreams/closeUserStreams), or when the periodic check
// finds the session expired. A heartbeat finds connections that died silently.
//
// Recent events are kept (EVENT_LOG) so a browser that reconnects gets what it missed; one that
// missed too much, or comes back after the box restarted, is told to reload everything ("reset").
import crypto from 'crypto';
import { localDb } from './db-manager.js';

const BOOT = crypto.randomBytes(6).toString('hex');
const EVENT_LOG = 1000;
const TICKET_MS = 60 * 1000;
const HEARTBEAT_MS = 25 * 1000;
const SESSION_CHECK_MS = 5 * 60 * 1000;
// A teacher grading a class sends one "course changed" per course every few seconds, not one per grade.
const COURSE_COALESCE_MS = Number(process.env.LIVE_COALESCE_MS) || 5 * 1000;
const MAX_STREAMS_PER_USER = 6;

const tickets = new Map(); // ticket -> { userId, email, role, tokenHash, expires }
const streams = new Set(); // { id, userId, email, role, tokenHash, courses:Set, staffCourses:Set, res, heartbeat }
const log = [];            // { seq, event, audience }
let seq = 0;
let sessionTimer = null;

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const eventId = (n) => `${BOOT}:${n}`;

/** A one-minute, single-use ticket to open the stream (the caller is req.user with req.sessionToken). */
export function issueTicket(user, sessionToken) {
    const ticket = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    for (const [key, t] of tickets) if (t.expires < now) tickets.delete(key);
    tickets.set(ticket, { userId: user.id, email: user.email, role: user.role, tokenHash: hash(sessionToken), expires: now + TICKET_MS });
    return ticket;
}

function takeTicket(ticket) {
    const t = tickets.get(ticket);
    tickets.delete(ticket);
    return t && t.expires > Date.now() ? t : null;
}

async function loadCourses(stream) {
    const rows = await localDb.prepare("SELECT course_id, role FROM enrollments WHERE LOWER(user_email) = LOWER(?) AND status = 'active'").all(stream.email);
    stream.courses = new Set(rows.map((r) => String(r.course_id)));
    stream.staffCourses = new Set(rows.filter((r) => r.role === 'teacher' || r.role === 'ta').map((r) => String(r.course_id)));
}

function reaches(stream, audience) {
    if (audience.everyone) return true;
    if (audience.userIds?.includes(stream.userId)) return true;
    if (audience.emails?.includes(stream.email)) return true;
    if (audience.courseId) return (audience.staffOnly ? stream.staffCourses : stream.courses).has(String(audience.courseId));
    return false;
}

function write(stream, text) {
    try {
        stream.res.write(text);
    } catch {
        close(stream);
    }
}

function send(stream, n, event) {
    write(stream, `id: ${eventId(n)}\nevent: change\ndata: ${JSON.stringify(event)}\n\n`);
}

function close(stream) {
    if (!streams.has(stream)) return;
    streams.delete(stream);
    clearInterval(stream.heartbeat);
    try { stream.res.end(); } catch { /* already gone */ }
    if (!streams.size) stopSessionChecks();
}

/**
 * Tells the browsers concerned that something changed.
 * audience: { everyone } | { userIds } | { emails } | { courseId, staffOnly? }
 */
export function publish(event, audience) {
    seq += 1;
    const entry = { seq, event, audience: { ...audience, emails: audience.emails?.map((e) => String(e).toLowerCase()) } };
    log.push(entry);
    if (log.length > EVENT_LOG) log.shift();
    for (const stream of [...streams]) {
        if (!reaches(stream, entry.audience)) continue;
        // Being added to or taken off a course changes which course events this stream gets.
        if (event.kind === 'courses') loadCourses(stream).catch(() => {}).finally(() => send(stream, entry.seq, event));
        else send(stream, entry.seq, event);
    }
}

const pendingCourse = new Map(); // `${kind}:${courseId}` -> timer
/** A course changed; several changes within a few seconds become one event. */
export function publishCourse(kind, courseId) {
    const key = `${kind}:${courseId}`;
    if (pendingCourse.has(key)) return;
    pendingCourse.set(key, setTimeout(() => {
        pendingCourse.delete(key);
        publish({ kind, id: String(courseId) }, { courseId: String(courseId), staffOnly: kind === 'course-work' });
    }, COURSE_COALESCE_MS));
}

/** People joined or left a course: their course lists change, and its teachers' people list. */
export function membershipChanged(courseId, emails) {
    const list = emails.filter(Boolean);
    if (list.length) publish({ kind: 'courses' }, { emails: list });
    publishCourse('course-work', courseId);
}

/** GET /live?ticket=...&last=<event id>: the stream itself. */
export async function openStream(req, res) {
    const ticket = takeTicket(String(req.query.ticket || ''));
    if (!ticket) return res.status(401).json({ message: 'Please log in to continue' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // a proxy in front must not hold the events back
    });
    res.flushHeaders?.();
    req.socket.setKeepAlive?.(true);
    req.socket.setTimeout?.(0);

    const stream = { ...ticket, courses: new Set(), staffCourses: new Set(), res };
    let gone = false;
    req.on('close', () => { gone = true; close(stream); });
    await loadCourses(stream);
    if (gone) return;
    // One browser shares one stream between its tabs, but a person may use several devices.
    const mine = [...streams].filter((s) => s.userId === stream.userId);
    if (mine.length >= MAX_STREAMS_PER_USER) close(mine[0]);
    streams.add(stream);
    startSessionChecks();
    stream.heartbeat = setInterval(() => write(stream, ': ping\n\n'), HEARTBEAT_MS);

    write(stream, 'retry: 5000\n\n');
    // Catch up after a reconnect: what this browser missed, or "reset" if that can't be known.
    const last = String(req.query.last || '');
    if (last) {
        const [boot, n] = last.split(':');
        const from = Number(n);
        if (boot !== BOOT || !Number.isInteger(from) || (log.length && from < log[0].seq - 1)) {
            write(stream, `id: ${eventId(seq)}\nevent: reset\ndata: {}\n\n`);
        } else {
            for (const entry of log) if (entry.seq > from && reaches(stream, entry.audience)) send(stream, entry.seq, entry.event);
        }
    }
    write(stream, `id: ${eventId(seq)}\nevent: ready\ndata: {}\n\n`);
}

/** Sign-out: that session's streams close. */
export function closeSessionStreams(sessionToken) {
    const tokenHash = hash(sessionToken);
    for (const s of [...streams]) if (s.tokenHash === tokenHash) close(s);
}

/** Password change, deactivation, role change: the person's streams close (except `exceptToken`'s). */
export function closeUserStreams(userId, exceptToken) {
    const keep = exceptToken ? hash(exceptToken) : null;
    for (const s of [...streams]) if (s.userId === userId && s.tokenHash !== keep) close(s);
}

// Sessions also end by themselves (7 days, or idle). Checked for all open streams at once, every
// few minutes, and only while any stream is open.
async function checkSessions() {
    const open = [...streams];
    if (!open.length) return;
    const hashes = [...new Set(open.map((s) => s.tokenHash))];
    const rows = await localDb.prepare(`
        SELECT s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash IN (${hashes.map(() => '?').join(',')}) AND s.revoked_at IS NULL AND s.expires_at > NOW()
          AND u.is_active = 1
          AND s.last_seen_at > NOW() - INTERVAL '30 minutes'
    `).all(...hashes);
    const valid = new Set(rows.map((r) => r.token_hash));
    for (const s of open) if (!valid.has(s.tokenHash)) close(s);
}

function startSessionChecks() {
    if (sessionTimer) return;
    sessionTimer = setInterval(() => checkSessions().catch((e) => console.error('Live stream session check failed:', e)), SESSION_CHECK_MS);
    sessionTimer.unref?.();
}

function stopSessionChecks() {
    clearInterval(sessionTimer);
    sessionTimer = null;
}

/** For tests and the health page. */
export function liveStats() {
    return { streams: streams.size, tickets: tickets.size, events: log.length, boot: BOOT };
}

/** Tests: close everything and forget the log. */
export function resetLive() {
    for (const s of [...streams]) close(s);
    tickets.clear();
    log.length = 0;
    for (const t of pendingCourse.values()) clearTimeout(t);
    pendingCourse.clear();
}

export { checkSessions as _checkSessions };
