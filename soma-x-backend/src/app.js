import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { authenticate, requireAuthUnlessPublic } from './helpers/auth.js';

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
];

export function createApp({ logRequests = true } = {}) {
    const app = express();

    // Bearer tokens (not cookies) carry identity, so any origin on the LAN may call the API.
    const corsOptions = {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 204
    };
    app.use(cors(corsOptions));
    // Express 5 + path-to-regexp v6 disallow bare '*' routes; use regex to cover all
    app.options(/.*/, cors(corsOptions));
    app.use(express.json());

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
        res.status(err.status || err.statusCode || 500).json({ message: err.message || 'Request failed' });
    });

    return app;
}
