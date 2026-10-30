// Course bundle library (teachers and admins): upload bundles (kept as read-only versions) and
// create new draft courses from them. Exporting a course is GET /courses/:id/bundle.
import express from 'express';
import multer from 'multer';
import { localDb } from '../helpers/db-manager.js';
import { requireRole } from '../helpers/auth.js';
import { sendItemError } from './courses/items.js';
import { addToLibrary, importBundle, BundleError } from './bundles/bundle.js';

const router = express.Router();
router.use(requireRole('teacher', 'admin'));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** The bundle from a multipart "bundle" file or a JSON body { bundle }. */
function readBundle(req) {
    if (req.file) {
        try {
            return JSON.parse(req.file.buffer.toString('utf8'));
        } catch {
            throw new BundleError(400, "That file isn't a course bundle (it isn't valid JSON)");
        }
    }
    if (req.body?.bundle) return req.body.bundle;
    throw new BundleError(400, 'Choose a bundle file to upload');
}

const summary = (row) => ({
    id: row.id, bundleId: row.bundle_id, version: row.version, title: row.title, source: row.source,
    addedBy: row.added_by, createdAt: row.created_at,
    outcomes: Array.isArray(row.data?.outcomes) ? row.data.outcomes.length : 0,
    weeks: Array.isArray(row.data?.modules) ? row.data.modules.filter((m) => m.kind === 'regular').length : 0,
    description: row.data?.course?.description || '',
    grade: row.data?.course?.grade || '',
});

router.get('/', async (req, res) => {
    try {
        const rows = await localDb.prepare('SELECT * FROM course_bundles ORDER BY title, bundle_id, version DESC').all();
        const copies = await localDb.prepare(`
            SELECT c.imported_bundle_id AS bundle_id, c.imported_bundle_version AS version, c.id, c.title FROM courses c
            JOIN enrollments e ON e.course_id = c.id AND LOWER(e.user_email) = LOWER(?) AND e.role IN ('teacher', 'ta') AND e.status = 'active'
            WHERE c.imported_bundle_id IS NOT NULL
        `).all(req.user.email);
        return res.json(rows.map((row) => ({
            ...summary(row),
            myCopies: copies.filter((c) => c.bundle_id === row.bundle_id).map((c) => ({ courseId: c.id, title: c.title, version: c.version })),
        })));
    } catch (error) {
        console.error('Error listing bundles:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.get('/:bundleRowId', async (req, res) => {
    try {
        const row = await localDb.prepare('SELECT * FROM course_bundles WHERE id = ?').get(req.params.bundleRowId);
        if (!row) return res.status(404).json({ message: 'Bundle not found' });
        return res.json({ ...summary(row), bundle: row.data });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Add a bundle file to the library without creating a course.
router.post('/', upload.single('bundle'), async (req, res) => {
    try {
        const { entry, added } = await addToLibrary(readBundle(req), { source: 'upload', actorEmail: req.user.email });
        return res.status(added ? 201 : 200).json({ ...summary(entry), added });
    } catch (error) {
        if (sendItemError(res, error)) return;
        console.error('Error adding bundle:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Create a new draft course from a library bundle. Never changes an existing course.
router.post('/:bundleRowId/courses', async (req, res) => {
    try {
        const row = await localDb.prepare('SELECT * FROM course_bundles WHERE id = ?').get(req.params.bundleRowId);
        if (!row) return res.status(404).json({ message: 'Bundle not found' });
        return res.status(201).json(await importBundle(row.data, req.user));
    } catch (error) {
        if (sendItemError(res, error)) return;
        console.error('Error importing bundle:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Upload and create a course in one step.
router.post('/import', upload.single('bundle'), async (req, res) => {
    try {
        const bundle = readBundle(req);
        const { entry } = await addToLibrary(bundle, { source: 'upload', actorEmail: req.user.email });
        const result = await importBundle(entry.data, req.user);
        return res.status(201).json({ ...result, bundle: summary(entry) });
    } catch (error) {
        if (sendItemError(res, error)) return;
        console.error('Error importing bundle:', error);
        return res.status(500).json({ message: error.message });
    }
});

export default router;
