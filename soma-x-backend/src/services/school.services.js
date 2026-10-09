// The school this box serves: its name, code, location, look (logo, colours) and visitor
// previews. Admins set it on the School page and can change it any time.
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { localDb } from '../helpers/db-manager.js';
import { requireRole } from '../helpers/auth.js';
import { config } from '../config/index.js';
import { getSchool, publicSchool, initialsOf, applySchoolToEveryone } from './school.js';

const router = express.Router();
export const BRANDING_DIR = path.join(config.paths.content, 'branding');
const HEX = /^#[0-9a-fA-F]{6}$/;
const upload = multer({ dest: path.join(os.tmpdir(), 'somabox-uploads'), limits: { fileSize: 5 * 1024 * 1024 } });

// Public: the login page and visitors see the school's name, logo and colours.
router.get('/public', async (req, res) => {
    try {
        return res.json(await publicSchool());
    } catch (error) {
        console.error('Error reading school:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const { nextLearnerNumber, ...school } = await getSchool();
        return res.json(req.user.role === 'admin' ? { ...school, nextLearnerNumber } : school);
    } catch (error) {
        console.error('Error reading school settings:', error);
        return res.status(500).json({ message: error.message });
    }
});

/**
 * { name?, code?, province?, district?, isRural? (true|false|null), primaryColor?, secondaryColor?,
 *   guestPreview?: { enabled?, seconds?, items? } }. The name and location apply to every learner
 * and teacher on the box (one box, one school). Existing learner codes keep their prefix.
 */
router.put('/', requireRole('admin'), async (req, res) => {
    try {
        const sets = [];
        const params = [];
        const body = req.body || {};
        if (body.name !== undefined) {
            const name = String(body.name).trim().slice(0, 200);
            if (!name) return res.status(400).json({ message: "The school's name can't be empty" });
            sets.push('school_name = ?', 'configured_at = COALESCE(configured_at, CURRENT_TIMESTAMP)');
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
        for (const [field, column] of [['primaryColor', 'primary_color'], ['secondaryColor', 'secondary_color']]) {
            if (body[field] !== undefined) {
                if (!HEX.test(String(body[field]))) return res.status(400).json({ message: 'Colours must look like #203A3A' });
                sets.push(`${column} = ?`);
                params.push(String(body[field]).toUpperCase());
            }
        }
        const preview = body.guestPreview;
        if (preview !== undefined) {
            if (preview.enabled !== undefined) {
                if (typeof preview.enabled !== 'boolean') return res.status(400).json({ message: 'guestPreview.enabled must be true or false' });
                sets.push('guest_preview_enabled = ?');
                params.push(preview.enabled);
            }
            if (preview.seconds !== undefined) {
                const n = Number(preview.seconds);
                if (!Number.isInteger(n) || n < 10 || n > 600) return res.status(400).json({ message: 'Preview time must be 10 to 600 seconds' });
                sets.push('guest_preview_seconds = ?');
                params.push(n);
            }
            if (preview.items !== undefined) {
                const n = Number(preview.items);
                if (!Number.isInteger(n) || n < 1 || n > 50) return res.status(400).json({ message: 'Visitors can preview 1 to 50 items' });
                sets.push('guest_preview_items = ?');
                params.push(n);
            }
        }
        if (!sets.length) return res.status(400).json({ message: 'Nothing to change' });

        await localDb.transaction(async () => {
            await localDb.prepare(`UPDATE unit_branding SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(...params);
            if (['name', 'province', 'district', 'isRural'].some((k) => body[k] !== undefined)) await applySchoolToEveryone();
        })();
        const { nextLearnerNumber, ...school } = await getSchool();
        return res.json({ ...school, nextLearnerNumber });
    } catch (error) {
        console.error('Error saving school settings:', error);
        return res.status(500).json({ message: error.message });
    }
});

// The school's logo (PNG, JPEG, or WebP), shown instead of the SOMABOX logo. Stored as a PNG up to
// 512 px, under a new name each time so browsers don't keep showing the old one.
router.post('/logo', requireRole('admin'), upload.single('logo'), async (req, res) => {
    const cleanup = () => { if (req.file?.path) fs.rmSync(req.file.path, { force: true }); };
    try {
        if (!req.file) return res.status(400).json({ message: 'Choose an image' });
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(req.file.mimetype)) {
            cleanup();
            return res.status(400).json({ message: 'The logo must be a PNG, JPEG, or WebP image' });
        }
        fs.mkdirSync(BRANDING_DIR, { recursive: true });
        const name = `logo-${Date.now()}.png`;
        try {
            await sharp(req.file.path).resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).png().toFile(path.join(BRANDING_DIR, name));
        } catch {
            cleanup();
            return res.status(400).json({ message: "That file couldn't be read as an image" });
        }
        cleanup();
        const old = (await localDb.prepare('SELECT logo_file FROM unit_branding WHERE id = 1').get())?.logo_file;
        await localDb.prepare('UPDATE unit_branding SET logo_file = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(name);
        if (old && old !== name) fs.rmSync(path.join(BRANDING_DIR, path.basename(old)), { force: true });
        return res.status(201).json(await publicSchool());
    } catch (error) {
        cleanup();
        console.error('Logo upload failed:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Back to the SOMABOX logo.
router.delete('/logo', requireRole('admin'), async (req, res) => {
    try {
        const old = (await localDb.prepare('SELECT logo_file FROM unit_branding WHERE id = 1').get())?.logo_file;
        await localDb.prepare('UPDATE unit_branding SET logo_file = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run();
        if (old) fs.rmSync(path.join(BRANDING_DIR, path.basename(old)), { force: true });
        return res.json(await publicSchool());
    } catch (error) {
        console.error('Logo removal failed:', error);
        return res.status(500).json({ message: error.message });
    }
});

export default router;
