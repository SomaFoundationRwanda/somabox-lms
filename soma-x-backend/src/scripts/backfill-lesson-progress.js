import { initSchemas, localDb, serverDb } from '../helpers/db-manager.js';

async function backfillLessonProgress() {
  await initSchemas();

  const before =
    localDb
      .prepare('SELECT COUNT(*) AS total FROM class_lesson_progress')
      .get()?.total || 0;

  const insertResult = localDb
    .prepare(`
      INSERT OR IGNORE INTO class_lesson_progress (lesson_id, scholar_email, status, current_step)
      SELECT cl.id, cm.scholar_email, 'not_started', 1
      FROM class_lessons cl
      INNER JOIN class_memberships cm ON cm.class_id = cl.class_id
    `)
    .run();

  const after =
    localDb
      .prepare('SELECT COUNT(*) AS total FROM class_lesson_progress')
      .get()?.total || 0;

  console.log('Lesson progress backfill complete:');
  console.log(`- Existing rows before: ${Number(before)}`);
  console.log(`- Newly inserted rows: ${Number(insertResult.changes || 0)}`);
  console.log(`- Total rows after: ${Number(after)}`);
}

backfillLessonProgress()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      serverDb.close();
      localDb.close();
    } catch {
      // no-op
    }
  });
