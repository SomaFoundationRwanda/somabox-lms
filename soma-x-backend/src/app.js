import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import crypto from 'crypto';
import fs from 'fs';
import { authenticate, requireAuthUnlessPublic } from './helpers/auth.js';
import { localDb } from './helpers/db-manager.js';

import cloudServices from './services/cloud.services.js';
import contentServices from './services/content.services.js';
import authServices from './services/auth.services.js';
import userServices from './services/users.service.js';
import libraryServices from './services/library.services.js';
import coursesServices from './services/courses.services.js';
import solServices from './services/sol.services.js';
import analyticsServices from './services/analytics.services.js';
import notificationsServices from './services/notifications.service.js';
import aiServices from './services/ai-proxy.services.js';
import calendarServices from './services/calendar.services.js';
import syncServices from './services/sync.services.js';
import bundleServices from './services/bundles.services.js';

// API routers in mount order. Exported so tests can enumerate every route.
export const API_ROUTERS = [
    ['/cloud', cloudServices],
    ['/content', contentServices],
    ['/auth', authServices],
    ['/users', userServices],
    ['/library', libraryServices],
    ['/courses', coursesServices],
    ['/sol', solServices],
    ['/analytics', analyticsServices],
    ['/notifications', notificationsServices],
    ['/ai', aiServices],
    ['/calendar', calendarServices],
    ['/sync', syncServices],
    ['/bundles', bundleServices],
];

export function createApp({ logRequests = true } = {}) {
    const app = express();

    // Bearer tokens (not cookies) carry identity, so any origin on the LAN may call the API.
    const corsOptions = {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Disposition'],
        optionsSuccessStatus: 204
    };
    app.use(cors(corsOptions));
    // Express 5 + path-to-regexp v6 disallow bare '*' routes; use regex to cover all
    app.options(/.*/, cors(corsOptions));
    app.use(express.json());

    // Unexpected server errors: the details go to the log with a short reference, and people
    // see a plain message with that reference instead of raw database or code errors.
    app.use((req, res, next) => {
        const json = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode === 500 && body && typeof body === 'object' && !Array.isArray(body)) {
                const ref = crypto.randomBytes(3).toString('hex').toUpperCase();
                console.error(`[error ${ref}] ${req.method} ${req.originalUrl}: ${body.message}`);
                return json({
                    message: `Something went wrong on the server. Please try again; if it keeps happening, tell your administrator (reference ${ref}).`,
                    reference: ref,
                });
            }
            return json(body);
        };
        next();
    });

    // Health check for monitoring on the LAN (no login, no personal data): is the API up, can it
    // reach the database, which migrations are applied, and how much disk is left for uploads.
    app.get('/health', async (req, res) => {
        const health = { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
        try {
            const row = await localDb.prepare('SELECT COUNT(*) AS n, MAX(id) AS latest FROM schema_migrations').get();
            health.database = 'ok';
            health.migrations = Number(row.n);
            health.latestMigration = row.latest;
        } catch {
            health.status = 'degraded';
            health.database = 'unreachable';
        }
        try {
            const stats = fs.statfsSync(fs.existsSync(config.paths.content) ? config.paths.content : config.paths.root);
            health.diskFreeMb = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
            if (health.diskFreeMb < 1024) health.status = 'degraded';
        } catch {
            health.diskFreeMb = null;
        }
        res.status(health.database === 'ok' ? 200 : 503).json(health);
    });

    if (logRequests) {
        app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
            next();
        });
    }

    // Static content is loaded by <img>, <video> and iframes, which can't send a bearer
    // token, so it is served before the auth gate.
    // TODO(phase 4): course files should be enrollment-checked (signed URLs).
    app.use('/khan-academy', express.static(config.paths.static.khan));
    app.use('/w3schools', express.static(config.paths.static.w3schools));
    app.use('/wikipedia', express.static(config.paths.static.wikipedia));
    app.use('/lessons', express.static(config.paths.lessons));
    app.use('/library-book-covers', express.static(config.paths.libraryCovers));
    app.use('/course-covers', express.static(config.paths.courseCovers));
    app.use('/course-files', express.static(config.paths.courseFiles));
    app.use('/pdf-book-covers', express.static(config.paths.pdfCovers));

    // Every API route below requires a session unless listed in PUBLIC_ROUTES.
    app.use(authenticate);
    app.use(requireAuthUnlessPublic);

    for (const [prefix, router] of API_ROUTERS) app.use(prefix, router);

    // Errors thrown outside a route's own try/catch (e.g. upload validation) as JSON.
    app.use((err, req, res, next) => {
        if (res.headersSent) return next(err);
        console.error(`${req.method} ${req.path} failed:`, err);
        // 4xx keeps its message (e.g. "File too large"); 500s are replaced by the plain message above.
        res.status(err.status || err.statusCode || 500).json({ message: err.message || 'Request failed' });
    });

    return app;
}
