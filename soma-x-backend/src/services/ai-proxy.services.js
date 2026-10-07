import express from 'express';
import crypto from 'crypto';
import { localDb } from '../helpers/db-manager.js';
import { requireRole } from '../helpers/auth.js';
import { aiAccess, schoolAiEnabled } from './ai/access.js';
import { gatewayUrl, logAiCall } from './ai/gateway.js';

const router = express.Router();

// Per-user Rate Limiter (Max 20 requests per 5 minutes)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

function checkRateLimit(userId) {
    const now = Date.now();
    const record = rateLimitMap.get(userId) || { count: 0, startTime: now };

    if (now - record.startTime > RATE_LIMIT_WINDOW_MS) {
        record.count = 1;
        record.startTime = now;
    } else {
        record.count++;
    }

    rateLimitMap.set(userId, record);
    return record.count <= MAX_REQUESTS_PER_WINDOW;
}

// Teachers and admins may use the assistant (guide §12.2: decided, admins too), unless an
// admin switched AI off for the school or for that person. Identity comes from the session.
async function verifyTeacherOrAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue' });
    const access = await aiAccess(req.user);
    if (!access.allowed) return res.status(403).json({ message: access.reason, code: 'AI_DISABLED' });
    // Opaque id for the gateway's feedback log. Same input as before (the email) so
    // existing hashes stay comparable.
    req.teacherHash = crypto.createHash('sha256').update(req.user.email).digest('hex').substring(0, 16);
    req.userEmail = req.user.email;
    next();
}

// GET /ai/health - Check if AI service is operational
router.get('/health', async (req, res) => {
    try {
        const resp = await fetch(`${gatewayUrl()}/health`, { signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
            const data = await resp.json();
            return res.json({ available: true, ...data });
        }
        return res.json({ available: false, message: 'AI assistant unavailable' });
    } catch (err) {
        return res.json({ available: false, message: 'AI assistant unavailable' });
    }
});

// POST /ai/ask - Streamed AI completions for teachers
router.post('/ask', verifyTeacherOrAdmin, async (req, res) => {
    const startedAt = Date.now();
    if (!checkRateLimit(req.user.id)) {
        return res.status(429).json({ message: 'Rate limit exceeded. Please wait a few minutes before asking again.' });
    }

    const { mode, question, source_text, course_id, lesson_id } = req.body;

    try {
        const gatewayResp = await fetch(`${gatewayUrl()}/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode,
                question,
                source_text,
                course_id,
                lesson_id,
                teacher_hash: req.teacherHash
            })
        });

        if (!gatewayResp.ok) {
            const errData = await gatewayResp.json().catch(() => ({}));
            return res.status(gatewayResp.status).json(errData.error ? errData : { message: 'AI assistant unavailable' });
        }

        // Pipe SSE stream from gateway to client
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = gatewayResp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
        }

        res.end();
        await logAiCall({ userId: req.user.id, courseId: null, feature: 'assistant', task: req.body.mode, ok: true, latencyMs: Date.now() - startedAt });
    } catch (err) {
        await logAiCall({ userId: req.user.id, courseId: null, feature: 'assistant', task: req.body.mode, ok: false, errorCode: 'unreachable', latencyMs: Date.now() - startedAt });
        console.error('[AI Proxy] Error contacting gateway:', err);
        if (!res.headersSent) {
            return res.status(503).json({ message: 'AI assistant unavailable' });
        }
        res.end();
    }
});

// POST /ai/feedback - Log teacher feedback
router.post('/feedback', verifyTeacherOrAdmin, async (req, res) => {
    const { response_id, rating, comment, mode } = req.body;

    try {
        const gatewayResp = await fetch(`${gatewayUrl()}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                response_id,
                teacher_hash: req.teacherHash,
                rating,
                comment,
                mode
            })
        });

        const data = await gatewayResp.json();
        return res.status(gatewayResp.status).json(data);
    } catch (err) {
        console.error('[AI Proxy] Error sending feedback:', err);
        return res.status(500).json({ message: 'Failed to record feedback' });
    }
});

// Whether AI is available to the caller (for showing or hiding AI buttons).
router.get('/status', async (req, res) => {
    try {
        const access = await aiAccess(req.user);
        let runtime = false;
        try {
            const resp = await fetch(`${gatewayUrl()}/health`, { signal: AbortSignal.timeout(3000) });
            runtime = resp.ok && (await resp.json()).runtime_connected === true;
        } catch { runtime = false; }
        return res.json({ allowed: access.allowed, reason: access.reason, modelRunning: runtime });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// ===== Admin controls and usage =====
const requireAdmin = requireRole('admin');

router.get('/admin/settings', requireAdmin, async (req, res) => {
    try {
        const disabled = await localDb.prepare("SELECT id, email, full_name, role FROM users WHERE ai_enabled = false ORDER BY email").all();
        return res.json({ enabled: await schoolAiEnabled(), disabledUsers: disabled });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

router.put('/admin/settings', requireAdmin, async (req, res) => {
    try {
        if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ message: 'enabled must be true or false' });
        await localDb.prepare(`
            INSERT INTO system_settings (key, value, updated_by, updated_at) VALUES ('ai_enabled', ?::jsonb, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(req.body.enabled), req.user.email);
        return res.json({ enabled: req.body.enabled });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

router.patch('/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        if (typeof req.body.aiEnabled !== 'boolean') return res.status(400).json({ message: 'aiEnabled must be true or false' });
        const info = await localDb.prepare("UPDATE users SET ai_enabled = ? WHERE id = ?").run(req.body.aiEnabled, req.params.id);
        if (!info.changes) return res.status(404).json({ message: 'User not found' });
        return res.json({ id: Number(req.params.id), aiEnabled: req.body.aiEnabled });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Usage per person (calls, failures, tokens, speed) and how drafts were received
// (approved as-is, approved after edits, rejected). No AI output content is exposed here.
router.get('/admin/usage', requireAdmin, async (req, res) => {
    try {
        const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
        const calls = await localDb.prepare(`
            SELECT u.id AS user_id, u.email, u.full_name, c.feature,
                   COUNT(*) AS calls, COUNT(*) FILTER (WHERE NOT c.ok) AS failed,
                   COALESCE(SUM(c.prompt_tokens), 0) AS prompt_tokens, COALESCE(SUM(c.completion_tokens), 0) AS completion_tokens,
                   ROUND(AVG(c.latency_ms)) AS avg_latency_ms
            FROM ai_calls c LEFT JOIN users u ON u.id = c.user_id
            WHERE c.created_at >= NOW() - make_interval(days => ?)
            GROUP BY u.id, u.email, u.full_name, c.feature ORDER BY COUNT(*) DESC
        `).all(days);
        const drafts = await localDb.prepare(`
            SELECT d.type, d.created_by,
                   COUNT(*) FILTER (WHERE d.status = 'approved' AND NOT d.edited) AS approved_as_is,
                   COUNT(*) FILTER (WHERE d.status = 'approved' AND d.edited) AS approved_edited,
                   COUNT(*) FILTER (WHERE d.status = 'rejected') AS rejected,
                   COUNT(*) FILTER (WHERE d.status = 'pending') AS pending
            FROM ai_drafts d WHERE d.created_at >= NOW() - make_interval(days => ?)
            GROUP BY d.type, d.created_by ORDER BY d.created_by, d.type
        `).all(days);
        const num = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v]));
        return res.json({ days, calls: calls.map(num), drafts: drafts.map(num) });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

export default router;
