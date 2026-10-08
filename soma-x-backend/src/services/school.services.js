// The school this box serves. Everyone signed in can read it; admins set it.
import express from 'express';
import { localDb } from '../helpers/db-manager.js';
import { requireRole } from '../helpers/auth.js';
import { getSchool, initialsOf } from './school.js';

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { nextLearnerNumber, ...school } = await getSchool();
        return res.json(req.user.role === 'admin' ? { ...school, nextLearnerNumber } : school);
    } catch (error) {
        console.error('Error reading school settings:', error);
        return res.status(500).json({ message: error.message });
    }
});

// { name?, code?, province?, district?, isRural? (true|false|null) }. A change of name or
// rural/urban applies to every learner on the box (one box, one school). Existing learner codes
// keep their prefix; new learners get the new code.
router.put('/', requireRole('admin'), async (req, res) => {
    try {
        const sets = [];
        const params = [];
        const body = req.body || {};
        if (body.name !== undefined) {
            const name = String(body.name).trim().slice(0, 200);
            if (!name) return res.status(400).json({ message: "The school's name can't be empty" });
            sets.push('school_name = ?');
            params.push(name);
        }
        if (body.code !== undefined) {
            const code = String(body.code || '').trim().toUpperCase() || initialsOf(body.name);
            if (!/^[A-Z0-9]{2,8}$/.test(code)) return res.status(400).json({ message: 'The school code must be 2 to 8 letters or digits (e.g. GSK)' });
            sets.push('school_code = ?');
            params.push(code);
        }
        for (const field of ['province', 'district']) {
            if (body[field] !== undefined) {
                sets.push(`${field} = ?`);
                params.push(String(body[field] || '').trim().slice(0, 100) || null);
            }
        }
        if (body.isRural !== undefined) {
            if (body.isRural !== null && typeof body.isRural !== 'boolean') return res.status(400).json({ message: 'isRural must be true, false, or null' });
            sets.push('is_rural = ?');
            params.push(body.isRural === null ? null : (body.isRural ? 1 : 0));
        }
        if (!sets.length) return res.status(400).json({ message: 'Nothing to change' });

        await localDb.transaction(async () => {
            await localDb.prepare(`UPDATE unit_branding SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(...params);
            const school = await getSchool();
            if (body.name !== undefined) {
                await localDb.prepare("UPDATE users SET school_name = ? WHERE role = 'scholar'").run(school.name);
            }
            if (body.isRural !== undefined && school.isRural != null) {
                await localDb.prepare("UPDATE users SET is_rural = ? WHERE role = 'scholar'").run(school.isRural ? 1 : 0);
            }
        })();
        const { nextLearnerNumber, ...school } = await getSchool();
        return res.json({ ...school, nextLearnerNumber });
    } catch (error) {
        console.error('Error saving school settings:', error);
        return res.status(500).json({ message: error.message });
    }
});

export default router;
