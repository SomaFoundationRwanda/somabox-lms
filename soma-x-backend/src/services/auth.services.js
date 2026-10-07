import express from 'express';
import bcrypt from "bcrypt";
import { runFirebaseSync } from './firebase-sync.service.js';
import { serverDb } from '../helpers/db-manager.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const email = String(req.body.email || req.body.username || '').trim().toLowerCase();
        const password = req.body.password;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password required' });
        }
        
        const row = await serverDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
        
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
                created_at: row.created_at,
                must_change_password: Number(row.must_change_password) === 1
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/verify-auth', (req, res) => {
    try {
        return res.status(400).json({ message: 'No session mechanism implemented yet' });
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
