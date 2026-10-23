// Setting up a new box, and recovering its admin, with a one-time code that only someone at the
// box itself can read: the backend prints it when it starts without an admin, and
// `pnpm setup:code` (run on the box) prints a new one. Nobody on the Wi-Fi can claim the box.
//
// - No admin yet: the code is for setup. The form names the school and creates the first admin.
// - Admins exist: `pnpm setup:code` issues a recovery code (valid 1 hour), which sets a new
//   password for an admin or creates another admin. Setup is otherwise closed for good.
import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcrypt';
import { localDb } from '../helpers/db-manager.js';
import { createSession, revokeUserSessions } from '../helpers/auth.js';
import { setMediaCookie } from '../helpers/media.js';
import { loginRetryAfter, recordLoginFailure, clearLoginFailures } from '../helpers/login-throttle.js';
import { applySchoolToEveryone } from './school.js';
import { logAdminAuditAction } from './users.service.js';

const router = express.Router();

const SETUP_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVER_TTL_MS = 60 * 60 * 1000;
// No 0/O or 1/I/L, so a code read off a screen can be typed back without mistakes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const THROTTLE_KEY = 'box-setup';

const normalize = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (code) => crypto.createHash('sha256').update(normalize(code)).digest('hex');

function randomCode() {
    const chars = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export async function hasAdmin() {
    return !!(await localDb.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get());
}

/**
 * Replaces any earlier code with a new one and returns it (to print, never to send).
 * `code` presets it (SOMABOX_SETUP_CODE, for tests and scripted installs).
 */
export async function issueSetupCode({ code } = {}) {
    const purpose = (await hasAdmin()) ? 'recover' : 'setup';
    const value = code ? String(code).trim().toUpperCase() : randomCode();
    if (normalize(value).length < 8) throw new Error('A setup code needs at least 8 letters or digits');
    const expiresAt = new Date(Date.now() + (purpose === 'setup' ? SETUP_TTL_MS : RECOVER_TTL_MS));
    await localDb.prepare(`
        INSERT INTO box_setup_code (id, code_hash, purpose, expires_at) VALUES (1, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET code_hash = EXCLUDED.code_hash, purpose = EXCLUDED.purpose, expires_at = EXCLUDED.expires_at
    `).run(hashCode(value), purpose, expiresAt.toISOString());
    return { code: value, purpose, expiresAt };
}

export function printSetupCode({ code, purpose, expiresAt }) {
    const line = '='.repeat(64);
    const what = purpose === 'setup'
        ? 'This box has no admin yet. Open SOMABOX in a browser and enter this setup code:'
        : 'Admin recovery. Open SOMABOX at /setup in a browser and enter this code:';
    console.log(`\n${line}\n${what}\n\n    ${code}\n\nValid until ${expiresAt.toLocaleString()}. Keep it to yourself.\n${line}\n`);
}

/** At startup: a box without an admin gets a fresh setup code, printed in its console/logs. */
export async function prepareFirstRun() {
    if (await hasAdmin()) return;
    printSetupCode(await issueSetupCode({ code: process.env.SOMABOX_SETUP_CODE || undefined }));
}

/** The latest code, expired or not (`live` says whether it can still be used). */
async function currentCode() {
    const row = await localDb.prepare('SELECT code_hash, purpose, expires_at FROM box_setup_code WHERE id = 1').get();
    return row ? { ...row, live: new Date(row.expires_at).getTime() > Date.now() } : null;
}

// Public: the login page asks whether to send people to the setup page instead.
router.get('/status', async (req, res) => {
    try {
        const admin = await hasAdmin();
        const code = admin ? await currentCode() : null;
        return res.json({ needsSetup: !admin, recovering: !!code?.live && code.purpose === 'recover' });
    } catch (error) {
        console.error('Error reading setup status:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

/** { code, fullName, email, password, schoolName (setup only) } */
router.post('/', async (req, res) => {
    try {
        const retryAfter = loginRetryAfter(THROTTLE_KEY, req.ip);
        if (retryAfter) {
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({ message: 'Too many attempts. Wait a minute and try again.', code: 'TOO_MANY_ATTEMPTS', retryAfter });
        }
        const body = req.body || {};
        const stored = await currentCode();
        const admin = await hasAdmin();
        if (admin && stored?.purpose !== 'recover') {
            return res.status(409).json({ message: 'This box is already set up. Sign in instead.', code: 'ALREADY_SET_UP' });
        }
        const given = hashCode(body.code);
        if (!stored?.live || !normalize(body.code) || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(stored.code_hash))) {
            recordLoginFailure(THROTTLE_KEY, req.ip);
            return res.status(400).json({ message: 'That setup code is wrong or has expired. Run pnpm setup:code on the box for a new one.', code: 'BAD_SETUP_CODE' });
        }

        const fullName = String(body.fullName || '').trim().slice(0, 200);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const schoolName = String(body.schoolName || '').trim().slice(0, 200);
        if (!fullName) return res.status(400).json({ message: "Enter the admin's full name" });
        if (!/^[^\s@]+@[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
        if (password.length < 8) return res.status(400).json({ message: 'The admin password must be at least 8 characters' });
        if (stored.purpose === 'setup' && !schoolName) return res.status(400).json({ message: "Enter the school's name" });

        const existing = await localDb.prepare('SELECT id, role FROM users WHERE LOWER(email) = ?').get(email);
        if (existing && existing.role !== 'admin') {
            return res.status(409).json({ message: 'This email belongs to a teacher or learner. Use another email for the admin.' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const userId = await localDb.transaction(async () => {
            // The code works once: claim it first, so two people submitting at once can't both use it.
            const claimed = await localDb.prepare('DELETE FROM box_setup_code WHERE id = 1 AND code_hash = ? RETURNING id').get(stored.code_hash);
            if (!claimed) return null;
            let id = existing?.id;
            if (id) {
                await localDb.prepare('UPDATE users SET full_name = ?, password_hash = ?, must_change_password = 0, is_active = 1 WHERE id = ?').run(fullName, passwordHash, id);
            } else {
                id = (await localDb.prepare(`
                    INSERT INTO users (email, full_name, password_hash, role, profile_completed_at)
                    VALUES (?, ?, ?, 'admin', CURRENT_TIMESTAMP) RETURNING id
                `).get(email, fullName, passwordHash)).id;
            }
            if (stored.purpose === 'setup') {
                await localDb.prepare('INSERT INTO unit_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING').run();
                await localDb.prepare(`
                    UPDATE unit_branding SET school_name = ?, configured_at = COALESCE(configured_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `).run(schoolName);
                await applySchoolToEveryone();
            }
            return id;
        })();
        if (!userId) return res.status(409).json({ message: 'This setup code was just used. Sign in instead.', code: 'ALREADY_SET_UP' });

        clearLoginFailures(THROTTLE_KEY);
        if (existing) await revokeUserSessions(userId);
        await logAdminAuditAction({
            adminEmail: email,
            action: stored.purpose === 'setup' ? 'BOX_SETUP' : (existing ? 'ADMIN_RECOVERED' : 'ADMIN_ADDED_BY_RECOVERY'),
            targetUserId: userId,
            targetUserEmail: email,
            details: stored.purpose === 'setup' ? `Set up the box for ${schoolName}` : 'Admin access recovered with a code from the box',
        });

        const token = await createSession(userId, req.headers['user-agent']);
        await setMediaCookie(res, userId);
        return res.status(201).json({ token, user: { id: userId, email, full_name: fullName, role: 'admin', must_change_password: false } });
    } catch (error) {
        console.error('Error setting up the box:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
