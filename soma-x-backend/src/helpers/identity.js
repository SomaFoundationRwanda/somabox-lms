// Many older tables still identify people by email (guide P1-15). Until they move to user ids,
// an email change must be carried into every one of them, or the person's history is orphaned.
import { localDb } from './db-manager.js';

// Learners created without an email (by their teacher) get an internal address from their
// learner code, because people are still identified by email across the database. ".invalid"
// can never be a real address (RFC 2606). It's never shown or sent anywhere.
export const LEARNER_EMAIL_DOMAIN = 'learner.invalid';
export const isInternalEmail = (email) => String(email || '').toLowerCase().endsWith(`@${LEARNER_EMAIL_DOMAIN}`);

// Columns that hold a person's email without "email" in their name.
const ACTOR_COLUMNS = ['changed_by', 'graded_by', 'granted_by', 'requested_by', 'created_by', 'decided_by', 'baseline_decided_by', 'added_by', 'updated_by'];

/** Every text column (outside users.email) that can hold a person's email. */
async function emailColumns() {
    return localDb.prepare(`
        SELECT c.table_name, c.column_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.data_type = 'text'
          AND (c.column_name LIKE '%email%' OR c.column_name IN (${ACTOR_COLUMNS.map(() => '?').join(',')}))
          AND NOT (c.table_name = 'users' AND c.column_name = 'email')
          AND c.table_name NOT IN ('sync_outbox', 'migration_report', 'migration_quarantine')
        ORDER BY c.table_name, c.column_name
    `).all(...ACTOR_COLUMNS);
}

/** Rewrites oldEmail to newEmail everywhere. Run inside the transaction that changes users.email. */
export async function renameEmailEverywhere(oldEmail, newEmail) {
    const changed = {};
    for (const { table_name: table, column_name: column } of await emailColumns()) {
        const info = await localDb.prepare(`UPDATE ${table} SET ${column} = ? WHERE LOWER(${column}) = LOWER(?)`).run(newEmail, oldEmail);
        if (info.changes) changed[`${table}.${column}`] = info.changes;
    }
    return changed;
}

/**
 * When an account is deleted, the course places and notifications filed under its email go too,
 * so a new account later registered with the same email can't inherit them (teacher places
 * included). Graded work stays for the record but no longer belongs to any account.
 */
export async function releaseEmail(email) {
    for (const [table, column] of [['enrollments', 'user_email'], ['user_notifications', 'user_email'], ['collaboration_members', 'user_email']]) {
        await localDb.prepare(`DELETE FROM ${table} WHERE LOWER(${column}) = LOWER(?)`).run(email);
    }
}

/**
 * Courses that would have no active teacher left without these people (emails): those where
 * every active teacher with an active account is one of them. [{ id, title }]
 */
export async function coursesOnlyTaughtBy(emails) {
    const list = emails.map((e) => String(e).toLowerCase());
    if (!list.length) return [];
    const marks = list.map(() => '?').join(', ');
    return localDb.prepare(`
        SELECT c.id, c.title FROM courses c
        WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.id AND e.role = 'teacher' AND e.status = 'active' AND LOWER(e.user_email) IN (${marks}))
          AND NOT EXISTS (
            SELECT 1 FROM enrollments e JOIN users u ON LOWER(u.email) = LOWER(e.user_email) AND u.is_active = 1
            WHERE e.course_id = c.id AND e.role = 'teacher' AND e.status = 'active' AND LOWER(e.user_email) NOT IN (${marks})
          )
        ORDER BY c.title
    `).all(...list, ...list);
}
