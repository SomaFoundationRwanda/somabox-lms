import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { runMigrations } from '../db/migrate.js';
import { config } from '../config/index.js';

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
 * Queries are written with positional ? parameters (the better-sqlite3 style this prepare()
 * interface copies); PostgreSQL wants $1, $2, ... All SQL is otherwise plain PostgreSQL.
 */
export function transformSql(sql) {
    if (!sql || typeof sql !== 'string') return sql;
    let paramIndex = 1;
    return sql.replace(/\?/g, () => `$${paramIndex++}`);
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
    { nav_key: 'rubrics', label: 'Rubrics', visible_to_students: 0 },
    { nav_key: 'announcements', label: 'Announcements', visible_to_students: 1 },
    { nav_key: 'people', label: 'People', visible_to_students: 1 },
    { nav_key: 'files', label: 'Files', visible_to_students: 0 },
    { nav_key: 'collaborations', label: 'Collaborations', visible_to_students: 0 },
    { nav_key: 'settings', label: 'Settings', visible_to_students: 0 },
    { nav_key: 'calendar', label: 'Calendar', visible_to_students: 1 },
    { nav_key: 'insights', label: 'Insights', visible_to_students: 0 },
    { nav_key: 'attendance', label: 'Attendance', visible_to_students: 1 },
    { nav_key: 'groups', label: 'Groups', visible_to_students: 1 },
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
