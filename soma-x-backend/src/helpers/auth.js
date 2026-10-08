import crypto from 'crypto';
import { serverDb } from './db-manager.js';

// Sessions end after 7 days, or after 12 hours without any request (shared school devices).
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
// Avoid a write on every request: refresh last_seen_at at most once a minute.
const LAST_SEEN_RESOLUTION_MS = 60 * 1000;

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function readBearerToken(req) {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

export async function createSession(userId, userAgent) {
    const token = crypto.randomBytes(32).toString('base64url');
    await serverDb.prepare(`
        INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
        VALUES (?, ?, ?, ?)
    `).run(hashToken(token), userId, new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(), userAgent || null);
    return token;
}

export async function revokeSession(token) {
    if (!token) return;
    await serverDb.prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL').run(hashToken(token));
}

export async function revokeUserSessions(userId, exceptToken) {
    if (exceptToken) {
        await serverDb.prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL AND token_hash <> ?').run(userId, hashToken(exceptToken));
    } else {
        await serverDb.prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL').run(userId);
    }
}

/**
 * Resolves the bearer token (if any) to req.user. Never rejects: routes decide via
 * requireAuth/requireRole. The role always comes from the users table, so role changes
 * and deactivations apply on the next request.
 */
export async function authenticate(req, res, next) {
    req.user = null;
    const token = readBearerToken(req);
    if (!token) return next();
    try {
        const row = await serverDb.prepare(`
            SELECT s.id AS session_id, s.last_seen_at, s.expires_at,
                   u.id, u.email, u.full_name, u.role, u.is_active, u.must_change_password
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.revoked_at IS NULL
        `).get(hashToken(token));
        if (!row) return next();

        const now = Date.now();
        const lastSeen = new Date(row.last_seen_at).getTime();
        if (new Date(row.expires_at).getTime() <= now || now - lastSeen > SESSION_IDLE_MS || Number(row.is_active) === 0) {
            return next();
        }
        if (now - lastSeen > LAST_SEEN_RESOLUTION_MS) {
            await serverDb.prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.session_id);
        }

        req.user = {
            id: row.id,
            email: String(row.email).toLowerCase(),
            fullName: row.full_name,
            role: row.role,
            mustChangePassword: Number(row.must_change_password) === 1,
        };
        req.sessionToken = token;
        next();
    } catch (error) {
        next(error);
    }
}

// Reachable without a session. Everything else requires one (deny by default).
const PUBLIC_ROUTES = [
    { method: 'POST', path: '/auth/login' },
    { method: 'POST', path: '/auth/register' },
    { method: 'GET', path: '/analytics/branding' },
    { method: 'POST', path: '/auth/media-session' },
    // The catalogue guests may browse before signing up (titles, categories, covers).
    { method: 'GET', path: '/content/main-categories' },
    { method: 'GET', path: '/content/levels/summary' },
    { method: 'GET', path: '/content/custom-content/summary' },
    { method: 'GET', path: '/library/books' },
    { method: 'GET', path: '/library/categories' },
    { method: 'GET', path: '/courses/public' },
    // Files opened by <video>/<iframe>/PDF viewers, which can't send a bearer token. These
    // routes check the signed media cookie themselves (helpers/media.js).
    { method: 'GET', prefix: '/library/file/' },
    { method: 'GET', prefix: '/content/files/' },
    { method: 'GET', prefix: '/content/content/' },
];

// Reachable while a password change is pending, so the user can do it and log out.
const PASSWORD_CHANGE_ROUTES = [
    { method: 'GET', path: '/auth/me' },
    { method: 'POST', path: '/auth/logout' },
    { method: 'PATCH', path: '/users/profile/password' },
    { method: 'GET', path: '/users/profile/view' },
    { method: 'GET', path: '/analytics/branding' },
];

function matches(list, req) {
    const path = req.path.replace(/\/+$/, '') || '/';
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    return list.some((r) => r.method === method && (r.prefix ? req.path.startsWith(r.prefix) : r.path === path));
}

/** Global gate mounted before every API router. */
export function requireAuthUnlessPublic(req, res, next) {
    if (req.method === 'OPTIONS' || matches(PUBLIC_ROUTES, req)) return next();
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue' });
    if (req.user.mustChangePassword && !matches(PASSWORD_CHANGE_ROUTES, req)) {
        return res.status(403).json({ message: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    next();
}

export function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue' });
    next();
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Please log in to continue' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'You do not have permission to do this' });
        }
        next();
    };
}

export const PUBLIC_ROUTE_LIST = PUBLIC_ROUTES;

/**
 * Whose data a request is about. Defaults to the caller; another user's email is only
 * honoured for the given roles (e.g. an admin viewing a learner). Returns null when the
 * caller may not view the requested user; the route should then answer 403.
 */
export function subjectEmail(req, requested, rolesAllowedForOthers = ['admin']) {
    const target = String(requested || '').trim().toLowerCase();
    if (!target || target === req.user.email) return req.user.email;
    return rolesAllowedForOthers.includes(req.user.role) ? target : null;
}
