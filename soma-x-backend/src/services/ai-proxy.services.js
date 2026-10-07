import express from 'express';
import crypto from 'crypto';

const router = express.Router();
const GATEWAY_URL = process.env.AI_GATEWAY_URL || 'http://127.0.0.1:5000';

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

// Teachers and admins may use the assistant (the admin question is open: guide §12.2).
// Identity and role come from the session, never from client headers.
function verifyTeacherOrAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Please log in to continue' });
    if (!['teacher', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden: AI Assistant is available for Teachers and Admins only.' });
    }
    // Opaque id for the gateway's feedback log. Same input as before (the email) so
    // existing hashes stay comparable.
    req.teacherHash = crypto.createHash('sha256').update(req.user.email).digest('hex').substring(0, 16);
    req.userEmail = req.user.email;
    next();
}

// GET /ai/health - Check if AI service is operational
router.get('/health', async (req, res) => {
    try {
        const resp = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(3000) });
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
    if (!checkRateLimit(req.user.id)) {
        return res.status(429).json({ message: 'Rate limit exceeded. Please wait a few minutes before asking again.' });
    }

    const { mode, question, source_text, course_id, lesson_id } = req.body;

    try {
        const gatewayResp = await fetch(`${GATEWAY_URL}/ask`, {
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
    } catch (err) {
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
        const gatewayResp = await fetch(`${GATEWAY_URL}/feedback`, {
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

export default router;
