import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { runMigrations } from '../db/migrate.js';
import { config } from '../config/index.js';
import bcrypt from 'bcrypt';

const { Pool } = pg;

// Return DATE columns as 'YYYY-MM-DD' strings. The default turns them into a JS Date at local
// midnight, which shifts the day in some time zones.
pg.types.setTypeParser(1082, (value) => value);

// Create PostgreSQL connection pool
export const pool = new Pool(
    config.db.connectionString
        ? {
            connectionString: config.db.connectionString,
            max: config.db.max,
            idleTimeoutMillis: config.db.idleTimeoutMillis,
            connectionTimeoutMillis: config.db.connectionTimeoutMillis,
            ssl: config.db.ssl
        }
        : {
            host: config.db.host,
            port: config.db.port,
            user: config.db.user,
            password: config.db.password,
            database: config.db.database,
            max: config.db.max,
            idleTimeoutMillis: config.db.idleTimeoutMillis,
            connectionTimeoutMillis: config.db.connectionTimeoutMillis,
            ssl: config.db.ssl
        }
);

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
});

console.log(`Connected to PostgreSQL Database: ${config.db.database} at ${config.db.host}:${config.db.port}`);

/**
 * Helper to transform SQLite SQL dialect to PostgreSQL SQL dialect:
 * 1. Replaces positional ? parameters with $1, $2, $3, ...
 * 2. Replaces INSERT OR IGNORE INTO with INSERT INTO ... ON CONFLICT DO NOTHING
 * 3. Replaces datetime('now', '-X days') with NOW() - INTERVAL 'X days'
 * 4. Replaces sqlite_master / PRAGMA table_info with PostgreSQL equivalents
 */
export function transformSql(sqliteSql) {
    if (!sqliteSql || typeof sqliteSql !== 'string') return sqliteSql;

    let sql = sqliteSql;

    // 1. Convert positional ? to $1, $2, ...
    let paramIndex = 1;
    sql = sql.replace(/\?/g, () => `$${paramIndex++}`);

    // 2. Convert INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
    if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
        sql = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO");
        if (!/ON\s+CONFLICT/i.test(sql)) {
            sql += " ON CONFLICT DO NOTHING";
        }
    }

    // 3. Convert datetime('now', '-7 days') -> NOW() - INTERVAL '7 days'
    sql = sql.replace(/datetime\('now',\s*'-(\d+)\s*days'\)/gi, "NOW() - INTERVAL '$1 days'");
    sql = sql.replace(/datetime\('now'\)/gi, "NOW()");

    // 4. Convert PRAGMA table_info(tableName)
    const pragmaMatch = sql.match(/PRAGMA\s+table_info\((\w+)\)/i);
    if (pragmaMatch) {
        const tableName = pragmaMatch[1];
        return `SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_name='${tableName}'`;
    }

    // 5. Convert sqlite_master queries
    if (sql.includes('sqlite_master')) {
        sql = sql.replace(
            /SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type='table'\s+AND\s+name=\$1/gi,
            "SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1"
        );
        sql = sql.replace(
            /SELECT\s+sql\s+FROM\s+sqlite_master\s+WHERE\s+name=\$1/gi,
            "SELECT table_name AS sql FROM information_schema.tables WHERE table_schema='public' AND table_name=$1"
        );
    }

    // 6. Convert GLOB '[0-9]...' -> ~ '^[0-9]...'
    sql = sql.replace(/GLOB\s+'(.*?)'/gi, (match, pattern) => {
        const regexStr = pattern.replace(/\[0-9\]/g, '\\d');
        return `~ '^${regexStr}$'`;
    });

    return sql;
}

// Holds the client of the transaction the current async call chain is running in, so
// statements issued inside dbClient.transaction() go through that client automatically.
const txStorage = new AsyncLocalStorage();

function currentExecutor() {
    return txStorage.getStore() || pool;
}

/**
 * Creates a prepare-like query interface compatible with better-sqlite3 signature
 * but backed asynchronously by PostgreSQL pool connection.
 */
function createStatementAdapter(rawSql) {
    const transformedSql = transformSql(rawSql);

    return {
        async get(...args) {
            const params = args.flat();
            const res = await currentExecutor().query(transformedSql, params);
            return res.rows[0] || undefined;
        },
        async all(...args) {
            const params = args.flat();
            const res = await currentExecutor().query(transformedSql, params);
            return res.rows;
        },
        async run(...args) {
            const params = args.flat();
            let sqlToRun = transformedSql;

            const isInsert = /^\s*INSERT\s+/i.test(sqlToRun);
            if (isInsert && !/RETURNING/i.test(sqlToRun)) {
                sqlToRun += " RETURNING id";
            }

            const executor = currentExecutor();
            const inTransaction = executor !== pool;
            // Inside a transaction a failed statement aborts it, so the RETURNING
            // fallback below needs a savepoint to recover.
            if (inTransaction && sqlToRun !== transformedSql) await executor.query('SAVEPOINT returning_id');
            try {
                const res = await executor.query(sqlToRun, params);
                if (inTransaction && sqlToRun !== transformedSql) await executor.query('RELEASE SAVEPOINT returning_id');
                const firstRow = res.rows && res.rows[0];
                const lastId = firstRow ? (firstRow.id !== undefined ? firstRow.id : Object.values(firstRow)[0]) : null;
                return {
                    changes: res.rowCount || 0,
                    lastInsertRowid: lastId
                };
            } catch (err) {
                if (sqlToRun === transformedSql) throw err;
                // If RETURNING id failed because there's no 'id' column (e.g., text PK), retry original query
                if (inTransaction) await executor.query('ROLLBACK TO SAVEPOINT returning_id');
                const res = await executor.query(transformedSql, params);
                return {
                    changes: res.rowCount || 0,
                    lastInsertRowid: null
                };
            }
        }
    };
}

/**
 * Database client object providing prepare(), query(), and exec() methods.
 */
export const dbClient = {
    prepare(sql) {
        return createStatementAdapter(sql);
    },
    async query(sql, params = []) {
        const transformed = transformSql(sql);
        return await currentExecutor().query(transformed, params);
    },
    async exec(sql) {
        return await currentExecutor().query(sql);
    },
    /**
     * Wraps fn in a real database transaction: every localDb/serverDb statement awaited
     * inside fn runs on one client between BEGIN and COMMIT, and any thrown error rolls
     * everything back. Nested calls join the outer transaction.
     */
    transaction(fn) {
        return async (...args) => {
            if (txStorage.getStore()) return await fn(...args);
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await txStorage.run(client, () => fn(...args));
                await client.query('COMMIT');
                return result;
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }
        };
    }
};

// Aliases for backward compatibility with serverDb and localDb imports
export const serverDb = dbClient;
export const localDb = dbClient;

export const DEFAULT_NAV_ITEMS = [
    { nav_key: 'home', label: 'Home', visible_to_students: 1 },
    { nav_key: 'outcomes', label: 'Outcomes', visible_to_students: 1 },
    { nav_key: 'syllabus', label: 'Syllabus', visible_to_students: 1 },
    { nav_key: 'modules', label: 'Modules', visible_to_students: 1 },
    { nav_key: 'assignments', label: 'Assignments', visible_to_students: 1 },
    { nav_key: 'quizzes', label: 'Quizzes', visible_to_students: 1 },
    { nav_key: 'discussions', label: 'Discussions', visible_to_students: 1 },
    { nav_key: 'pages', label: 'Pages', visible_to_students: 1 },
    { nav_key: 'grades', label: 'Grades', visible_to_students: 1 },
    { nav_key: 'rubrics', label: 'Rubrics', visible_to_students: 1 },
    { nav_key: 'announcements', label: 'Announcements', visible_to_students: 1 },
    { nav_key: 'people', label: 'People', visible_to_students: 1 },
    { nav_key: 'files', label: 'Files', visible_to_students: 0 },
    { nav_key: 'collaborations', label: 'Collaborations', visible_to_students: 0 },
    { nav_key: 'settings', label: 'Settings', visible_to_students: 0 },
    { nav_key: 'calendar', label: 'Calendar', visible_to_students: 1 },
    { nav_key: 'insights', label: 'Insights', visible_to_students: 0 },
];

export async function seedDefaultNavItems(courseId) {
    for (let index = 0; index < DEFAULT_NAV_ITEMS.length; index++) {
        const item = DEFAULT_NAV_ITEMS[index];
        await localDb.prepare(`
            INSERT INTO course_nav_items (course_id, nav_key, label, position, visible_to_students, is_default)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT (course_id, nav_key) DO NOTHING
        `).run(courseId, item.nav_key, item.label, index, item.visible_to_students);
    }
}

/**
 * Initialize PostgreSQL database schema if tables don't exist
 */
export async function initSchemas() {
    console.log("Initializing PostgreSQL database schemas...");

    // Every schema change, including the original baseline, is a versioned migration.
    await runMigrations(pool);

    // Ensure default admin user exists; it must change the default password on first login
    const adminCheck = await pool.query("SELECT id, password_hash FROM users WHERE LOWER(email) = 'admin@mail.com'");
    if (adminCheck.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('admin', 12);
        await pool.query(
            "INSERT INTO users (email, full_name, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, 1)",
            ['admin@mail.com', 'Administrator', hashedPassword, 'admin']
        );
        console.log("Created default admin user: admin@mail.com (password change required on first login)");
    } else if (await bcrypt.compare('admin', adminCheck.rows[0].password_hash)) {
        await pool.query("UPDATE users SET must_change_password = 1 WHERE id = $1", [adminCheck.rows[0].id]);
        console.warn("Default admin still uses the default password; a password change will be required at login.");
    }

    // Ensure unit_branding row exists
    await pool.query(`
        INSERT INTO unit_branding (id, school_name)
        VALUES (1, 'SOMABOX Partner School')
        ON CONFLICT (id) DO NOTHING
    `);

    // Add any missing default nav items to existing courses (never changes existing rows)
    try {
        const allCourseIds = await pool.query("SELECT id FROM courses");
        for (const cRow of allCourseIds.rows) {
            await seedDefaultNavItems(cRow.id);
        }
    } catch (mErr) {
        console.error("Nav items seeding error:", mErr);
    }

    console.log("PostgreSQL database schemas successfully initialized!");
}
