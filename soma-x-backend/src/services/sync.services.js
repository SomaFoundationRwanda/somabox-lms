// Cloud sync controls (admins): status, what may leave the box, and "sync now".
import express from 'express';
import { requireRole } from '../helpers/auth.js';
import { pushOutbox, saveSyncScope, syncStatus } from './sync/outbox.js';

const router = express.Router();
router.use(requireRole('admin'));

router.get('/status', async (req, res) => {
    try {
        return res.json(await syncStatus());
    } catch (error) {
        console.error('Error reading sync status:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.post('/run', async (req, res) => {
    try {
        const result = await pushOutbox();
        return res.json({ ...result, message: runMessage(result) });
    } catch (error) {
        console.error('Error running sync:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const scope = await saveSyncScope(req.body?.scope, req.user.email);
        return res.json({ scope });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ message: error.message });
        console.error('Error saving sync settings:', error);
        return res.status(500).json({ message: error.message });
    }
});

export function runMessage(result) {
    switch (result.status) {
        case 'ok': return `Sent ${result.sent} records to the cloud${result.pending ? `; ${result.pending} still waiting` : ''}`;
        case 'nothing_to_send': return 'Everything is already synced';
        case 'not_configured': return `Cloud sync isn't set up on this box yet; ${result.pending} records are waiting`;
        case 'busy': return 'A sync is already running';
        case 'failed': return `Couldn't reach the cloud (${result.error}). The records stay on the box and will be retried.`;
        default: return result.status;
    }
}

export default router;
