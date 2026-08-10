import express from 'express';
import Database from 'better-sqlite3';

import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword } from "./users.service.js"
import bcrypt from "bcrypt";
import { runFirebaseSync } from './firebase-sync.service.js';

import { serverDb } from '../helpers/db-manager.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const username = String(req.body.username || '').trim().toLowerCase();
        const password = req.body.password;
        const role = String(req.body.role || '').trim().toLowerCase();

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password required' });
        }
        
        const row = serverDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(username);
        
        if (!row) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (row.is_active === 0) {
            return res.status(403).json({ message: 'Your account has been deactivated. Please contact an administrator.' });
        }
        
        const match = await bcrypt.compare(password, row.password_hash);
        if (!match) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (String(row.role || '').trim().toLowerCase() !== role) {
            return res.status(401).json({ message: 'Invalid role' });
        }

        // Trigger sync-manager in the background asynchronously
        runFirebaseSync().catch(console.error);

        return res.json({
            message: 'Login successful',
            user: {
                id: row.id,
                email: row.email,
                full_name: row.full_name,
                phone: row.phone,
                school_name: row.school_name,
                grade_level: row.grade_level,
                preferred_language: row.preferred_language,
                role: row.role,
                created_at: row.created_at
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/verify-auth', (req, res) => {
    try {
        // This route was referencing `row` which doesn't exist here.
        // Keeping the route but returning a fixed structure.
        return res.status(400).json({ message: 'No session mechanism implemented yet' });
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
