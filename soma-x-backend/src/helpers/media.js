// Files (videos, PDFs, books, lessons, course uploads) are only for signed-in people. Browsers
// load them through <video>, <img>, <iframe>, and PDF/EPUB viewers, which can't send the bearer
// token, so signing in also sets a short-lived, signed, HttpOnly "media" cookie that those
// requests carry automatically. Guests can still browse the catalogue (titles, covers), but
// opening a file asks them to sign up.
import crypto from 'crypto';
import { localDb } from './db-manager.js';

export const MEDIA_COOKIE = 'somabox_media';
const MEDIA_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MS = 60 * 1000;

let secretPromise = null;
/** MEDIA_SECRET from the environment, or a random secret kept in system_settings. */
function mediaSecret() {
    if (process.env.MEDIA_SECRET) return Promise.resolve(process.env.MEDIA_SECRET);
    if (!secretPromise) {
        secretPromise = (async () => {
            const fresh = crypto.randomBytes(32).toString('hex');
            await localDb.prepare(`
                INSERT INTO system_settings (key, value, updated_by) VALUES ('media_secret', to_jsonb(?::text), 'system')
                ON CONFLICT (key) DO NOTHING
            `).run(fresh);
            const row = await localDb.prepare("SELECT value FROM system_settings WHERE key = 'media_secret'").get();
            return String(row.value);
        })().catch((error) => { secretPromise = null; throw error; });
    }
    return secretPromise;
}

const sign = (payload, secret) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export async function mediaToken(userId, now = Date.now()) {
    const payload = `${userId}.${now + MEDIA_TTL_MS}`;
    return `${payload}.${sign(payload, await mediaSecret())}`;
}

/** The user id in a valid, unexpired token, or null. */
export async function verifyMediaToken(token, now = Date.now()) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [userId, expires, signature] = parts;
    const expected = sign(`${userId}.${expires}`, await mediaSecret());
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (!(Number(expires) > now)) return null;
    return Number(userId);
}

function cookieValue(req, name) {
    for (const part of String(req.headers.cookie || '').split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
}

// Same host on another port is the same site, so SameSite=Lax cookies reach the API from the app.
export async function setMediaCookie(res, userId) {
    res.cookie(MEDIA_COOKIE, await mediaToken(userId), {
        httpOnly: true, sameSite: 'lax', path: '/', maxAge: MEDIA_TTL_MS,
        secure: process.env.MEDIA_COOKIE_SECURE === 'true',
    });
}

export function clearMediaCookie(res) {
    res.clearCookie(MEDIA_COOKIE, { path: '/' });
}

const userCache = new Map();
async function activeUser(id) {
    const hit = userCache.get(id);
    if (hit && hit.at > Date.now() - CACHE_MS) return hit.user;
    const user = await localDb.prepare('SELECT id, email, role, is_active FROM users WHERE id = ?').get(id);
    const value = user && Number(user.is_active) !== 0 ? user : null;
    userCache.set(id, { at: Date.now(), user: value });
    return value;
}

const memberCache = new Map();
/** Course files: members of the course (learners only once it has opened), and admins. */
async function canOpenCourseFiles(user, courseId) {
    if (user.role === 'admin') return true;
    const key = `${user.id}:${courseId}`;
    const hit = memberCache.get(key);
    if (hit && hit.at > Date.now() - CACHE_MS) return hit.ok;
    const row = await localDb.prepare(`
        SELECT e.role, c.lifecycle FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.course_id = ? AND LOWER(e.user_email) = LOWER(?) AND e.status = 'active'
    `).get(courseId, user.email);
    const ok = !!row && (['teacher', 'ta'].includes(row.role) || row.lifecycle !== 'draft');
    memberCache.set(key, { at: Date.now(), ok });
    return ok;
}

/**
 * Middleware for file routes: a signed-in person (bearer token, or the media cookie set at
 * sign-in). With courseFiles, the first path segment is the course id and the person must
 * belong to that course.
 */
export function requireMediaAccess({ courseFiles = false } = {}) {
    return async (req, res, next) => {
        try {
            let user = req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : null;
            if (!user) {
                const id = await verifyMediaToken(cookieValue(req, MEDIA_COOKIE));
                if (id) user = await activeUser(id);
            }
            if (!user) {
                return res.status(401).json({ message: 'Sign up or log in to open this', code: 'LOGIN_REQUIRED' });
            }
            if (courseFiles) {
                const courseId = decodeURIComponent(String(req.path || '').split('/').filter(Boolean)[0] || '');
                if (!courseId || !await canOpenCourseFiles(user, courseId)) {
                    return res.status(403).json({ message: "This file belongs to a course you're not in" });
                }
            }
            req.mediaUser = user;
            next();
        } catch (error) {
            next(error);
        }
    };
}

/** For tests: forget cached users and memberships. */
export function clearMediaCaches() {
    userCache.clear();
    memberCache.clear();
}
