import { Router } from 'express';
import { localDb, serverDb } from '../helpers/db-manager.js';
import { requireRole } from '../helpers/auth.js';
import { profileComplete } from './users.service.js';
import { publish } from '../helpers/live.js';

const router = Router();
const requireAdmin = requireRole('admin');

// Notification links must stay inside the app (no external or protocol-relative URLs).
function safeInternalLink(link) {
    if (!link) return null;
    const value = String(link).trim();
    return value.startsWith('/') && !value.startsWith('//') ? value : undefined;
}

/**
 * Helper utility to create a system notification. `key` and `params`: the text's key under
 * shell.notifications.kinds (with {placeholders} filled from params), shown in the reader's
 * language; title and message are the English, kept as the fallback.
 */
export async function createNotification({ userEmail, title, message, type = 'system', link = null, key = null, params = null }) {
    if (!userEmail) return null;
    const normalizedEmail = userEmail.trim().toLowerCase();
    try {
        const stmt = localDb.prepare(`
            INSERT INTO user_notifications (user_email, title, message, type, link, text_key, text_params)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const info = await stmt.run(normalizedEmail, title, message, type, link, key, params ? JSON.stringify(params) : null);
        publish({ kind: 'notifications' }, { emails: [normalizedEmail] });
        return info.lastInsertRowid;
    } catch (err) {
        console.error("Failed to create notification:", err);
        return null;
    }
}

/**
 * GET /notifications?userEmail=...
 * Returns list of user notifications, unread count, and auto-injects profile reminder if incomplete.
 */
router.get('/', async (req, res) => {
    const userEmail = req.user.email;

    try {
        // 1. A reminder while their first-visit profile isn't finished (the same rule as the profile form).
        const user = await serverDb.prepare('SELECT role, gender, profile_completed_at FROM users WHERE LOWER(email) = LOWER(?)').get(userEmail);
        const isProfileIncomplete = !!user && !profileComplete(user);
        if (isProfileIncomplete) {
            const existingReminder = await localDb.prepare(`
                SELECT id FROM user_notifications
                WHERE LOWER(user_email) = LOWER(?) AND type = 'profile_reminder' AND is_read = 0
            `).get(userEmail);
            if (!existingReminder) {
                await createNotification({
                    userEmail,
                    title: "Finish your profile",
                    message: "Answer the few questions about you (gender and accessibility needs) to finish your SOMABOX profile.",
                    type: "profile_reminder",
                    link: user.role === 'teacher' ? "/teacher/settings" : "/account",
                });
            }
        }

        // 2. Fetch all notifications for user
        const notifications = await localDb.prepare(`
            SELECT id, user_email, title, message, type, link, is_read, created_at, text_key, text_params
            FROM user_notifications
            WHERE LOWER(user_email) = LOWER(?)
            ORDER BY created_at DESC
            LIMIT 50
        `).all(userEmail);

        const unreadCount = notifications.filter(n => Number(n.is_read) === 0).length;

        res.json({
            notifications,
            unreadCount,
            isProfileIncomplete,
        });
    } catch (err) {
        console.error("GET /notifications error:", err);
        res.status(500).json({ message: "Failed to fetch notifications" });
    }
});

/**
 * POST /notifications
 * Create a new notification manually
 */
router.post('/', requireAdmin, async (req, res) => {
    const { userEmail, title, message, type } = req.body;
    if (!userEmail || !title || !message) {
        return res.status(400).json({ message: "userEmail, title, and message are required" });
    }
    const link = safeInternalLink(req.body.link);
    if (link === undefined) return res.status(400).json({ message: "link must be a path inside the app, e.g. /account" });

    const id = await createNotification({ userEmail, title, message, type, link });
    if (id) {
        res.status(201).json({ id, message: "Notification created successfully" });
    } else {
        res.status(500).json({ message: "Failed to create notification" });
    }
});

/**
 * PATCH /notifications/:id/read
 * Mark single notification as read
 */
router.patch('/:id/read', async (req, res) => {
    const { id } = req.params;
    try {
        await localDb.prepare(`UPDATE user_notifications SET is_read = 1 WHERE id = ? AND LOWER(user_email) = LOWER(?)`).run(id, req.user.email);
        res.json({ message: "Notification marked as read" });
    } catch (err) {
        console.error("PATCH /notifications/:id/read error:", err);
        res.status(500).json({ message: "Failed to mark notification as read" });
    }
});

/**
 * POST /notifications/read-all
 * Mark all notifications for a user as read
 */
router.post('/read-all', async (req, res) => {
    try {
        await localDb.prepare(`
            UPDATE user_notifications SET is_read = 1 WHERE LOWER(user_email) = LOWER(?)
        `).run(req.user.email);
        res.json({ message: "All notifications marked as read" });
    } catch (err) {
        console.error("POST /notifications/read-all error:", err);
        res.status(500).json({ message: "Failed to mark all as read" });
    }
});

/**
 * DELETE /notifications/:id
 * Dismisses one of the user's own notifications for good (the bell's Dismiss button)
 */
router.delete('/:id', async (req, res) => {
    try {
        await localDb.prepare(`DELETE FROM user_notifications WHERE id = ? AND LOWER(user_email) = LOWER(?)`).run(req.params.id, req.user.email);
        res.json({ message: "Notification dismissed" });
    } catch (err) {
        console.error("DELETE /notifications/:id error:", err);
        res.status(500).json({ message: "Failed to dismiss notification" });
    }
});

/**
 * POST /notifications/send
 * Allows Admin users to broadcast notifications to students, teachers, admins, or specific users
 */
router.post('/send', requireAdmin, async (req, res) => {
    try {
        const { targetRole, targetEmail, title, message, type = 'announcement' } = req.body;

        if (!title || !message) {
            return res.status(400).json({ message: "title and message are required" });
        }
        const link = safeInternalLink(req.body.link);
        if (link === undefined) return res.status(400).json({ message: "link must be a path inside the app, e.g. /account" });

        let recipientEmails = [];

        if (targetRole === 'specific') {
            if (!targetEmail || !targetEmail.trim()) {
                return res.status(400).json({ message: "targetEmail is required for specific recipient" });
            }
            recipientEmails = [targetEmail.trim().toLowerCase()];
        } else if (targetRole === 'all' || !targetRole) {
            const users = await serverDb.prepare(`SELECT email FROM users`).all();
            recipientEmails = users.map(u => u.email.toLowerCase());
        } else {
            // Target specific role: scholar, teacher, admin
            const users = await serverDb.prepare(`
                SELECT email FROM users WHERE LOWER(role) = LOWER(?)
            `).all(targetRole.trim().toLowerCase());
            recipientEmails = users.map(u => u.email.toLowerCase());
        }

        if (recipientEmails.length === 0) {
            return res.status(404).json({ message: "No matching recipients found for the target role" });
        }

        let sentCount = 0;
        const insertStmt = localDb.prepare(`
            INSERT INTO user_notifications (user_email, title, message, type, link)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const email of recipientEmails) {
            await insertStmt.run(email, title.trim(), message.trim(), type, link);
            sentCount++;
        }

        publish({ kind: 'notifications' }, { emails: recipientEmails });
        return res.status(201).json({
            count: sentCount,
            message: `Notification broadcast successfully sent to ${sentCount} recipient(s)`
        });
    } catch (err) {
        console.error("POST /notifications/send error:", err);
        return res.status(500).json({ message: err.message || "Failed to broadcast notification" });
    }
});

export default router;
