import { Router } from 'express';
import { localDb, serverDb } from '../helpers/db-manager.js';

const router = Router();

/**
 * Helper utility to create a system notification
 */
export async function createNotification({ userEmail, title, message, type = 'system', link = null }) {
    if (!userEmail) return null;
    const normalizedEmail = userEmail.trim().toLowerCase();
    try {
        const stmt = localDb.prepare(`
            INSERT INTO user_notifications (user_email, title, message, type, link)
            VALUES (?, ?, ?, ?, ?)
        `);
        const info = await stmt.run(normalizedEmail, title, message, type, link);
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
    const userEmail = req.query.userEmail?.trim()?.toLowerCase();
    if (!userEmail) {
        return res.status(400).json({ message: "userEmail query parameter is required" });
    }

    try {
        // 1. Check if user's profile is incomplete in serverDb
        const user = await serverDb.prepare(`
            SELECT gender, region_province, region_district, is_rural
            FROM users WHERE LOWER(email) = LOWER(?)
        `).get(userEmail);

        let isProfileIncomplete = false;
        if (user) {
            const hasGender = user.gender && user.gender !== 'prefer_not_to_say';
            const hasProvince = !!(user.region_province && user.region_province.trim());
            const hasDistrict = !!(user.region_district && user.region_district.trim());
            
            if (!hasGender || !hasProvince || !hasDistrict) {
                isProfileIncomplete = true;

                // Check if an unread profile_reminder already exists
                const existingReminder = await localDb.prepare(`
                    SELECT id FROM user_notifications
                    WHERE LOWER(user_email) = LOWER(?) AND type = 'profile_reminder' AND is_read = 0
                `).get(userEmail);

                if (!existingReminder) {
                    await createNotification({
                        userEmail,
                        title: "Complete Your Profile",
                        message: "Please fill in your gender, province, and district information to complete your SomaBox profile.",
                        type: "profile_reminder",
                        link: "/account",
                    });
                }
            }
        }

        // 2. Fetch all notifications for user
        const notifications = await localDb.prepare(`
            SELECT id, user_email, title, message, type, link, is_read, created_at
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
router.post('/', async (req, res) => {
    const { userEmail, title, message, type, link } = req.body;
    if (!userEmail || !title || !message) {
        return res.status(400).json({ message: "userEmail, title, and message are required" });
    }

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
        await localDb.prepare(`UPDATE user_notifications SET is_read = 1 WHERE id = ?`).run(id);
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
    const { userEmail } = req.body;
    if (!userEmail) return res.status(400).json({ message: "userEmail is required" });

    try {
        await localDb.prepare(`
            UPDATE user_notifications SET is_read = 1 WHERE LOWER(user_email) = LOWER(?)
        `).run(userEmail.trim().toLowerCase());
        res.json({ message: "All notifications marked as read" });
    } catch (err) {
        console.error("POST /notifications/read-all error:", err);
        res.status(500).json({ message: "Failed to mark all as read" });
    }
});

/**
 * POST /notifications/send
 * Allows Admin users to broadcast notifications to students, teachers, admins, or specific users
 */
router.post('/send', async (req, res) => {
    try {
        const { senderEmail, targetRole, targetEmail, title, message, type = 'announcement', link = null } = req.body;
        
        if (!senderEmail || !title || !message) {
            return res.status(400).json({ message: "senderEmail, title, and message are required" });
        }

        // Verify sender is an Admin
        const sender = await serverDb.prepare(`
            SELECT id, role FROM users WHERE LOWER(email) = LOWER(?)
        `).get(senderEmail.trim().toLowerCase());

        if (!sender || sender.role.toLowerCase() !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Only Admin users can broadcast notifications" });
        }

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
            await insertStmt.run(email, title.trim(), message.trim(), type, link ? link.trim() : null);
            sentCount++;
        }

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
