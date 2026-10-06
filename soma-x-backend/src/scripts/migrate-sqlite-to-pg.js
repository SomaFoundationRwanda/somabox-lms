import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { pool, initSchemas } from '../helpers/db-manager.js';
import { config } from '../config/index.js';

async function migrate() {
    console.log("Starting SQLite to PostgreSQL Data Migration...");

    // 1. Ensure Postgres tables exist
    await initSchemas();

    const sqliteDbPaths = [
        config.db.serverPath,
        config.db.localPath
    ].filter(p => fs.existsSync(p));

    if (sqliteDbPaths.length === 0) {
        console.log("No existing SQLite database files found. Initialization complete!");
        await pool.end();
        return;
    }

    for (const sqlitePath of sqliteDbPaths) {
        console.log(`\nMigrating data from SQLite file: ${sqlitePath}`);
        let sqliteDb;
        try {
            sqliteDb = new Database(sqlitePath, { readonly: true });
        } catch (err) {
            console.error(`Could not open SQLite database ${sqlitePath}:`, err.message);
            continue;
        }

        const tables = sqliteDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            .all()
            .map(t => t.name);

        for (const tableName of tables) {
            try {
                const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
                if (rows.length === 0) continue;

                console.log(`Migrating table '${tableName}' (${rows.length} rows)...`);

                const sampleRow = rows[0];
                const columns = Object.keys(sampleRow);
                const colNames = columns.map(c => `"${c}"`).join(', ');
                const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

                const insertSql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

                let count = 0;
                for (const row of rows) {
                    const values = columns.map(c => row[c]);
                    await pool.query(insertSql, values);
                    count++;
                }
                console.log(`Successfully imported ${count} rows into '${tableName}'.`);

                // Reset PostgreSQL sequence for serial primary key columns if 'id' exists
                if (columns.includes('id')) {
                    try {
                        const seqNameRes = await pool.query(`
                            SELECT pg_get_serial_sequence($1, 'id') as seq
                        `, [tableName]);
                        const seqName = seqNameRes.rows[0]?.seq;
                        if (seqName) {
                            await pool.query(`
                                SELECT setval($1, COALESCE((SELECT MAX(id) FROM "${tableName}"), 1), true)
                            `, [seqName]);
                        }
                    } catch (e) {
                        // ignore if sequence reset fails
                    }
                }
            } catch (err) {
                console.warn(`Warning migrating table '${tableName}':`, err.message);
            }
        }
        sqliteDb.close();
    }

    console.log("\nSQLite to PostgreSQL Migration completed successfully!");
    await pool.end();
}

migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
});
