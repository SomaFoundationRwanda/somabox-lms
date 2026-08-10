import express from 'express';
import bcrypt from "bcrypt";

import { serverDb } from '../helpers/db-manager.js';

const router = express.Router();

export const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

/**
 * Helper to log admin audit action
 */
export function logAdminAuditAction({ adminEmail, action, targetUserId = null, targetUserEmail = null, details = null }) {
    try {
        if (!adminEmail) return;
        serverDb.prepare(`
            INSERT INTO admin_audit_logs (admin_email, action, target_user_id, target_user_email, details)
            VALUES (?, ?, ?, ?, ?)
        `).run(adminEmail.trim().toLowerCase(), action, targetUserId, targetUserEmail, details);
    } catch (e) {
        console.error("Failed to log admin audit action:", e);
    }
}

router.get('/', (req, res) => {
    try {
        const search = String(req.query.search || '').trim();
        const roles = String(req.query.role || '').trim(); // e.g. "admin,teacher"
        const status = String(req.query.status || 'all').trim().toLowerCase(); // "active", "inactive", "all"
        const dateRange = String(req.query.dateRange || 'all').trim().toLowerCase(); // "7days", "30days", "all"
        const sortBy = String(req.query.sortBy || 'created_at').trim().toLowerCase();
        const sortOrder = String(req.query.sortOrder || 'desc').trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
        const offset = (page - 1) * limit;

        let whereClauses = [];
        let params = [];

        // Search partial match on full_name or email
        if (search) {
            whereClauses.push('(LOWER(full_name) LIKE ? OR LOWER(email) LIKE ?)');
            const s = `%${search.toLowerCase()}%`;
            params.push(s, s);
        }

        // Role filter
        if (roles && roles.toLowerCase() !== 'all') {
            const roleList = roles.split(',').map(r => r.trim().toLowerCase()).filter(Boolean);
            if (roleList.length > 0) {
                const placeholders = roleList.map(() => '?').join(',');
                whereClauses.push(`LOWER(role) IN (${placeholders})`);
                params.push(...roleList);
            }
        }

        // Status filter
        if (status === 'active') {
            whereClauses.push('(is_active IS NULL OR is_active = 1)');
        } else if (status === 'inactive') {
            whereClauses.push('is_active = 0');
        }

        // Date range filter
        if (dateRange === '7days') {
            whereClauses.push("created_at >= datetime('now', '-7 days')");
        } else if (dateRange === '30days') {
            whereClauses.push("created_at >= datetime('now', '-30 days')");
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Sorting
        let sortColumn = 'created_at';
        if (sortBy === 'name') sortColumn = 'full_name';
        else if (sortBy === 'status') sortColumn = 'is_active';
        else if (sortBy === 'role') sortColumn = 'role';

        // Count total
        const countStmt = serverDb.prepare(`SELECT COUNT(*) as total FROM users ${whereSql}`);
        const { total } = countStmt.get(...params);

        // Query users
        const queryStmt = serverDb.prepare(`
            SELECT id, email, full_name, role, phone, school_name, grade_level, preferred_language,
                   gender, region_province, region_district, is_rural, disability_status,
                   COALESCE(is_active, 1) as is_active, created_at
            FROM users
            ${whereSql}
            ORDER BY ${sortColumn} ${sortOrder}
            LIMIT ? OFFSET ?
        `);
        
        const users = queryStmt.all(...params, limit, offset);

        res.json({
            users,
            total,
            page,
            totalPages: Math.ceil(total / limit) || 1,
            limit
        });
    } catch (err) {
        console.error("GET /users error:", err);
        res.status(500).json({ message: err.message });
    }
});

router.get('/:id', (req, res) => {
    const stmt = serverDb.prepare('SELECT *, COALESCE(is_active, 1) as is_active FROM users WHERE id = ?');
    const user = stmt.get(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
});

router.get('/profile/view', (req, res) => {
    try {
        const email = String(req.query.email || '').trim().toLowerCase();
        const role = String(req.query.role || '').trim().toLowerCase();

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        let query = `
            SELECT id, email, full_name, role, phone, school_name, grade_level, preferred_language,
                   gender, region_province, region_district, is_rural, disability_status, accessibility_profile, created_at
            FROM users
            WHERE LOWER(email) = LOWER(?)
        `;
        const params = [email];
        if (role) {
            query += ` AND LOWER(role) = LOWER(?)`;
            params.push(role);
        }

        const user = serverDb.prepare(query).get(...params);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const hasGender = Boolean(user.gender && user.gender !== 'prefer_not_to_say' && user.gender.trim() !== '');
        const hasProvince = Boolean(user.region_province && user.region_province !== 'Not Specified' && user.region_province.trim() !== '');
        const hasDistrict = Boolean(user.region_district && user.region_district !== 'Not Specified' && user.region_district.trim() !== '');

        const isProfileComplete = hasGender && hasProvince && hasDistrict;

        return res.json({
            ...user,
            isProfileComplete
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.post('/', async (req, res) => {
  try {
    const { email, password, role, fullName, phone, schoolName, gradeLevel, preferredLanguage, gender, regionProvince, regionDistrict, isRural, disabilityStatus, accessibilityProfile } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }

    const existingUser = serverDb.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const password_hash = await hashPassword(password);
    const accessibility_profile = accessibilityProfile ? (typeof accessibilityProfile === 'object' ? JSON.stringify(accessibilityProfile) : String(accessibilityProfile)) : '{}';

    const insert = serverDb.prepare(`
      INSERT INTO users (
        email, password_hash, role, full_name, phone, school_name, grade_level, preferred_language,
        gender, region_province, region_district, is_rural, disability_status, accessibility_profile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      normalizedEmail,
      password_hash,
      role,
      fullName || '',
      phone || null,
      schoolName || null,
      gradeLevel || null,
      preferredLanguage || null,
      gender || 'prefer_not_to_say',
      regionProvince || 'Not Specified',
      regionDistrict || 'Not Specified',
      isRural ? 1 : 0,
      disabilityStatus || 'none',
      accessibility_profile
    );

    res.status(201).json({
      message: 'User created successfully',
      user: { email: normalizedEmail, role, full_name: fullName || '' }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: error.message });
  }
});



router.patch('/:id', async (req, res) => {
    try {
        const email = req.body.email !== undefined ? String(req.body.email || '').trim().toLowerCase() : undefined;
        const fullName = req.body.fullName !== undefined ? String(req.body.fullName || '').trim() : undefined;
        const role = req.body.role !== undefined ? String(req.body.role || '').trim().toLowerCase() : undefined;
        const phone = req.body.phone !== undefined ? String(req.body.phone || '').trim() : undefined;
        const schoolName = req.body.schoolName !== undefined ? String(req.body.schoolName || '').trim() : undefined;
        const gradeLevel = req.body.gradeLevel !== undefined ? String(req.body.gradeLevel || '').trim() : undefined;
        const preferredLanguage = req.body.preferredLanguage !== undefined ? String(req.body.preferredLanguage || '').trim() : undefined;
        const gender = req.body.gender !== undefined ? String(req.body.gender || '').trim() : undefined;
        const regionProvince = req.body.regionProvince !== undefined ? String(req.body.regionProvince || '').trim() : undefined;
        const regionDistrict = req.body.regionDistrict !== undefined ? String(req.body.regionDistrict || '').trim() : undefined;
        const isRural = req.body.isRural !== undefined ? (req.body.isRural ? 1 : 0) : undefined;
        const disabilityStatus = req.body.disabilityStatus !== undefined ? String(req.body.disabilityStatus || '').trim() : undefined;
        const accessibilityProfile = req.body.accessibilityProfile !== undefined ? (typeof req.body.accessibilityProfile === 'object' ? JSON.stringify(req.body.accessibilityProfile) : String(req.body.accessibilityProfile)) : undefined;
        const password = req.body.password;
        const userId = req.params.id;

        if (
            email === undefined &&
            fullName === undefined &&
            role === undefined &&
            phone === undefined &&
            schoolName === undefined &&
            gradeLevel === undefined &&
            preferredLanguage === undefined &&
            gender === undefined &&
            regionProvince === undefined &&
            regionDistrict === undefined &&
            isRural === undefined &&
            disabilityStatus === undefined &&
            accessibilityProfile === undefined &&
            !password
        ) {
            return res.status(400).json({ message: 'At least one field is required for update' });
        }

        let query = 'UPDATE users SET ';
        const params = [];
        const updates = [];

        if (email !== undefined) { updates.push('email = ?'); params.push(email); }
        if (fullName !== undefined) { updates.push('full_name = ?'); params.push(fullName); }
        if (role !== undefined) { updates.push('role = ?'); params.push(role); }
        if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
        if (schoolName !== undefined) { updates.push('school_name = ?'); params.push(schoolName || null); }
        if (gradeLevel !== undefined) { updates.push('grade_level = ?'); params.push(gradeLevel || null); }
        if (preferredLanguage !== undefined) { updates.push('preferred_language = ?'); params.push(preferredLanguage || null); }
        if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
        if (regionProvince !== undefined) { updates.push('region_province = ?'); params.push(regionProvince); }
        if (regionDistrict !== undefined) { updates.push('region_district = ?'); params.push(regionDistrict); }
        if (isRural !== undefined) { updates.push('is_rural = ?'); params.push(isRural); }
        if (disabilityStatus !== undefined) { updates.push('disability_status = ?'); params.push(disabilityStatus); }
        if (accessibilityProfile !== undefined) { updates.push('accessibility_profile = ?'); params.push(accessibilityProfile); }
        if (password) {
            const password_hash = await hashPassword(password);
            updates.push('password_hash = ?');
            params.push(password_hash);
        }

        query += updates.join(', ') + ' WHERE id = ?';
        params.push(userId);

        const stmt = serverDb.prepare(query);
        const info = stmt.run(...params);

        if (info.changes === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: error.message });
    }
});

router.patch('/profile/update', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const fullName = req.body.fullName !== undefined ? String(req.body.fullName).trim() : undefined;
        const phone = req.body.phone !== undefined ? String(req.body.phone).trim() : undefined;
        const schoolName = req.body.schoolName !== undefined ? String(req.body.schoolName).trim() : undefined;
        const gradeLevel = req.body.gradeLevel !== undefined ? String(req.body.gradeLevel).trim() : undefined;
        const preferredLanguage = req.body.preferredLanguage !== undefined ? String(req.body.preferredLanguage).trim() : undefined;
        const gender = req.body.gender !== undefined ? String(req.body.gender).trim() : undefined;
        const regionProvince = req.body.regionProvince !== undefined ? String(req.body.regionProvince).trim() : undefined;
        const regionDistrict = req.body.regionDistrict !== undefined ? String(req.body.regionDistrict).trim() : undefined;
        const isRural = req.body.isRural !== undefined ? (req.body.isRural ? 1 : 0) : undefined;
        const disabilityStatus = req.body.disabilityStatus !== undefined ? String(req.body.disabilityStatus).trim() : undefined;

        if (!email) {
            return res.status(400).json({ message: 'User email is required' });
        }

        const user = serverDb.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
        if (!user) {
            return res.status(404).json({ message: 'User account not found' });
        }

        let query = 'UPDATE users SET ';
        const params = [];
        const updates = [];

        if (fullName !== undefined) { updates.push('full_name = ?'); params.push(fullName); }
        if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
        if (schoolName !== undefined) { updates.push('school_name = ?'); params.push(schoolName || null); }
        if (gradeLevel !== undefined) { updates.push('grade_level = ?'); params.push(gradeLevel || null); }
        if (preferredLanguage !== undefined) { updates.push('preferred_language = ?'); params.push(preferredLanguage || null); }
        if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
        if (regionProvince !== undefined) { updates.push('region_province = ?'); params.push(regionProvince); }
        if (regionDistrict !== undefined) { updates.push('region_district = ?'); params.push(regionDistrict); }
        if (isRural !== undefined) { updates.push('is_rural = ?'); params.push(isRural); }
        if (disabilityStatus !== undefined) { updates.push('disability_status = ?'); params.push(disabilityStatus); }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'No fields provided to update' });
        }

        query += updates.join(', ') + ' WHERE id = ?';
        params.push(user.id);

        serverDb.prepare(query).run(...params);

        // Auto-mark any profile completion notifications as read in localDb
        try {
            const { localDb } = await import('../helpers/db-manager.js');
            localDb.prepare(`
                UPDATE user_notifications SET is_read = 1 WHERE user_email = ? AND type = 'profile_reminder'
            `).run(email);
        } catch (e) {
            console.error("Failed to mark profile_reminder notification as read:", e);
        }

        return res.json({ message: 'Profile information updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.patch('/profile/password', async (req, res) => {
    try {
        const currentEmail = String(req.body.currentEmail || '').trim().toLowerCase();
        const currentRole = String(req.body.currentRole || '').trim().toLowerCase();
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');

        if (!currentEmail || !currentRole || !currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current email, role, and passwords are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const user = serverDb
            .prepare('SELECT id, password_hash FROM users WHERE LOWER(email) = LOWER(?) AND LOWER(role) = LOWER(?)')
            .get(currentEmail, currentRole);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        const passwordHash = await hashPassword(newPassword);
        serverDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

        return res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        return res.status(500).json({ message: error.message });
    }
});

/**
 * PATCH /users/:id/status
 * Soft deactivate or reactivate user account
 */
router.patch('/:id/status', (req, res) => {
    try {
        const { id } = req.params;
        const { isActive, adminEmail } = req.body;

        const user = serverDb.prepare('SELECT id, email, full_name, is_active FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const newStatus = isActive ? 1 : 0;
        serverDb.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);

        const actionName = newStatus === 1 ? 'REACTIVATE_USER' : 'DEACTIVATE_USER';
        logAdminAuditAction({
            adminEmail,
            action: actionName,
            targetUserId: user.id,
            targetUserEmail: user.email,
            details: `User ${user.email} status set to ${newStatus === 1 ? 'Active' : 'Inactive'}`
        });

        res.json({
            message: `User ${newStatus === 1 ? 'reactivated' : 'deactivated'} successfully`,
            is_active: newStatus
        });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * PATCH /users/:id/reset-password
 * Admin password reset
 */
router.patch('/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword, adminEmail } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const user = serverDb.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordHash = await hashPassword(newPassword);
        serverDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);

        logAdminAuditAction({
            adminEmail,
            action: 'RESET_USER_PASSWORD',
            targetUserId: user.id,
            targetUserEmail: user.email,
            details: `Password reset by admin ${adminEmail}`
        });

        res.json({ message: 'User password reset successfully' });
    } catch (error) {
        console.error('Error resetting user password:', error);
        res.status(500).json({ message: error.message });
    }
});

/**
 * POST /users/bulk-action
 * Perform bulk operations (bulk_role, bulk_deactivate, bulk_reactivate, bulk_delete)
 */
router.post('/bulk-action', (req, res) => {
    try {
        const { userIds, action, newRole, adminEmail } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'userIds array is required' });
        }

        const placeholders = userIds.map(() => '?').join(',');
        let affected = 0;

        if (action === 'bulk_deactivate') {
            const stmt = serverDb.prepare(`UPDATE users SET is_active = 0 WHERE id IN (${placeholders})`);
            const info = stmt.run(...userIds);
            affected = info.changes;
            logAdminAuditAction({ adminEmail, action: 'BULK_DEACTIVATE', details: `Deactivated ${affected} users` });
        } else if (action === 'bulk_reactivate') {
            const stmt = serverDb.prepare(`UPDATE users SET is_active = 1 WHERE id IN (${placeholders})`);
            const info = stmt.run(...userIds);
            affected = info.changes;
            logAdminAuditAction({ adminEmail, action: 'BULK_REACTIVATE', details: `Reactivated ${affected} users` });
        } else if (action === 'bulk_role') {
            if (!newRole || !['admin', 'teacher', 'scholar'].includes(newRole.toLowerCase())) {
                return res.status(400).json({ message: 'Valid newRole is required' });
            }
            const stmt = serverDb.prepare(`UPDATE users SET role = ? WHERE id IN (${placeholders})`);
            const info = stmt.run(newRole.toLowerCase(), ...userIds);
            affected = info.changes;
            logAdminAuditAction({ adminEmail, action: 'BULK_ROLE_CHANGE', details: `Changed role to ${newRole} for ${affected} users` });
        } else if (action === 'bulk_delete') {
            const stmt = serverDb.prepare(`DELETE FROM users WHERE id IN (${placeholders})`);
            const info = stmt.run(...userIds);
            affected = info.changes;
            logAdminAuditAction({ adminEmail, action: 'BULK_DELETE', details: `Deleted ${affected} users` });
        } else {
            return res.status(400).json({ message: 'Invalid bulk action specified' });
        }

        res.json({ message: `Bulk action completed successfully on ${affected} user(s)`, count: affected });
    } catch (error) {
        console.error('Error executing bulk action:', error);
        res.status(500).json({ message: error.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const adminEmail = req.body?.adminEmail || req.query?.adminEmail;

        const user = serverDb.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        serverDb.prepare('DELETE FROM users WHERE id = ?').run(id);

        logAdminAuditAction({
            adminEmail,
            action: 'DELETE_USER',
            targetUserId: user.id,
            targetUserEmail: user.email,
            details: `Hard deleted user ${user.email}`
        });

        res.status(200).json({ message: 'User deleted permanently' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: error.message });
    }
});

export default router;