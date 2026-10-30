// One box serves one school. The school's identity lives in its settings (name, short code,
// location), so learners aren't asked for it, and every learner gets a learner code made of the
// school's code and a number (e.g. "GSK-0001"), which they can also log in with.
export function initialsOf(name) {
    const skip = new Set(['of', 'de', 'du', 'la', 'le', 'and', 'et', 'the', "d'"]);
    const words = String(name || '').split(/[^A-Za-z0-9]+/).filter((w) => w && !skip.has(w.toLowerCase()));
    const initials = words.map((w) => w[0].toUpperCase()).join('').slice(0, 6);
    return initials.length >= 2 ? initials : 'SCH';
}

export async function up(client) {
    await client.query(`INSERT INTO unit_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    await client.query(`
        ALTER TABLE unit_branding
            ADD COLUMN school_code TEXT,
            ADD COLUMN province TEXT,
            ADD COLUMN district TEXT,
            ADD COLUMN is_rural INTEGER CHECK (is_rural IN (0, 1)),
            ADD COLUMN next_learner_number INTEGER NOT NULL DEFAULT 1
    `);
    const school = (await client.query(`SELECT school_name FROM unit_branding WHERE id = 1`)).rows[0];
    const code = initialsOf(school?.school_name);
    await client.query(`UPDATE unit_branding SET school_code = $1 WHERE id = 1`, [code]);

    await client.query(`ALTER TABLE users ADD COLUMN learner_code TEXT`);
    await client.query(`CREATE UNIQUE INDEX users_learner_code_idx ON users (UPPER(learner_code)) WHERE learner_code IS NOT NULL`);
    // Existing learners get codes in the order they joined.
    const learners = (await client.query(`SELECT id FROM users WHERE role = 'scholar' ORDER BY created_at, id`)).rows;
    let n = 1;
    for (const l of learners) {
        await client.query(`UPDATE users SET learner_code = $1 WHERE id = $2`, [`${code}-${String(n).padStart(4, '0')}`, l.id]);
        n += 1;
    }
    await client.query(`UPDATE unit_branding SET next_learner_number = $1 WHERE id = 1`, [n]);
}
