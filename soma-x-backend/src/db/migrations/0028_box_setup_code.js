// The one-time code that sets up a new box (or recovers its admin): only its hash is kept.
// Replaces the built-in admin@mail.com / admin account, which whoever signed in first could claim.
export async function up(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS box_setup_code (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            code_hash TEXT NOT NULL,
            purpose TEXT NOT NULL CHECK (purpose IN ('setup', 'recover')),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
    `);
    // The old built-in admin goes if it was never used (still the default password, nothing done).
    await client.query(`
        DELETE FROM users u
        WHERE LOWER(u.email) = 'admin@mail.com' AND u.must_change_password = 1
          AND NOT EXISTS (SELECT 1 FROM admin_audit_logs a WHERE LOWER(a.admin_email) = 'admin@mail.com')
    `);
}
