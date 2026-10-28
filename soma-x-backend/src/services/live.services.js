// Live updates for the app (see helpers/live.js): a ticket, then the event stream itself.
import express from 'express';
import { issueTicket, openStream } from '../helpers/live.js';

const router = express.Router();

// Signed in (bearer token): a single-use ticket to open the stream with, valid for a minute.
router.post('/ticket', (req, res) => {
    return res.json({ ticket: issueTicket(req.user, req.sessionToken) });
});

// Public route: the ticket is the authentication (EventSource can't send a bearer token).
router.get('/', (req, res) => {
    openStream(req, res).catch((error) => {
        console.error('Live stream error:', error);
        if (!res.headersSent) res.status(500).json({ message: 'Internal server error' });
    });
});

export default router;
