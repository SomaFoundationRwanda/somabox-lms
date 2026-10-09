// The school this box serves: its settings, and learner codes ("GSK-0001").
import { localDb } from '../helpers/db-manager.js';
import { initialsOf } from '../db/migrations/0020_school_identity.js';

export { initialsOf };

export const DEFAULT_PRIMARY = '#203A3A';
export const DEFAULT_SECONDARY = '#0D9488';

export async function getSchool() {
    await localDb.prepare('INSERT INTO unit_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING').run();
    const row = await localDb.prepare(`
        SELECT school_name, school_code, province, district, is_rural, next_learner_number, logo_file, logo_url,
               primary_color, secondary_color, configured_at, guest_preview_enabled, guest_preview_seconds, guest_preview_items
        FROM unit_branding WHERE id = 1
    `).get();
    return {
        name: row.school_name || '',
        code: row.school_code || initialsOf(row.school_name),
        province: row.province || null,
        district: row.district || null,
        isRural: row.is_rural == null ? null : Number(row.is_rural) === 1,
        nextLearnerNumber: Number(row.next_learner_number),
        // The school's logo (uploaded), shown instead of the SOMABOX logo; null = SOMABOX's.
        logoUrl: row.logo_file ? `/branding/${row.logo_file}` : null,
        primaryColor: row.primary_color || DEFAULT_PRIMARY,
        secondaryColor: row.secondary_color || DEFAULT_SECONDARY,
        configured: !!row.configured_at,
        guestPreview: {
            enabled: row.guest_preview_enabled !== false,
            seconds: Number(row.guest_preview_seconds || 40),
            items: Number(row.guest_preview_items || 5),
        },
    };
}

/** What anyone (signed in or not) may know about the school: name, look, visitor previews. */
export async function publicSchool() {
    const s = await getSchool();
    return {
        name: s.name, code: s.code, logoUrl: s.logoUrl, primaryColor: s.primaryColor,
        secondaryColor: s.secondaryColor, configured: s.configured, guestPreview: s.guestPreview,
    };
}

/**
 * Gives a learner the next code (unless they have one). Runs in the caller's transaction if any;
 * the settings row is locked so two sign-ups can't get the same number.
 */
export async function assignLearnerCode(userId) {
    return localDb.transaction(async () => {
        const user = await localDb.prepare('SELECT learner_code FROM users WHERE id = ?').get(userId);
        if (!user || user.learner_code) return user?.learner_code ?? null;
        const school = await localDb.prepare('SELECT school_name, school_code, next_learner_number FROM unit_branding WHERE id = 1 FOR UPDATE').get();
        const prefix = school?.school_code || initialsOf(school?.school_name);
        let n = Number(school?.next_learner_number || 1);
        let code;
        // Skip numbers already taken (e.g. after the code prefix was changed back).
        for (;;) {
            code = `${prefix}-${String(n).padStart(4, '0')}`;
            n += 1;
            if (!await localDb.prepare('SELECT 1 FROM users WHERE UPPER(learner_code) = UPPER(?)').get(code)) break;
        }
        await localDb.prepare('UPDATE unit_branding SET next_learner_number = ? WHERE id = 1').run(n);
        await localDb.prepare('UPDATE users SET learner_code = ? WHERE id = ?').run(code, userId);
        return code;
    })();
}

/**
 * The box is the school's location: everyone except admins gets the school's name, province,
 * district and rural/urban (where the admin has set them). No learner or teacher is asked.
 */
export async function applySchoolToUser(userId) {
    const s = await getSchool();
    await localDb.prepare(`
        UPDATE users SET school_name = ?,
               region_province = COALESCE(?, region_province),
               region_district = COALESCE(?, region_district),
               is_rural = COALESCE(?, is_rural)
        WHERE id = ? AND role <> 'admin'
    `).run(s.name || null, s.province, s.district, s.isRural == null ? null : (s.isRural ? 1 : 0), userId);
}

/** After the admin changes the school's name or location: every learner and teacher follows. */
export async function applySchoolToEveryone() {
    const s = await getSchool();
    await localDb.prepare(`
        UPDATE users SET school_name = ?,
               region_province = COALESCE(?, region_province),
               region_district = COALESCE(?, region_district),
               is_rural = COALESCE(?, is_rural)
        WHERE role <> 'admin'
    `).run(s.name || null, s.province, s.district, s.isRural == null ? null : (s.isRural ? 1 : 0));
}

// Older name kept for callers written before teachers were included.
export const applySchoolToLearner = applySchoolToUser;
