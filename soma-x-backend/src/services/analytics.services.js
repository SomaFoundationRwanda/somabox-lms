import express from 'express';
import { localDb, serverDb } from '../helpers/db-manager.js';
import { requireRole } from '../helpers/auth.js';
import { analyticsScope } from './insights/scope.js';
import { courseInsights } from './insights/metrics.js';
import { SCHOOL_TIMEZONE } from './courses/schedule.js';
import { pushOutbox } from './sync/outbox.js';
import { runMessage } from './sync.services.js';

const router = express.Router();
const requireAdmin = requireRole('admin');

// Groups smaller than this are not reported in demographic breakdowns, so no figure can point
// at a handful of identifiable learners.
export const MIN_GROUP_SIZE = 5;
export const DEFAULT_RETENTION_DAYS = 365;

/** SQL filter + params for an analyticsScope result on a users table alias `u`. */
function scopeFilter(scope) {
    if (scope.all) return { sql: '', params: [] };
    if (!scope.emails.length) return { sql: ' AND FALSE', params: [] };
    return { sql: ` AND LOWER(u.email) IN (${scope.emails.map(() => '?').join(',')})`, params: scope.emails };
}

// Science-of-Learning practice records (spaced reviews, refreshers, the diagnostic). These are a
// separate practice stream: they never count toward outcome mastery.
router.post('/longitudinal', async (req, res) => {
    try {
        const scholarEmail = req.user.email;
        const subject = String(req.body.subject || 'General').trim();
        const topic = String(req.body.topic || 'General Topic').trim();
        const score = Number(req.body.score || 0);
        const totalPossible = Number(req.body.totalPossible || 100);
        const difficultyLevel = String(req.body.difficultyLevel || 'medium').trim();
        const attemptNumber = Number(req.body.attemptNumber || 1);

        await localDb.prepare(`
            INSERT INTO longitudinal_progress (scholar_email, subject, topic, score, total_possible, difficulty_level, attempt_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(scholarEmail, subject, topic, score, totalPossible, difficultyLevel, attemptNumber);

        return res.status(201).json({ message: 'Longitudinal record added' });
    } catch (error) {
        console.error('Error adding longitudinal progress:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Growth over time from outcome results (the only source for mastery): the mean result per
// school week for one learner (scholarEmail) or for everyone the caller may see.
// { weeks: [{ weekStart, averagePct, learners, results }], baselineAverage, learners }
router.get('/growth-curves', async (req, res) => {
    try {
        const scope = await analyticsScope(req.user, req.query.scholarEmail);
        if (scope.forbidden) return res.status(403).json({ message: 'You can only see learners you teach' });
        const weeksBack = Math.min(104, Math.max(1, Number(req.query.weeks) || 26));
        const filter = scopeFilter(scope);
        const weeks = await localDb.prepare(`
            SELECT to_char(date_trunc('week', o.assessed_at AT TIME ZONE ?), 'YYYY-MM-DD') AS week_start,
                   AVG(o.pct) AS avg_pct, COUNT(DISTINCT o.user_id) AS learners, COUNT(*) AS results
            FROM outcome_results o JOIN users u ON u.id = o.user_id
            WHERE o.source_type <> 'baseline' AND o.assessed_at >= NOW() - make_interval(weeks => ?)${filter.sql}
            GROUP BY 1 ORDER BY 1
        `).all(SCHOOL_TIMEZONE, weeksBack, ...filter.params);
        const baseline = await localDb.prepare(`
            SELECT AVG(o.pct) AS avg_pct, COUNT(DISTINCT o.user_id) AS learners
            FROM outcome_results o JOIN users u ON u.id = o.user_id
            WHERE o.source_type = 'baseline'${filter.sql}
        `).get(...filter.params);
        // An empty table means no data yet; never substitute sample records.
        return res.json({
            weeks: weeks.map((w) => ({ weekStart: w.week_start, averagePct: Math.round(Number(w.avg_pct)), learners: Number(w.learners), results: Number(w.results) })),
            baselineAverage: baseline?.avg_pct != null ? Math.round(Number(baseline.avg_pct)) : null,
            baselineLearners: Number(baseline?.learners || 0),
        });
    } catch (error) {
        console.error('Error fetching growth curves:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Inclusivity gap: average outcome result by rural/urban, gender, and accessibility needs.
// Admins only, aggregates only, and any group with fewer than MIN_GROUP_SIZE learners with
// results is reported as null (listed in `suppressed`).
router.get('/inclusivity-gap', requireAdmin, async (req, res) => {
    try {
        const users = await serverDb.prepare(`
            SELECT id, gender, is_rural, disability_status FROM users WHERE role = 'scholar'
        `).all();
        const averages = await localDb.prepare(`
            SELECT user_id, AVG(pct) AS pct FROM outcome_results WHERE source_type <> 'baseline' GROUP BY user_id
        `).all();
        const scoreOf = new Map(averages.map((r) => [Number(r.user_id), Number(r.pct)]));

        const groups = { rural: [], urban: [], ruralFemale: [], ruralMale: [], urbanFemale: [], urbanMale: [], disability: [] };
        let scholarsWithAccessibilityNeeds = 0;
        let scholarsWithData = 0;
        for (const user of users) {
            const isRural = Number(user.is_rural) === 1;
            const isFemale = user.gender === 'female';
            const isMale = user.gender === 'male';
            const hasDisability = user.disability_status && user.disability_status !== 'none';
            if (hasDisability) scholarsWithAccessibilityNeeds++;
            const score = scoreOf.get(Number(user.id));
            if (score == null) continue;
            scholarsWithData++;
            if (hasDisability) groups.disability.push(score);
            groups[isRural ? 'rural' : 'urban'].push(score);
            if (isFemale) groups[isRural ? 'ruralFemale' : 'urbanFemale'].push(score);
            if (isMale) groups[isRural ? 'ruralMale' : 'urbanMale'].push(score);
        }

        const suppressed = [];
        const avg = (name) => {
            const values = groups[name];
            if (values.length === 0) return null;
            if (values.length < MIN_GROUP_SIZE) { suppressed.push(name); return null; }
            return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
        };
        const ruralAverage = avg('rural');
        const urbanAverage = avg('urban');
        return res.json({
            source: 'outcome_results',
            minGroupSize: MIN_GROUP_SIZE,
            totalScholars: users.length,
            scholarsWithData,
            ruralVsUrban: {
                ruralAverage,
                urbanAverage,
                gapPercentage: ruralAverage !== null && urbanAverage !== null ? Math.round((urbanAverage - ruralAverage) * 10) / 10 : null,
            },
            genderBreakdown: {
                femaleRuralAverage: avg('ruralFemale'),
                maleRuralAverage: avg('ruralMale'),
                femaleUrbanAverage: avg('urbanFemale'),
                maleUrbanAverage: avg('urbanMale'),
            },
            accessibilityMetrics: {
                scholarsWithAccessibilityNeeds: scholarsWithAccessibilityNeeds > 0 && scholarsWithAccessibilityNeeds < MIN_GROUP_SIZE ? null : scholarsWithAccessibilityNeeds,
                averagePerformance: avg('disability'),
            },
            suppressed,
        });
    } catch (error) {
        console.error('Error generating gap analysis:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Science-of-Learning practice activity (a separate practice stream; not outcome mastery).
router.get('/sol-outcomes', async (req, res) => {
    try {
        const scope = await analyticsScope(req.user, req.query.scholarEmail);
        if (scope.forbidden) return res.status(403).json({ message: 'You can only see learners you teach' });

        // Counts come from recorded SoL activity only. Principles with no data
        // source yet report null instead of a sample number.
        const scoped = scope.all ? { sql: '', params: [] }
            : scope.emails.length ? { sql: ` AND LOWER(scholar_email) IN (${scope.emails.map(() => '?').join(',')})`, params: scope.emails }
            : { sql: ' AND FALSE', params: [] };
        const refresherRow = await localDb.prepare(
            `SELECT COUNT(*) AS c FROM sol_refresher_completions WHERE 1 = 1${scoped.sql}`
        ).get(...scoped.params);
        const spacedRow = await localDb.prepare(
            `SELECT COUNT(*) AS c FROM sol_spaced_reviews WHERE status = 'completed'${scoped.sql}`
        ).get(...scoped.params);

        const principles = [
            { name: "Retrieval Practice", count: Number(refresherRow?.c || 0), description: "Pre-module Refresher Quizzes completed" },
            { name: "Spaced Practice", count: Number(spacedRow?.c || 0), description: "3, 7, and 30-day scheduled review sessions done" },
            { name: "Immediate Feedback", count: null, description: "Real-time error correction explanations viewed (not tracked yet)" },
            { name: "Scaffolding", count: null, description: "Prerequisite mastery locks cleared (not tracked yet)" },
            { name: "Interleaving", count: null, description: "Mixed review sessions completed (not tracked yet)" }
        ];

        return res.json({
            stream: 'practice',
            countsTowardMastery: false,
            activeTrackedOutcomes: principles.filter((p) => p.count !== null && p.count > 0).length,
            principles,
        });
    } catch (error) {
        console.error('Error fetching SoL outcomes:', error);
        return res.status(500).json({ message: error.message });
    }
});

// ===== Usage events =====
// Append-only, batched from the browser. Only known event types are stored, and a course is
// only attached if the caller belongs to it (or is an admin). The server records its own events
// too (item_edited_after_publish; AI decisions live in ai_drafts).
export const USAGE_EVENT_TYPES = new Set([
    "explainer_opened", "create_helper_used",
    "course_opened", "item_opened", "insights_viewed", "progress_viewed",
    "grading_time", "ai_suggestion_used",
]);
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

// ===== School-wide view (admins) =====
// One row per open or closed course, from the same metrics as course Insights, plus how
// teachers use the product (time to grade, edits after publishing).
router.get('/school', requireAdmin, async (req, res) => {
    try {
        const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
        const courses = await localDb.prepare(`
            SELECT id, title, lifecycle FROM courses WHERE lifecycle IN ('open', 'closed') ORDER BY title
        `).all();
        const rows = [];
        const activeLearners = new Set();
        const learnersWithData = new Set();
        for (const c of courses) {
            const insights = await courseInsights(c.id);
            for (const l of insights.learners) {
                if (l.engagement.activeDays7 > 0) activeLearners.add(l.id);
                if (l.overall != null) learnersWithData.add(l.id);
            }
            const teachers = await localDb.prepare(`
                SELECT COALESCE(u.full_name, e.user_email) AS name FROM enrollments e
                LEFT JOIN users u ON LOWER(u.email) = LOWER(e.user_email)
                WHERE e.course_id = ? AND e.role IN ('teacher', 'ta') AND e.status = 'active' ORDER BY 1
            `).all(c.id);
            rows.push({
                id: c.id, title: c.title, lifecycle: c.lifecycle, teachers: teachers.map((t) => t.name),
                ...insights.class,
            });
        }
        const counts = await localDb.prepare(`
            SELECT
              (SELECT COUNT(*) FROM users WHERE role = 'scholar' AND is_active IS DISTINCT FROM 0) AS learners,
              (SELECT COUNT(*) FROM users WHERE role IN ('teacher', 'ta') AND is_active IS DISTINCT FROM 0) AS teachers,
              (SELECT COUNT(*) FROM courses WHERE lifecycle = 'draft') AS draft_courses
        `).get();
        const grading = await localDb.prepare(`
            SELECT COUNT(*) AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY (data->>'ms')::numeric) AS median_ms
            FROM usage_events WHERE event_type = 'grading_time' AND role IN ('teacher', 'ta', 'admin') AND created_at >= NOW() - make_interval(days => ?)
              AND (data->>'ms') ~ '^[0-9]+(\\.[0-9]+){0,1}$'
        `).get(days);
        const edits = await localDb.prepare(`
            SELECT COUNT(*) AS n FROM usage_events WHERE event_type = 'item_edited_after_publish' AND created_at >= NOW() - make_interval(days => ?)
        `).get(days);
        const events = await localDb.prepare(`
            SELECT event_type, COUNT(*) AS n, COUNT(DISTINCT user_id) AS people FROM usage_events
            WHERE created_at >= NOW() - make_interval(days => ?) GROUP BY event_type ORDER BY 2 DESC
        `).all(days);
        return res.json({
            days,
            totals: {
                learners: Number(counts.learners), teachers: Number(counts.teachers),
                courses: courses.length, draftCourses: Number(counts.draft_courses),
                activeLearnersLast7Days: activeLearners.size, learnersWithResults: learnersWithData.size,
            },
            courses: rows,
            teaching: {
                gradingsTimed: Number(grading?.n || 0),
                medianGradingSeconds: grading?.median_ms != null ? Math.round(Number(grading.median_ms) / 1000) : null,
                editsAfterPublish: Number(edits?.n || 0),
            },
            events: events.map((e) => ({ type: e.event_type, count: Number(e.n), people: Number(e.people) })),
        });
    } catch (error) {
        console.error('Error building school analytics:', error);
        return res.status(500).json({ message: error.message });
    }
});

// ===== Retention =====
export async function retentionDays() {
    const row = await localDb.prepare("SELECT value FROM system_settings WHERE key = 'usage_retention_days'").get();
    const days = Number(row?.value);
    return Number.isFinite(days) && days >= 30 ? days : DEFAULT_RETENTION_DAYS;
}

/** Deletes usage logs (usage_events, ai_calls) older than the retention setting, long-ended sessions, and old read notifications. */
export async function purgeOldUsage() {
    const days = await retentionDays();
    const events = await localDb.prepare("DELETE FROM usage_events WHERE created_at < NOW() - make_interval(days => ?)").run(days);
    const calls = await localDb.prepare("DELETE FROM ai_calls WHERE created_at < NOW() - make_interval(days => ?)").run(days);
    // Sessions that ended (expired or logged out) more than 30 days ago are no longer needed.
    const sessions = await localDb.prepare(`
        DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '30 days' OR revoked_at < NOW() - INTERVAL '30 days'
    `).run();
    // Notifications that were read more than 90 days ago.
    const notifications = await localDb.prepare(`
        DELETE FROM user_notifications WHERE is_read = 1 AND created_at < NOW() - INTERVAL '90 days'
    `).run();
    return { days, usageEvents: events?.changes ?? 0, aiCalls: calls?.changes ?? 0, sessions: sessions?.changes ?? 0, notifications: notifications?.changes ?? 0 };
}

let purgeTimer = null;
export function scheduleUsagePurge() {
    const run = () => purgeOldUsage().catch((error) => console.error('Usage purge failed:', error.message));
    run();
    if (!purgeTimer) {
        purgeTimer = setInterval(run, 24 * 60 * 60 * 1000);
        purgeTimer.unref?.();
    }
}

router.get('/settings', requireAdmin, async (req, res) => {
    try {
        return res.json({ usageRetentionDays: await retentionDays(), minGroupSize: MIN_GROUP_SIZE });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

router.put('/settings', requireAdmin, async (req, res) => {
    try {
        const days = Number(req.body?.usageRetentionDays);
        if (!Number.isInteger(days) || days < 30 || days > 3650) {
            return res.status(400).json({ message: 'Keep usage logs for between 30 and 3650 days' });
        }
        await localDb.prepare(`
            INSERT INTO system_settings (key, value, updated_by, updated_at) VALUES ('usage_retention_days', ?::jsonb, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(days), req.user.email);
        const purged = await purgeOldUsage();
        return res.json({ usageRetentionDays: days, purged });
    } catch (error) {
        console.error('Error saving analytics settings:', error);
        return res.status(500).json({ message: error.message });
    }
});

// ===== Personal data export =====
// Everything the box holds about one person's learning and use, as JSON. People can download
// their own; admins can download anyone's (e.g. for a family's request).
async function personalData(userId) {
    const user = await localDb.prepare(`
        SELECT id, email, full_name, phone, school_name, grade_level, preferred_language, role, gender,
               region_province, region_district, is_rural, disability_status, accessibility_profile, created_at
        FROM users WHERE id = ?
    `).get(userId);
    if (!user) return null;
    const email = user.email;
    const q = (sql, ...params) => localDb.prepare(sql).all(...params);
    return {
        exportedAt: new Date().toISOString(),
        profile: user,
        enrollments: await q(`SELECT e.course_id, c.title AS course_title, e.role, e.status, e.joined_at FROM enrollments e
            LEFT JOIN courses c ON c.id = e.course_id WHERE LOWER(e.user_email) = LOWER(?) ORDER BY e.joined_at`, email),
        assignmentSubmissions: await q(`SELECT s.assignment_id, a.title AS assignment_title, a.course_id, s.body, s.submitted_at, s.is_late,
            s.grade, a.points_possible, s.feedback, s.graded_at FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
            WHERE LOWER(s.scholar_email) = LOWER(?) ORDER BY s.submitted_at`, email),
        rubricScores: await q(`SELECT ss.submission_id, c.title AS criterion, ss.points, c.points AS max_points, ss.source
            FROM submission_scores ss JOIN rubric_criteria c ON c.id = ss.criterion_id
            JOIN assignment_submissions s ON s.id = ss.submission_id WHERE LOWER(s.scholar_email) = LOWER(?)`, email),
        quizAttempts: await q(`SELECT qa.quiz_id, q.title AS quiz_title, q.course_id, qa.attempt_number, qa.answers, qa.started_at,
            qa.submitted_at, qa.score_points, qa.score_pct, qa.is_late FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
            WHERE qa.user_id = ? ORDER BY qa.started_at`, userId),
        outcomeResults: await q(`SELECT o.course_id, oc.code AS outcome_code, oc.title AS outcome_title, o.source_type, o.source_id, o.pct, o.assessed_at
            FROM outcome_results o JOIN outcomes oc ON oc.id = o.outcome_id WHERE o.user_id = ? ORDER BY o.assessed_at`, userId),
        pageViews: await q(`SELECT v.page_id, p.title AS page_title, p.course_id, v.first_viewed_at, v.last_viewed_at, v.scroll_pct_reached, v.completed_at
            FROM page_views v JOIN course_pages p ON p.id = v.page_id WHERE LOWER(v.user_email) = LOWER(?)`, email),
        discussionReplies: await q(`SELECT r.discussion_id, d.title AS discussion_title, d.course_id, r.body, r.created_at
            FROM discussion_replies r JOIN discussions d ON d.id = r.discussion_id WHERE LOWER(r.author_email) = LOWER(?) ORDER BY r.created_at`, email),
        practice: {
            longitudinalProgress: await q(`SELECT subject, topic, score, total_possible, difficulty_level, attempt_number, created_at
                FROM longitudinal_progress WHERE LOWER(scholar_email) = LOWER(?) ORDER BY created_at`, email),
            diagnostic: await q(`SELECT overall_score, subject_breakdown, completed_at FROM diagnostic_results WHERE LOWER(scholar_email) = LOWER(?)`, email),
        },
        usageEvents: await q(`SELECT event_type, course_id, data, created_at FROM usage_events WHERE user_id = ? ORDER BY created_at`, userId),
    };
}

function sendExport(res, data) {
    const name = `somabox-data-${String(data.profile.email).replace(/[^a-z0-9]+/gi, '-')}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    return res.json(data);
}

router.get('/my-data', async (req, res) => {
    try {
        const data = await personalData(req.user.id);
        if (!data) return res.status(404).json({ message: 'User not found' });
        return sendExport(res, data);
    } catch (error) {
        console.error('Error exporting personal data:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.get('/users/:userId/data', requireAdmin, async (req, res) => {
    try {
        const data = await personalData(Number(req.params.userId));
        if (!data) return res.status(404).json({ message: 'User not found' });
        return sendExport(res, data);
    } catch (error) {
        console.error('Error exporting personal data:', error);
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

// "Sync now" from the branding/M&E screen: pushes the sync outbox (older clients call this).
router.post('/me-sync', requireAdmin, async (req, res) => {
    try {
        const result = await pushOutbox();
        const ok = ['ok', 'nothing_to_send'].includes(result.status);
        return res.status(ok ? 200 : 503).json({
            ...result,
            message: runMessage(result),
            syncedAt: ok ? new Date().toISOString() : null,
        });
    } catch (error) {
        console.error('Error performing M&E sync:', error);
        return res.status(500).json({ message: error.message });
    }
});

export default router;
