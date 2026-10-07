import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
// Arbitrary constant so concurrent starts (e.g. two pm2 instances) don't both migrate.
const MIGRATION_LOCK_KEY = 74_201_901;

/**
 * Applies every migration in src/db/migrations that hasn't run yet, in filename order.
 *
 * A migration is a module named NNNN_description.js exporting `async up(client)`, where
 * client is a pg client already inside a transaction. Each migration runs in its own
 * transaction and is recorded in schema_migrations, so it runs exactly once per database.
 * Never edit a migration after it has shipped; add a new one instead.
 */
export async function runMigrations(pool) {
    const client = await pool.connect();
    try {
        await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const applied = new Set((await client.query('SELECT id FROM schema_migrations')).rows.map((r) => r.id));
        const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.+\.js$/.test(f)).sort();

        for (const file of files) {
            const id = file.replace(/\.js$/, '');
            if (applied.has(id)) continue;
            const migration = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
            try {
                await client.query('BEGIN');
                await migration.up(client);
                await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
                await client.query('COMMIT');
                console.log(`Applied migration ${id}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw new Error(`Migration ${id} failed: ${error.message}`);
            }
        }
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
        client.release();
    }
}
