import express from 'express';
import bcrypt from "bcrypt";
import { serverDb } from '../helpers/db-manager.js';
import { createSession, revokeSession } from '../helpers/auth.js';
import { setMediaCookie, clearMediaCookie } from '../helpers/media.js';
import { assignLearnerCode, applySchoolToLearner } from './school.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        // Learners can sign in with their email or their learner code (e.g. "GSK-0001").
        const email = String(req.body.email || req.body.username || req.body.learnerCode || '').trim().toLowerCase();
        const password = req.body.password;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email (or learner code) and password required' });
        }
        
        const row = email.includes('@')
            ? await serverDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email)
            : await serverDb.prepare('SELECT * FROM users WHERE UPPER(learner_code) = UPPER(?)').get(email);
        
        if (!row) {
            return res.status(401).json({ message: 'Invalid email, learner code, or password' });
        }

        if (row.is_active === 0) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact an administrator.' });
        }
        
        const match = await bcrypt.compare(password, row.password_hash);
        if (!match) {
            return res.status(401).json({ message: 'Invalid email, learner code, or password' });
        }

        const token = await createSession(row.id, req.headers['user-agent']);
        await setMediaCookie(res, row.id);

        return res.json({
            message: 'Login successful',
            token,
            user: {
                id: row.id,
                email: row.email,
                full_name: row.full_name,
                phone: row.phone,
                school_name: row.school_name,
                grade_level: row.grade_level,
                preferred_language: row.preferred_language,
                role: row.role,
                learner_code: row.learner_code,
                created_at: row.created_at,
                must_change_password: Number(row.must_change_password) === 1
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Public self-registration. Always creates a scholar; staff accounts are created by admins.
router.post('/register', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const fullName = String(req.body.fullName || '').trim();

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'Enter a valid email address' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const existing = await serverDb.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
        if (existing) {
            return res.status(409).json({ message: 'An account with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const row = await serverDb.prepare(`
            INSERT INTO users (email, full_name, password_hash, role)
            VALUES (?, ?, ?, 'scholar')
            RETURNING id, email, full_name, role, created_at
        `).get(email, fullName, passwordHash);

        // A new learner belongs to this box's school and gets a learner code straight away.
        await applySchoolToLearner(row.id);
        const learnerCode = await assignLearnerCode(row.id);
        const token = await createSession(row.id, req.headers['user-agent']);
        await setMediaCookie(res, row.id);
        return res.status(201).json({
            message: 'Account created',
            token,
            user: { ...row, learner_code: learnerCode, must_change_password: false }
        });
    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

async function sendCurrentUser(req, res) {
    try {
        const row = await serverDb.prepare(`
            SELECT id, email, full_name, phone, school_name, grade_level, preferred_language, role, created_at, must_change_password, learner_code
            FROM users WHERE id = ?
        `).get(req.user.id);
        if (!row) return res.status(401).json({ message: 'Please log in to continue' });
        return res.json({
            user: {
                id: row.id,
                email: row.email,
                full_name: row.full_name,
                phone: row.phone,
                school_name: row.school_name,
                grade_level: row.grade_level,
                preferred_language: row.preferred_language,
                role: row.role,
                learner_code: row.learner_code,
                created_at: row.created_at,
                must_change_password: Number(row.must_change_password) === 1
            }
        });
    } catch (error) {
        console.error('Error loading current user:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

// The global auth gate guarantees req.user here.
router.get('/me', sendCurrentUser);
router.get('/verify-auth', sendCurrentUser);

router.post('/logout', async (req, res) => {
    try {
        await revokeSession(req.sessionToken);
        clearMediaCookie(res);
        return res.json({ message: 'Logged out' });
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Renews the media cookie for a signed-in session (the app calls this on load and every few
// hours), so files keep opening for people who signed in before the cookie existed or long ago.
router.post('/media-session', async (req, res) => {
    if (!req.user) {
        clearMediaCookie(res);
        return res.status(401).json({ message: 'Please log in to continue' });
    }
    await setMediaCookie(res, req.user.id);
    return res.json({ ok: true });
});

export default router;
