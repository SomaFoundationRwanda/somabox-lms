import express from 'express';
import { renameEmailEverywhere, releaseEmail } from '../helpers/identity.js';
import bcrypt from "bcrypt";

import { serverDb, localDb } from '../helpers/db-manager.js';
import { requireRole, revokeUserSessions } from '../helpers/auth.js';

const router = express.Router();
const requireAdmin = requireRole('admin');
const VALID_ROLES = ['admin', 'teacher', 'scholar'];

// Columns safe to return about a user (never password_hash).
const PUBLIC_USER_COLUMNS = `id, email, full_name, role, phone, school_name, grade_level, preferred_language,
    gender, region_province, region_district, is_rural, disability_status, accessibility_profile,
    COALESCE(is_active, 1) AS is_active, created_at`;

export const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

/**
 * Helper to log admin audit action
 */
export async function logAdminAuditAction({ adminEmail, action, targetUserId = null, targetUserEmail = null, details = null }) {
    try {
        if (!adminEmail) return;
        await serverDb.prepare(`
            INSERT INTO admin_audit_logs (admin_email, action, target_user_id, target_user_email, details)
            VALUES (?, ?, ?, ?, ?)
        `).run(adminEmail.trim().toLowerCase(), action, targetUserId, targetUserEmail, details);
    } catch (e) {
        console.error("Failed to log admin audit action:", e);
    }
}

router.get('/', requireAdmin, async (req, res) => {
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
        const countRes = await countStmt.get(...params);
        const total = Number(countRes?.total || 0);

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
        
        const users = await queryStmt.all(...params, limit, offset);

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

router.get('/me/assignment-summary', async (req, res) => {
    try {
        const email = req.user.email;

        const enrolledCourseRows = await localDb.prepare(
            "SELECT course_id FROM enrollments WHERE LOWER(user_email) = LOWER(?) AND status = 'active'"
        ).all(email);
        const enrolledCourseIds = enrolledCourseRows.map((r) => r.course_id);

        const outstanding = [];
        let completedCount = 0;

        for (const courseId of enrolledCourseIds) {
            const course = await localDb.prepare("SELECT id, title FROM courses WHERE id = ?").get(courseId);
            if (!course) continue;

            const assignments = await localDb.prepare(
                "SELECT id, title, due_at FROM assignments WHERE course_id = ? AND published = 1"
            ).all(courseId);

            for (const a of assignments) {
                const submission = await localDb.prepare(
                    "SELECT grade FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)"
                ).get(a.id, email);

                const status = !submission ? 'not_submitted' : submission.grade != null ? 'graded' : 'submitted';

                if (status === 'graded') {
                    completedCount += 1;
                } else {
                    outstanding.push({
                        assignment_id: a.id,
                        course_id: courseId,
                        title: a.title,
                        course_title: course.title,
                        due_at: a.due_at,
                        overdue: status === 'not_submitted' && !!a.due_at && new Date(a.due_at) < new Date(),
                    });
                }
            }
        }

        outstanding.sort((x, y) => {
            if (!x.due_at && !y.due_at) return 0;
            if (!x.due_at) return 1;
            if (!y.due_at) return -1;
            return new Date(x.due_at) - new Date(y.due_at);
        });

        return res.json({
            outstanding,
            completed_count: completedCount,
            outstanding_count: outstanding.length,
        });
    } catch (error) {
        console.error('Error building assignment summary:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.get('/me/dashboard', async (req, res) => {
    try {
        const email = req.user.email;

        const enrolledRows = await localDb.prepare(`
            SELECT c.*, e.role AS my_role, e.status AS my_status
            FROM courses c
            JOIN enrollments e ON e.course_id = c.id
            WHERE LOWER(e.user_email) = LOWER(?) AND e.status = 'active'
              AND (e.role IN ('teacher', 'ta') OR c.lifecycle <> 'draft')
            ORDER BY c.created_at DESC
        `).all(email);

        const enrolledCourses = await Promise.all(enrolledRows.map(async (course) => {
            const totalRes = await localDb.prepare("SELECT COUNT(*) AS c FROM assignments WHERE course_id = ? AND published = 1").get(course.id);
            const totalAssignments = Number(totalRes?.c || 0);

            const gradedRes = await localDb.prepare(`
                SELECT COUNT(*) AS c FROM assignment_submissions s
                JOIN assignments a ON a.id = s.assignment_id
                WHERE a.course_id = ? AND a.published = 1 AND LOWER(s.scholar_email) = LOWER(?) AND s.grade IS NOT NULL
            `).get(course.id, email);
            const gradedAssignments = Number(gradedRes?.c || 0);

            const studentRes = await localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(course.id);
            const studentCount = Number(studentRes?.total || 0);

            // No published assignments yet means no progress figure, not 0%.
            const progress = totalAssignments > 0 ? Math.round((gradedAssignments / totalAssignments) * 100) : null;

            return {
                ...course,
                studentCount,
                progress,
                coverImageUrl: course.cover_image ? `/course-covers/${course.cover_image}` : null,
            };
        }));

        const publicRows = await localDb.prepare(
            "SELECT * FROM courses WHERE visibility = 'public' AND lifecycle = 'open' ORDER BY created_at DESC"
        ).all();

        const enrolledIds = new Set(enrolledCourses.map((c) => c.id));
        const publicCourses = await Promise.all(
            publicRows
                .filter((course) => !enrolledIds.has(course.id))
                .map(async (course) => {
                    const studentRes = await localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(course.id);
                    const studentCount = Number(studentRes?.total || 0);
                    return {
                        ...course,
                        studentCount,
                        coverImageUrl: course.cover_image ? `/course-covers/${course.cover_image}` : null,
                    };
                })
        );

        return res.json({ enrolled_courses: enrolledCourses, public_courses: publicCourses });
    } catch (error) {
        console.error('Error building dashboard:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        if (req.user.role !== 'admin' && String(req.user.id) !== String(req.params.id)) {
            return res.status(403).json({ message: 'You do not have permission to do this' });
        }
        const user = await serverDb.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/profile/view', async (req, res) => {
    try {
        const user = await serverDb.prepare(`
            SELECT id, email, full_name, role, phone, school_name, grade_level, preferred_language,
                   gender, region_province, region_district, is_rural, disability_status, accessibility_profile, created_at,
                   profile_completed_at
            FROM users
            WHERE id = ?
        `).get(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const hasGender = Boolean(user.gender && user.gender !== 'prefer_not_to_say' && user.gender.trim() !== '');
        const hasProvince = Boolean(user.region_province && user.region_province !== 'Not Specified' && user.region_province.trim() !== '');
        const hasDistrict = Boolean(user.region_district && user.region_district !== 'Not Specified' && user.region_district.trim() !== '');

        // Complete only once every required answer was given explicitly (see /profile/update).
        // Admins aren't asked.
        const isProfileComplete = user.role === 'admin' || (Boolean(user.profile_completed_at) && hasGender && hasProvince && hasDistrict);

        return res.json({
            ...user,
            isProfileComplete
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Admin-created accounts. Self-registration goes through POST /auth/register (scholars only).
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { email, password, fullName, phone, schoolName, gradeLevel, preferredLanguage, gender, regionProvince, regionDistrict, isRural, disabilityStatus, accessibilityProfile } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const role = String(req.body.role || '').trim().toLowerCase();

    if (!normalizedEmail || !password || !role) {
      return res.status(400).json({ message: 'Email, password, and role are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Role must be admin, teacher, or scholar' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existingUser = await serverDb.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(normalizedEmail);
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

    await insert.run(
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

    await logAdminAuditAction({
      adminEmail: req.user.email,
      action: 'CREATE_USER',
      targetUserEmail: normalizedEmail,
      details: `Created ${role} account ${normalizedEmail}`
    });

    res.status(201).json({
      message: 'User created successfully',
      user: { email: normalizedEmail, role, full_name: fullName || '' }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
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

        if (role !== undefined && !VALID_ROLES.includes(role)) {
            return res.status(400).json({ message: 'Role must be admin, teacher, or scholar' });
        }
        if (String(userId) === String(req.user.id) && role !== undefined && role !== req.user.role) {
            return res.status(400).json({ message: 'You cannot change your own role' });
        }
        if (password && String(password).length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

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
            // An admin-set password is temporary: the user must choose their own.
            updates.push('must_change_password = 1');
        }

        query += updates.join(', ') + ' WHERE id = ?';
        params.push(userId);

        // The email is still the key in many tables: a change is carried into all of them, in
        // the same transaction, so the person's courses, work, and grades stay theirs.
        const info = await serverDb.transaction(async () => {
            const before = await serverDb.prepare('SELECT email FROM users WHERE id = ?').get(userId);
            if (!before) return { changes: 0 };
            if (email !== undefined && email !== String(before.email).toLowerCase()) {
                const taken = await serverDb.prepare('SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?').get(email, userId);
                if (taken) return { taken: true };
                await renameEmailEverywhere(before.email, email);
            }
            return serverDb.prepare(query).run(...params);
        })();

        if (info.taken) return res.status(409).json({ message: 'Another account already uses that email' });
        if (info.changes === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (password || role !== undefined || email !== undefined) {
            await revokeUserSessions(userId);
        }
        await logAdminAuditAction({
            adminEmail: req.user.email,
            action: 'UPDATE_USER',
            targetUserId: Number(userId),
            details: `Updated fields: ${updates.map((u) => u.split(' = ')[0]).join(', ')}`
        });

        res.status(200).json({ message: 'User updated successfully' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: error.message });
    }
});

const DISABILITY_ANSWERS = ['none', 'visual', 'hearing', 'mobility', 'cognitive', 'other'];

router.patch('/profile/update', async (req, res) => {
    try {
        const email = req.user.email;
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

        const user = { id: req.user.id };

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

        // Finishing the profile step: every required answer must be in this request, chosen by the
        // person (not a default), or the profile stays incomplete and they're asked again.
        if (req.body.completeProfile) {
            const missing = [];
            if (!gender || gender === 'prefer_not_to_say') missing.push('gender');
            if (!regionProvince || regionProvince === 'Not Specified') missing.push('province');
            if (!regionDistrict || regionDistrict === 'Not Specified') missing.push('district');
            if (typeof req.body.isRural !== 'boolean') missing.push('rural or urban');
            if (!DISABILITY_ANSWERS.includes(disabilityStatus)) missing.push('accessibility needs');
            if (req.user.role === 'scholar' && !gradeLevel) missing.push('grade');
            if (missing.length) return res.status(400).json({ message: `Please answer: ${missing.join(', ')}`, missing });
            updates.push('profile_completed_at = CURRENT_TIMESTAMP');
        }

        query += updates.join(', ') + ' WHERE id = ?';
        params.push(user.id);

        await serverDb.prepare(query).run(...params);

        // Auto-mark any profile completion notifications as read in localDb
        try {
            await localDb.prepare(`
                UPDATE user_notifications SET is_read = 1 WHERE LOWER(user_email) = LOWER(?) AND type = 'profile_reminder'
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
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current and new passwords are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        if (newPassword === currentPassword) {
            return res.status(400).json({ message: 'New password must be different from the current password' });
        }

        const user = await serverDb.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        const passwordHash = await hashPassword(newPassword);
        await serverDb.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(passwordHash, user.id);
        // Sign out every other device; this one stays logged in.
        await revokeUserSessions(user.id, req.sessionToken);

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
router.patch('/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const adminEmail = req.user.email;

        if (String(id) === String(req.user.id) && !isActive) {
            return res.status(400).json({ message: 'You cannot deactivate your own account' });
        }

        const user = await serverDb.prepare('SELECT id, email, full_name, is_active FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const newStatus = isActive ? 1 : 0;
        await serverDb.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newStatus, id);
        if (newStatus === 0) await revokeUserSessions(user.id);

        const actionName = newStatus === 1 ? 'REACTIVATE_USER' : 'DEACTIVATE_USER';
        await logAdminAuditAction({
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
router.patch('/:id/reset-password', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        const adminEmail = req.user.email;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const user = await serverDb.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordHash = await hashPassword(newPassword);
        // The reset password is temporary: the user must choose their own at next login.
        await serverDb.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(passwordHash, id);
        await revokeUserSessions(user.id);

        await logAdminAuditAction({
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
router.post('/bulk-action', requireAdmin, async (req, res) => {
    try {
        const { action, newRole } = req.body;
        const adminEmail = req.user.email;
        const userIds = Array.isArray(req.body.userIds) ? req.body.userIds.map(Number).filter(Number.isInteger) : [];
        if (userIds.length === 0) {
            return res.status(400).json({ message: 'userIds array is required' });
        }
        if (userIds.includes(Number(req.user.id))) {
            return res.status(400).json({ message: 'Bulk actions cannot include your own account' });
        }

        const placeholders = userIds.map(() => '?').join(',');
        let affected = 0;

        if (action === 'bulk_deactivate') {
            const stmt = serverDb.prepare(`UPDATE users SET is_active = 0 WHERE id IN (${placeholders})`);
            const info = await stmt.run(...userIds);
            affected = info.changes;
            for (const userId of userIds) await revokeUserSessions(userId);
            await logAdminAuditAction({ adminEmail, action: 'BULK_DEACTIVATE', details: `Deactivated ${affected} users` });
        } else if (action === 'bulk_reactivate') {
            const stmt = serverDb.prepare(`UPDATE users SET is_active = 1 WHERE id IN (${placeholders})`);
            const info = await stmt.run(...userIds);
            affected = info.changes;
            await logAdminAuditAction({ adminEmail, action: 'BULK_REACTIVATE', details: `Reactivated ${affected} users` });
        } else if (action === 'bulk_role') {
            if (!newRole || !['admin', 'teacher', 'scholar'].includes(newRole.toLowerCase())) {
                return res.status(400).json({ message: 'Valid newRole is required' });
            }
            const stmt = serverDb.prepare(`UPDATE users SET role = ? WHERE id IN (${placeholders})`);
            const info = await stmt.run(newRole.toLowerCase(), ...userIds);
            affected = info.changes;
            for (const userId of userIds) await revokeUserSessions(userId);
            await logAdminAuditAction({ adminEmail, action: 'BULK_ROLE_CHANGE', details: `Changed role to ${newRole} for ${affected} users` });
        } else if (action === 'bulk_delete') {
            const info = await serverDb.transaction(async () => {
                const doomed = await serverDb.prepare(`SELECT email FROM users WHERE id IN (${placeholders})`).all(...userIds);
                for (const u of doomed) await releaseEmail(u.email);
                return serverDb.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...userIds);
            })();
            affected = info.changes;
            await logAdminAuditAction({ adminEmail, action: 'BULK_DELETE', details: `Deleted ${affected} users` });
        } else {
            return res.status(400).json({ message: 'Invalid bulk action specified' });
        }

        res.json({ message: `Bulk action completed successfully on ${affected} user(s)`, count: affected });
    } catch (error) {
        console.error('Error executing bulk action:', error);
        res.status(500).json({ message: error.message });
    }
});

router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const adminEmail = req.user.email;
        if (String(id) === String(req.user.id)) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }

        const user = await serverDb.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        await serverDb.transaction(async () => {
            await releaseEmail(user.email);
            await serverDb.prepare('DELETE FROM users WHERE id = ?').run(id);
        })();

        await logAdminAuditAction({
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