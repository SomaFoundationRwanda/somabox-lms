// Teachers' classes and subjects come from the admin who creates their account (e.g. classes
// "S1B", "P4A", subjects "English", "Mathematics": the school's own names), so a teacher isn't
// asked for them. Courses record their subject (their class is courses.grade). Teachers get a
// staff code like learners' codes ("GSK-T001"), which they can also sign in with.
// profile_deferred: an account a teacher made for a learner; the first-visit questions can wait.
import { initialsOf } from './0020_school_identity.js';

export async function up(client) {
    await client.query(`
        ALTER TABLE users
            ADD COLUMN teacher_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN teacher_subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN staff_code TEXT,
            ADD COLUMN profile_deferred BOOLEAN NOT NULL DEFAULT false
    `);
    await client.query(`CREATE UNIQUE INDEX users_staff_code_idx ON users (UPPER(staff_code)) WHERE staff_code IS NOT NULL`);
    await client.query(`ALTER TABLE courses ADD COLUMN subject TEXT`);
    await client.query(`ALTER TABLE unit_branding ADD COLUMN next_staff_number INTEGER NOT NULL DEFAULT 1`);

    // Existing teachers get codes in the order they joined.
    const school = (await client.query(`SELECT school_name, school_code FROM unit_branding WHERE id = 1`)).rows[0];
    const prefix = school?.school_code || initialsOf(school?.school_name);
    const teachers = (await client.query(`SELECT id FROM users WHERE role = 'teacher' ORDER BY created_at, id`)).rows;
    let n = 1;
    for (const t of teachers) {
        await client.query(`UPDATE users SET staff_code = $1 WHERE id = $2`, [`${prefix}-T${String(n).padStart(3, '0')}`, t.id]);
        n += 1;
    }
    await client.query(`UPDATE unit_branding SET next_staff_number = $1 WHERE id = 1`, [n]);
}
