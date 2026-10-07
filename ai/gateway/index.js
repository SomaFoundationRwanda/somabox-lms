import express from 'express';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { insertFeedback, getAllFeedback } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '../config.yaml');
const promptsDir = path.resolve(__dirname, '../prompts');

// Load config.yaml dynamically
function loadConfig() {
    try {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        return yaml.load(fileContent);
    } catch (err) {
        console.error('Error loading config.yaml:', err);
        process.exit(1);
    }
}

let config = loadConfig();

// Watch config.yaml for live hot-reloading
fs.watch(configPath, () => {
    try {
        console.log('[AI Gateway] Reloading config.yaml...');
        config = loadConfig();
    } catch (err) {
        console.error('[AI Gateway] Failed to reload config:', err);
    }
});

const app = express();
app.use(express.json({ limit: '1mb' }));

// Concurrency Queue state management
let activeRequests = 0;
const queue = [];

function processQueue() {
    const maxConcurrency = config.gateway.max_concurrency || 2;
    while (activeRequests < maxConcurrency && queue.length > 0) {
        const nextTask = queue.shift();
        activeRequests++;
        nextTask();
    }
}

// Helper to render prompt templates
function renderPrompt(mode, question, sourceText = '', courseId = '', lessonId = '') {
    const promptFile = path.join(promptsDir, `${mode}.txt`);
    let template = '';
    if (fs.existsSync(promptFile)) {
        template = fs.readFileSync(promptFile, 'utf8');
    } else {
        template = `Mode: ${mode}\nContext: {CONTEXT}\nSource: {SOURCE_TEXT}\nRequest: {QUESTION}`;
    }

    let contextStr = 'None';
    if (courseId || lessonId) {
        contextStr = `Teacher is editing: Course ID: ${courseId || 'N/A'}, Lesson ID: ${lessonId || 'N/A'}`;
    }

    const maxPasted = config.gateway.max_pasted_text_length || 4000;
    const truncatedSource = (sourceText || '').slice(0, maxPasted);

    return template
        .replace('{CONTEXT}', contextStr)
        .replace('{SOURCE_TEXT}', truncatedSource || 'None')
        .replace('{QUESTION}', question || '');
}

// GET /health
app.get('/health', async (req, res) => {
    const runtimeUrl = `http://${config.runtime.host}:${config.runtime.port}/health`;
    let runtimeHealthy = false;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const resp = await fetch(runtimeUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) runtimeHealthy = true;
    } catch (err) {
        runtimeHealthy = false;
    }

    return res.json({
        status: runtimeHealthy ? 'healthy' : 'degraded',
        runtime_connected: runtimeHealthy,
        model: config.model,
        active_requests: activeRequests,
        queued_requests: queue.length,
        config: {
            max_concurrency: config.gateway.max_concurrency,
            max_queue_length: config.gateway.max_queue_length,
            threads: config.runtime.threads,
            context_size: config.runtime.context_size
        }
    });
});

// POST /ask (Streamed response SSE)
app.post('/ask', (req, res) => {
    const { mode, question, source_text, course_id, lesson_id, teacher_hash } = req.body;

    if (!mode || !question) {
        return res.status(400).json({ error: 'Missing required fields: mode, question' });
    }

    const maxQueue = config.gateway.max_queue_length || 10;
    if (queue.length >= maxQueue) {
        return res.status(503).json({
            error: 'AI Assistant is currently busy with high teacher load. Please try again shortly.',
            status: 'busy'
        });
    }

    const responseId = uuidv4();

    const task = async () => {
        try {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Send metadata packet first
            res.write(`data: ${JSON.stringify({
                type: 'meta',
                response_id: responseId,
                disclaimer: '[AI-Generated Draft - Please review and edit before using]',
                model: config.model.name,
                mode
            })}\n\n`);

            const prompt = renderPrompt(mode, question, source_text, course_id, lesson_id);
            const maxTokens = (config.max_tokens && config.max_tokens[mode]) || 1024;
            const runtimeUrl = `http://${config.runtime.host}:${config.runtime.port}/v1/chat/completions`;

            const controller = new AbortController();
            const timeoutMs = config.gateway.timeout_ms || 120000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const llmResponse = await fetch(runtimeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: maxTokens,
                    stream: true
                })
            });

            clearTimeout(timeoutId);

            if (!llmResponse.ok || !llmResponse.body) {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: `Runtime error (status ${llmResponse.status}). Model server may be starting up.`
                })}\n\n`);
                res.end();
                return;
            }

            const reader = llmResponse.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;
                    if (trimmed.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(trimmed.slice(6));
                            const content = json.choices?.[0]?.delta?.content || '';
                            if (content) {
                                res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`);
                            }
                        } catch {
                            // ignore malformed SSE lines
                        }
                    }
                }
            }

            res.write(`data: ${JSON.stringify({ type: 'done', response_id: responseId })}\n\n`);
            res.end();
        } catch (err) {
            console.error('[AI Gateway] Error handling /ask:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'AI Runtime error: ' + err.message });
            } else {
                res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
                res.end();
            }
        } finally {
            activeRequests--;
            processQueue();
        }
    };

    queue.push(task);
    processQueue();
});

// POST /feedback
app.post('/feedback', (req, res) => {
    const { response_id, teacher_hash, rating, comment, mode } = req.body;

    if (!response_id || rating === undefined) {
        return res.status(400).json({ error: 'Missing required fields: response_id, rating' });
    }

    try {
        insertFeedback({
            responseId: response_id,
            teacherHash: teacher_hash || 'anonymous_teacher',
            rating: Number(rating),
            comment: comment || '',
            mode: mode || 'general',
            modelName: config.model.name
        });
        return res.json({ status: 'success', message: 'Feedback logged' });
    } catch (err) {
        console.error('[AI Gateway] Error logging feedback:', err);
        return res.status(500).json({ error: 'Failed to save feedback' });
    }
});

const PORT = config.gateway.port || 5000;
const HOST = config.gateway.host || '127.0.0.1';

app.listen(PORT, HOST, () => {
    console.log(`[AI Gateway] Service running on http://${HOST}:${PORT}`);
});
