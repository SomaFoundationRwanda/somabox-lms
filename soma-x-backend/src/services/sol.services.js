import express from 'express';
import { localDb } from '../helpers/db-manager.js';
import { subjectEmail } from '../helpers/auth.js';

const router = express.Router();

// 2. Spaced Practice: Get pending spaced reviews (3, 7, 30 days)
router.get('/spaced/pending', async (req, res) => {
    try {
        // Admins can view a learner's reviews from the user detail page.
        const scholarEmail = subjectEmail(req, req.query.scholarEmail);
        if (!scholarEmail) return res.status(403).json({ message: 'You can only view your own reviews' });

        const reviews = await localDb.prepare(`
            SELECT id, topic_id, topic_title, interval_days, due_at, status, created_at
            FROM sol_spaced_reviews
            WHERE LOWER(scholar_email) = LOWER(?) AND status = 'pending'
            ORDER BY due_at ASC
        `).all(scholarEmail);

        return res.json(reviews);
    } catch (error) {
        console.error('Error fetching spaced reviews:', error);
        return res.status(500).json({ message: error.message });
    }
});

// Complete Spaced Practice Review
router.post('/spaced/complete', async (req, res) => {
    try {
        const { reviewId } = req.body;
        const scholarEmail = req.user.email;
        if (!reviewId) {
            return res.status(400).json({ message: 'reviewId is required' });
        }

        await localDb.prepare(`
            UPDATE sol_spaced_reviews
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = ? AND LOWER(scholar_email) = LOWER(?)
        `).run(reviewId, String(scholarEmail).toLowerCase());

        return res.json({ message: 'Spaced practice review marked as completed' });
    } catch (error) {
        console.error('Error completing spaced review:', error);
        return res.status(500).json({ message: error.message });
    }
});

// 4. Interleaving
router.get('/interleaving/session', async (req, res) => {
    try {
        // Admins can view a learner's reviews from the user detail page.
        const scholarEmail = subjectEmail(req, req.query.scholarEmail);
        if (!scholarEmail) return res.status(403).json({ message: 'You can only view your own reviews' });

        const rows = await localDb.prepare(`
            SELECT qq.id AS question_id, qq.prompt, qq.question_type, qq.options,
                   q.id AS quiz_id, q.title AS quiz_title, c.id AS course_id, c.title AS course_title
            FROM quiz_questions qq
            JOIN quizzes q ON q.id = qq.quiz_id
            JOIN courses c ON c.id = q.course_id
            JOIN quiz_submissions qs ON qs.quiz_id = q.id AND LOWER(qs.scholar_email) = LOWER(?)
        `).all(scholarEmail);

        const pool = await Promise.all(
            rows
                .filter((row) => String(row.prompt || '').trim())
                .map(async (row) => {
                    let previousAnswer = null;
                    try {
                        const submission = await localDb.prepare(`
                            SELECT answers FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)
                        `).get(row.quiz_id, scholarEmail);
                        const answers = JSON.parse(submission?.answers || '{}');
                        previousAnswer = answers[String(row.question_id)] || null;
                    } catch {
                        previousAnswer = null;
                    }
                    return {
                        id: `${row.quiz_id}-${row.question_id}`,
                        classId: row.course_id,
                        subject: row.course_title,
                        topic: row.quiz_title,
                        question: row.prompt,
                        previousAnswer,
                    };
                })
        );

        const byCourse = new Map();
        for (const item of pool) {
            if (!byCourse.has(item.classId)) byCourse.set(item.classId, []);
            byCourse.get(item.classId).push(item);
        }
        for (const list of byCourse.values()) {
            for (let i = list.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [list[i], list[j]] = [list[j], list[i]];
            }
        }

        const courseLists = Array.from(byCourse.values());
        const selected = [];
        let round = 0;
        while (selected.length < 6 && courseLists.some((list) => list.length > round)) {
            for (const list of courseLists) {
                if (list[round]) selected.push(list[round]);
                if (selected.length >= 6) break;
            }
            round += 1;
        }

        if (selected.length < 2 || byCourse.size < 2) {
            return res.json({
                title: 'Mixed Review',
                description: 'Complete quizzes in at least two courses to unlock a mixed review session.',
                questions: [],
            });
        }

        return res.json({
            title: 'Mixed Review',
            description: 'A few questions pulled from quizzes you\'ve already completed, mixed across courses.',
            questions: selected,
        });
    } catch (error) {
        console.error('Error fetching interleaved session:', error);
        return res.status(500).json({ message: error.message });
    }
});

// 5. Baseline Diagnostic Quiz endpoints
router.get('/diagnostic/status', async (req, res) => {
    try {
        const scholarEmail = subjectEmail(req, req.query.scholarEmail, ['admin', 'teacher']);
        if (!scholarEmail) return res.status(403).json({ message: 'You can only view your own diagnostic' });

        const result = await localDb.prepare(`
            SELECT * FROM diagnostic_results WHERE LOWER(scholar_email) = LOWER(?)
        `).get(scholarEmail);

        return res.json({
            isCompleted: !!result,
            result: result || null
        });
    } catch (error) {
        console.error('Error fetching diagnostic status:', error);
        return res.status(500).json({ message: error.message });
    }
});

router.post('/diagnostic/submit', async (req, res) => {
    try {
        const scholarEmail = req.user.email;
        const overallScore = Number(req.body.overallScore || 0);
        const subjectBreakdown = req.body.subjectBreakdown ? JSON.stringify(req.body.subjectBreakdown) : '{}';


        await localDb.prepare(`
            INSERT INTO diagnostic_results (scholar_email, overall_score, subject_breakdown, completed_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(scholar_email) DO UPDATE SET
                overall_score = EXCLUDED.overall_score,
                subject_breakdown = EXCLUDED.subject_breakdown,
                completed_at = CURRENT_TIMESTAMP
        `).run(scholarEmail, overallScore, subjectBreakdown);

        const subjects = req.body.subjectBreakdown || { Mathematics: overallScore, Science: overallScore, Literacy: overallScore };
        const longStmt = localDb.prepare(`
            INSERT INTO longitudinal_progress (scholar_email, subject, topic, score, total_possible, difficulty_level, attempt_number)
            VALUES (?, ?, 'Baseline Diagnostic', ?, 100, 'diagnostic', 1)
        `);

        for (const [sub, sc] of Object.entries(subjects)) {
            await longStmt.run(scholarEmail, sub, Number(sc || 0));
        }

        return res.json({ message: 'Diagnostic quiz completed successfully' });
    } catch (error) {
        console.error('Error submitting diagnostic quiz:', error);
        return res.status(500).json({ message: error.message });
    }
});

export default router;
