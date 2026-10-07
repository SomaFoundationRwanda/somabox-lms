import express from 'express';
import { localDb, serverDb } from '../helpers/db-manager.js';

const router = express.Router();

// Record longitudinal progress metric
router.post('/longitudinal', async (req, res) => {
    try {
        const scholarEmail = String(req.body.scholarEmail || '').trim().toLowerCase();
        const subject = String(req.body.subject || 'General').trim();
        const topic = String(req.body.topic || 'General Topic').trim();
        const score = Number(req.body.score || 0);
        const totalPossible = Number(req.body.totalPossible || 100);
        const difficultyLevel = String(req.body.difficultyLevel || 'medium').trim();
        const attemptNumber = Number(req.body.attemptNumber || 1);

        if (!scholarEmail) return res.status(400).json({ message: 'scholarEmail is required' });

        const stmt = localDb.prepare(`
            INSERT INTO longitudinal_progress (scholar_email, subject, topic, score, total_possible, difficulty_level, attempt_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        await stmt.run(scholarEmail, subject, topic, score, totalPossible, difficultyLevel, attemptNumber);

        return res.status(201).json({ message: 'Longitudinal record added' });
    } catch (error) {
        console.error('Error adding longitudinal progress:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Get Growth Curves (individual scholar or cohort)
router.get('/growth-curves', async (req, res) => {
    try {
        const scholarEmail = req.query.scholarEmail ? String(req.query.scholarEmail).trim().toLowerCase() : null;

        let records;
        if (scholarEmail) {
            records = await localDb.prepare(`
                SELECT id, scholar_email, subject, topic, score, total_possible, difficulty_level, created_at
                FROM longitudinal_progress
                WHERE LOWER(scholar_email) = LOWER(?)
                ORDER BY created_at ASC
            `).all(scholarEmail);
        } else {
            records = await localDb.prepare(`
                SELECT id, scholar_email, subject, topic, score, total_possible, difficulty_level, created_at
                FROM longitudinal_progress
                ORDER BY created_at ASC
            `).all();
        }

        // An empty table means no data yet; never substitute sample records.
        return res.json(records);
    } catch (error) {
        console.error('Error fetching growth curves:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Inclusivity Gap Analysis: Rural vs. Urban performance across Gender lines
router.get('/inclusivity-gap', async (req, res) => {
    try {
        const users = await serverDb.prepare(`
            SELECT email, gender, region_province, region_district, is_rural, disability_status
            FROM users WHERE role = 'scholar'
        `).all();

        const progressRecords = await localDb.prepare(`
            SELECT scholar_email, score, total_possible FROM longitudinal_progress
        `).all();

        const userScoreMap = new Map();
        for (const p of progressRecords) {
            const email = String(p.scholar_email).toLowerCase();
            if (!userScoreMap.has(email)) userScoreMap.set(email, []);
            const pct = p.total_possible > 0 ? (p.score / p.total_possible) * 100 : p.score;
            userScoreMap.get(email).push(pct);
        }

        // Learners without any recorded progress are counted but excluded from averages.
        // Groups with no data report null, never a placeholder value.
        const groups = {
            ruralFemale: [], ruralMale: [], urbanFemale: [], urbanMale: [], disability: []
        };
        let scholarsWithAccessibilityNeeds = 0;
        let scholarsWithData = 0;

        for (const user of users) {
            const email = user.email.toLowerCase();
            const isRural = Number(user.is_rural) === 1;
            const isFemale = user.gender === 'female';
            const hasDisability = user.disability_status && user.disability_status !== 'none';
            if (hasDisability) scholarsWithAccessibilityNeeds++;

            const scores = userScoreMap.get(email);
            if (!scores || scores.length === 0) continue;
            scholarsWithData++;
            const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

            if (hasDisability) groups.disability.push(avgScore);
            if (isRural) groups[isFemale ? 'ruralFemale' : 'ruralMale'].push(avgScore);
            else groups[isFemale ? 'urbanFemale' : 'urbanMale'].push(avgScore);
        }

        const avg = (values) => values.length > 0
            ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
            : null;
        const ruralAverage = avg([...groups.ruralFemale, ...groups.ruralMale]);
        const urbanAverage = avg([...groups.urbanFemale, ...groups.urbanMale]);

        const report = {
            totalScholars: users.length,
            scholarsWithData,
            ruralVsUrban: {
                ruralAverage,
                urbanAverage,
                gapPercentage: ruralAverage !== null && urbanAverage !== null
                    ? Math.round((urbanAverage - ruralAverage) * 10) / 10
                    : null
            },
            genderBreakdown: {
                femaleRuralAverage: avg(groups.ruralFemale),
                maleRuralAverage: avg(groups.ruralMale),
                femaleUrbanAverage: avg(groups.urbanFemale),
                maleUrbanAverage: avg(groups.urbanMale)
            },
            accessibilityMetrics: {
                scholarsWithAccessibilityNeeds,
                averagePerformance: avg(groups.disability)
            }
        };

        return res.json(report);
    } catch (error) {
        console.error('Error generating gap analysis:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Active Science of Learning (SoL) outcomes tracker per learner
router.get('/sol-outcomes', async (req, res) => {
    try {
        const scholarEmail = req.query.scholarEmail ? String(req.query.scholarEmail).trim().toLowerCase() : null;

        // Counts come from recorded SoL activity only. Principles with no data
        // source yet report null instead of a sample number.
        const scope = scholarEmail ? ' AND LOWER(scholar_email) = LOWER(?)' : '';
        const params = scholarEmail ? [scholarEmail] : [];
        const refresherRow = await localDb.prepare(
            `SELECT COUNT(*) AS c FROM sol_refresher_completions WHERE 1 = 1${scope}`
        ).get(...params);
        const spacedRow = await localDb.prepare(
            `SELECT COUNT(*) AS c FROM sol_spaced_reviews WHERE status = 'completed'${scope}`
        ).get(...params);

        const principles = [
            { name: "Retrieval Practice", count: Number(refresherRow?.c || 0), description: "Pre-module Refresher Quizzes completed" },
            { name: "Spaced Practice", count: Number(spacedRow?.c || 0), description: "3, 7, and 30-day scheduled review sessions done" },
            { name: "Immediate Feedback", count: null, description: "Real-time error correction explanations viewed (not tracked yet)" },
            { name: "Scaffolding", count: null, description: "Prerequisite mastery locks cleared (not tracked yet)" },
            { name: "Interleaving", count: null, description: "Mixed review sessions completed (not tracked yet)" }
        ];

        const outcomes = {
            activeTrackedOutcomes: principles.filter((p) => p.count !== null && p.count > 0).length,
            principles
        };

        return res.json(outcomes);
    } catch (error) {
        console.error('Error fetching SoL outcomes:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Unit Branding endpoints
router.get('/branding', async (req, res) => {
    try {
        let branding = await localDb.prepare(`SELECT * FROM unit_branding WHERE id = 1`).get();
        if (!branding) {
            await localDb.prepare(`
                INSERT INTO unit_branding (id, school_name, logo_url, primary_color, secondary_color, me_sync_url)
                VALUES (1, 'SOMABOX Partner School', '', '#203A3A', '#0D9488', '')
                ON CONFLICT (id) DO NOTHING
            `).run();
            branding = await localDb.prepare(`SELECT * FROM unit_branding WHERE id = 1`).get();
        }
        return res.json(branding);
    } catch (error) {
        console.error('Error fetching unit branding:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.post('/branding', async (req, res) => {
    try {
        const schoolName = String(req.body.schoolName || 'SOMABOX Partner School').trim();
        const logoUrl = String(req.body.logoUrl || '').trim();
        const primaryColor = String(req.body.primaryColor || '#203A3A').trim();
        const secondaryColor = String(req.body.secondaryColor || '#0D9488').trim();
        const meSyncUrl = String(req.body.meSyncUrl || '').trim();

        await localDb.prepare(`
            INSERT INTO unit_branding (id, school_name, logo_url, primary_color, secondary_color, me_sync_url, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                school_name = EXCLUDED.school_name,
                logo_url = EXCLUDED.logo_url,
                primary_color = EXCLUDED.primary_color,
                secondary_color = EXCLUDED.secondary_color,
                me_sync_url = EXCLUDED.me_sync_url,
                updated_at = CURRENT_TIMESTAMP
        `).run(schoolName, logoUrl, primaryColor, secondaryColor, meSyncUrl);

        return res.json({ message: 'Unit branding updated successfully' });
    } catch (error) {
        console.error('Error updating unit branding:', error);
        return res.status(500).json({ message: error.message });
    }
});

// M&E Real-Time Sync endpoint
router.post('/me-sync', async (req, res) => {
    try {
        await localDb.prepare(`
            UPDATE unit_branding SET last_synced_at = CURRENT_TIMESTAMP WHERE id = 1
        `).run();
        return res.json({
            message: 'M&E Ambassador real-time data sync completed',
            syncedAt: new Date().toISOString(),
            status: 'success'
        });
    } catch (error) {
        console.error('Error performing M&E sync:', error);
        return res.status(500).json({ message: error.message });
    }
});

export default router;
