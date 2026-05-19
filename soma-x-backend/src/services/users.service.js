import express from 'express';
import bcrypt from "bcrypt";

import { serverDb } from '../helpers/db-manager.js';

const router = express.Router();

export const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

router.get('/', (req, res) => {
    const stmt = serverDb.prepare('SELECT * FROM users');
    const users = stmt.all();
    res.json(users);
});

router.get('/:id', (req, res) => {
    const stmt = serverDb.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(req.params.id);
    res.json(user);
});

router.get('/profile/view', (req, res) => {
    try {
        const email = String(req.query.email || '').trim().toLowerCase();
        const role = String(req.query.role || '').trim().toLowerCase();

        if (!email || !role) {
            return res.status(400).json({ message: 'Email and role are required' });
        }

        const user = serverDb
            .prepare(`
                SELECT id, email, full_name, role, phone, school_name, grade_level, preferred_language, created_at
                FROM users
                WHERE LOWER(email) = LOWER(?) AND LOWER(role) = LOWER(?)
            `)
            .get(email, role);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json(user);
    } catch (error) {
        console.error('Error fetching profile:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.post('/', async (req, res) => {
  try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const fullName = String(req.body.fullName || '').trim();
        const role = String(req.body.role || '').trim().toLowerCase();
        const phone = req.body.phone !== undefined ? String(req.body.phone || '').trim() : null;
        const schoolName = req.body.schoolName !== undefined ? String(req.body.schoolName || '').trim() : null;
        const gradeLevel = req.body.gradeLevel !== undefined ? String(req.body.gradeLevel || '').trim() : null;
        const preferredLanguage = req.body.preferredLanguage !== undefined ? String(req.body.preferredLanguage || '').trim() : null;
        const password = req.body.password;
    const password_hash = await hashPassword(password);
    
    if (!email || !fullName || !role || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const existingUser = serverDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }
    
                const stmt = serverDb.prepare(`
                        INSERT INTO users (email, full_name, role, password_hash, phone, school_name, grade_level, preferred_language)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
        const info = stmt.run(email, fullName, role, password_hash, phone || null, schoolName || null, gradeLevel || null, preferredLanguage || null);
        res.status(201).json({ id: info.lastInsertRowid, email, fullName, role, phone, schoolName, gradeLevel, preferredLanguage });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', (req, res) => {
    const stmt = serverDb.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(req.params.id);
    res.status(204).end();
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
            !password
        ) {
            return res.status(400).json({ message: 'At least one field is required for update' });
        }

        let query = 'UPDATE users SET ';
        const params = [];
        const updates = [];

        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }
        if (fullName !== undefined) {
            updates.push('full_name = ?');
            params.push(fullName);
        }
        if (role !== undefined) {
            updates.push('role = ?');
            params.push(role);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone || null);
        }
        if (schoolName !== undefined) {
            updates.push('school_name = ?');
            params.push(schoolName || null);
        }
        if (gradeLevel !== undefined) {
            updates.push('grade_level = ?');
            params.push(gradeLevel || null);
        }
        if (preferredLanguage !== undefined) {
            updates.push('preferred_language = ?');
            params.push(preferredLanguage || null);
        }
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
    return res.status(403).json({ message: 'Profile updates are disabled. Only password can be changed from account settings.' });
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

export default router;