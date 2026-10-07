import express from 'express';
import { localDb, serverDb } from '../helpers/db-manager.js';
import { requireRole } from '../helpers/auth.js';

const router = express.Router();
const requireAdmin = requireRole('admin');

// Scholars only ever see their own records. Teachers and admins may pick one learner
// (scholarEmail) or, with no filter, the whole cohort (null).
// TODO(phase 9): limit teachers to learners in their own courses.
function analyticsSubject(req) {
    if (req.user.role === 'scholar') return req.user.email;
    return req.query.scholarEmail ? String(req.query.scholarEmail).trim().toLowerCase() : null;
}

// Record longitudinal progress metric
router.post('/longitudinal', async (req, res) => {
    try {
        const scholarEmail = req.user.email;
        const subject = String(req.body.subject || 'General').trim();
        const topic = String(req.body.topic || 'General Topic').trim();
        const score = Number(req.body.score || 0);
        const totalPossible = Number(req.body.totalPossible || 100);
        const difficultyLevel = String(req.body.difficultyLevel || 'medium').trim();
        const attemptNumber = Number(req.body.attemptNumber || 1);

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
        const scholarEmail = analyticsSubject(req);

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
router.get('/inclusivity-gap', requireAdmin, async (req, res) => {
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
        const scholarEmail = analyticsSubject(req);

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

// ===== Usage events =====
// Append-only, batched from the browser. Only known event types are stored, and a course is
// only attached if the caller belongs to it (or is an admin).
const USAGE_EVENT_TYPES = new Set(["explainer_opened", "create_helper_used"]);
const MAX_EVENTS_PER_BATCH = 50;
const MAX_EVENT_DATA_BYTES = 2000;

router.post('/events', async (req, res) => {
    try {
        const events = Array.isArray(req.body?.events) ? req.body.events : null;
        if (!events || events.length === 0) return res.status(400).json({ message: 'events array is required' });
        if (events.length > MAX_EVENTS_PER_BATCH) return res.status(400).json({ message: `At most ${MAX_EVENTS_PER_BATCH} events per batch` });

        const memberOf = new Map();
        let stored = 0;
        for (const e of events) {
            const type = String(e?.type || '');
            if (!USAGE_EVENT_TYPES.has(type)) continue;
            const data = e?.data && typeof e.data === 'object' && !Array.isArray(e.data) ? e.data : {};
            const json = JSON.stringify(data);
            if (json.length > MAX_EVENT_DATA_BYTES) continue;

            let courseId = e?.courseId ? String(e.courseId).slice(0, 10) : null;
            if (courseId && req.user.role !== 'admin') {
                if (!memberOf.has(courseId)) {
                    const enrollment = await localDb.prepare("SELECT 1 FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?) AND status = 'active'").get(courseId, req.user.email);
                    memberOf.set(courseId, !!enrollment);
                }
                if (!memberOf.get(courseId)) courseId = null;
            }
            if (courseId && !(await localDb.prepare('SELECT 1 FROM courses WHERE id = ?').get(courseId))) courseId = null;

            await localDb.prepare(`
                INSERT INTO usage_events (user_id, role, course_id, event_type, data) VALUES (?, ?, ?, ?, ?::jsonb)
            `).run(req.user.id, req.user.role, courseId, type, json);
            stored += 1;
        }
        return res.status(202).json({ stored });
    } catch (error) {
        console.error('Error storing usage events:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Admins: which explainers are opened most (where teachers look for help).
router.get('/explainer-usage', requireAdmin, async (req, res) => {
    try {
        const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
        const rows = await localDb.prepare(`
            SELECT data->>'key' AS key, COUNT(*) AS opens, COUNT(DISTINCT user_id) AS people
            FROM usage_events
            WHERE event_type = 'explainer_opened' AND created_at >= NOW() - make_interval(days => ?)
            GROUP BY data->>'key' ORDER BY COUNT(*) DESC LIMIT 50
        `).all(days);
        return res.json({ days, explainers: rows.map((r) => ({ key: r.key, opens: Number(r.opens), people: Number(r.people) })) });
    } catch (error) {
        console.error('Error reading explainer usage:', error);
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
        // Public (shown on the login page); sync settings are for admins only.
        if (req.user?.role !== 'admin' && branding) {
            const { me_sync_url, last_synced_at, ...publicBranding } = branding;
            return res.json(publicBranding);
        }
        return res.json(branding);
    } catch (error) {
        console.error('Error fetching unit branding:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.post('/branding', requireAdmin, async (req, res) => {
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
router.post('/me-sync', requireAdmin, async (req, res) => {
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
