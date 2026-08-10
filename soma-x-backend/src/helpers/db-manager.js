import Database from 'better-sqlite3';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';

// Ensure DB directories exist
const serverDbDir = path.dirname(config.db.serverPath);
const localDbDir = path.dirname(config.db.localPath);

if (!fs.existsSync(serverDbDir)) fs.mkdirSync(serverDbDir, { recursive: true });
if (!fs.existsSync(localDbDir)) fs.mkdirSync(localDbDir, { recursive: true });

// Initialize connections
export const serverDb = new Database(config.db.serverPath);
export const localDb = new Database(config.db.localPath);

// Configuration for better performance
serverDb.pragma('journal_mode = WAL');
localDb.pragma('journal_mode = WAL');

console.log(`Connected to Server DB: ${config.db.serverPath}`);
console.log(`Connected to Local DB: ${config.db.localPath}`);

import bcrypt from 'bcrypt';

export const DEFAULT_NAV_ITEMS = [
    { nav_key: 'home', label: 'Home', visible_to_students: 1 },
    { nav_key: 'announcements', label: 'Announcements', visible_to_students: 1 },
    { nav_key: 'syllabus', label: 'Syllabus', visible_to_students: 1 },
    { nav_key: 'modules', label: 'Modules', visible_to_students: 1 },
    { nav_key: 'grades', label: 'Grades', visible_to_students: 1 },
    { nav_key: 'people', label: 'People', visible_to_students: 1 },
    { nav_key: 'assignments', label: 'Assignments', visible_to_students: 1 },
    { nav_key: 'rubrics', label: 'Rubrics', visible_to_students: 1 },
    { nav_key: 'files', label: 'Files', visible_to_students: 0 },
    { nav_key: 'collaborations', label: 'Collaborations', visible_to_students: 0 },
    { nav_key: 'outcomes', label: 'Outcomes', visible_to_students: 0 },
    { nav_key: 'quizzes', label: 'Quizzes', visible_to_students: 1 },
    { nav_key: 'pages', label: 'Pages', visible_to_students: 1 },
    { nav_key: 'discussions', label: 'Discussions', visible_to_students: 1 },
    { nav_key: 'settings', label: 'Settings', visible_to_students: 0 },
];

export function seedDefaultNavItems(courseId) {
    const insert = localDb.prepare(`
        INSERT OR IGNORE INTO course_nav_items (course_id, nav_key, label, position, visible_to_students, is_default)
        VALUES (?, ?, ?, ?, ?, 1)
    `);
    DEFAULT_NAV_ITEMS.forEach((item, index) => {
        insert.run(courseId, item.nav_key, item.label, index, item.visible_to_students);
    });
}

/**
 * Initialize schemas if they don't exist
 * Note: serverDb needs schema.sql for users, categories, etc.
 * localDb needs core tables for custom content + the course system.
 */
export async function initSchemas() {
    const schemaPath = path.join(config.paths.root, 'src/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // 1. Initialize Server DB (if users table missing)
    const serverTables = serverDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!serverTables) {
        console.log("Initializing Server DB with master schema...");
        serverDb.exec(schema);

        // Create initial admin user with hashed password
        const adminEmail = 'admin@mail.com';
        const plainPassword = 'admin';
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        serverDb.prepare('INSERT INTO users (email, full_name, password_hash, role) VALUES (?, ?, ?, ?)')
            .run(adminEmail, 'Administrator', hashedPassword, 'admin');

        console.log(`Created default admin user: ${adminEmail}`);
    }

    // Recreate users table if role constraint is missing 'scholar'
    const usersTableSql = serverDb.prepare("SELECT sql FROM sqlite_master WHERE name='users'").get()?.sql || '';
    if (!usersTableSql.includes("'scholar'")) {
        serverDb.exec(`
            PRAGMA foreign_keys = OFF;
            CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL DEFAULT '',
                phone TEXT,
                school_name TEXT,
                grade_level TEXT,
                preferred_language TEXT,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin','teacher','scholar')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO users_new (id, email, full_name, phone, school_name, grade_level, preferred_language, password_hash, role, created_at)
                SELECT id, email, COALESCE(full_name, ''), phone, school_name, grade_level, preferred_language, password_hash, role, created_at FROM users;
            DROP TABLE users;
            ALTER TABLE users_new RENAME TO users;
            PRAGMA foreign_keys = ON;
        `);
    }

    const usersColumns = serverDb.prepare("PRAGMA table_info(users)").all();
    const hasFullNameColumn = usersColumns.some((column) => column.name === "full_name");
    if (!hasFullNameColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT '';`);
    }
    const hasPhoneColumn = usersColumns.some((column) => column.name === "phone");
    if (!hasPhoneColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN phone TEXT;`);
    }
    const hasSchoolNameColumn = usersColumns.some((column) => column.name === "school_name");
    if (!hasSchoolNameColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN school_name TEXT;`);
    }
    const hasGradeLevelColumn = usersColumns.some((column) => column.name === "grade_level");
    if (!hasGradeLevelColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN grade_level TEXT;`);
    }
    const hasPreferredLanguageColumn = usersColumns.some((column) => column.name === "preferred_language");
    if (!hasPreferredLanguageColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN preferred_language TEXT;`);
    }
    const hasGenderColumn = usersColumns.some((column) => column.name === "gender");
    if (!hasGenderColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'prefer_not_to_say';`);
    }
    const hasRegionProvinceColumn = usersColumns.some((column) => column.name === "region_province");
    if (!hasRegionProvinceColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN region_province TEXT DEFAULT 'Not Specified';`);
    }
    const hasRegionDistrictColumn = usersColumns.some((column) => column.name === "region_district");
    if (!hasRegionDistrictColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN region_district TEXT DEFAULT 'Not Specified';`);
    }
    const hasIsRuralColumn = usersColumns.some((column) => column.name === "is_rural");
    if (!hasIsRuralColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN is_rural INTEGER DEFAULT 0;`);
    }
    const hasDisabilityStatusColumn = usersColumns.some((column) => column.name === "disability_status");
    if (!hasDisabilityStatusColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN disability_status TEXT DEFAULT 'none';`);
    }
    const hasAccessibilityProfileColumn = usersColumns.some((column) => column.name === "accessibility_profile");
    if (!hasAccessibilityProfileColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN accessibility_profile TEXT DEFAULT '{}';`);
    }
    const hasIsActiveColumn = usersColumns.some((column) => column.name === "is_active");
    if (!hasIsActiveColumn) {
        serverDb.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;`);
    }

    // Admin Audit Logs Table
    serverDb.exec(`
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_email TEXT NOT NULL,
            action TEXT NOT NULL,
            target_user_id INTEGER,
            target_user_email TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 2. Initialize Local DB (Custom Content)
    localDb.exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            subtitle TEXT,
            parent_id INTEGER,
            path_key TEXT NOT NULL UNIQUE,
            is_main INTEGER NOT NULL DEFAULT 0,
            is_disabled INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS content_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            subtitle TEXT,
            type TEXT NOT NULL,
            url TEXT NOT NULL,
            path_key TEXT NOT NULL UNIQUE,
            size INTEGER,
            duration INTEGER,
            pages INTEGER,
            is_disabled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );
    `);

    // ===== Course system (replaces the old Class/Lesson system entirely) =====
    localDb.exec(`
        CREATE TABLE IF NOT EXISTS courses (
            id TEXT PRIMARY KEY
                CHECK (length(id) = 6 AND id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            syllabus_body TEXT DEFAULT '',
            grade TEXT DEFAULT '',
            start_date DATETIME,
            end_date DATETIME,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('unpublished', 'active', 'completed')),
            home_page_type TEXT NOT NULL DEFAULT 'modules' CHECK (home_page_type IN ('modules', 'activity', 'page')),
            cover_image TEXT,
            created_by_teacher_email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS course_nav_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            nav_key TEXT NOT NULL CHECK (nav_key IN (
                'home', 'announcements', 'syllabus', 'modules', 'grades', 'people', 'assignments',
                'rubrics', 'files', 'collaborations', 'outcomes', 'quizzes', 'pages', 'discussions', 'settings'
            )),
            label TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            visible_to_students INTEGER NOT NULL DEFAULT 1,
            is_default INTEGER NOT NULL DEFAULT 1,
            UNIQUE (course_id, nav_key),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS enrollments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            user_email TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('teacher', 'ta', 'student', 'observer')),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'inactive', 'concluded')),
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (course_id, user_email),
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS modules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            published INTEGER NOT NULL DEFAULT 0,
            due_at DATETIME,
            created_by_teacher_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS module_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            module_id INTEGER NOT NULL,
            item_type TEXT NOT NULL CHECK (item_type IN ('page', 'assignment', 'quiz', 'file', 'discussion', 'sub_header')),
            item_ref_id INTEGER,
            title TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            indent_level INTEGER NOT NULL DEFAULT 0,
            published INTEGER NOT NULL DEFAULT 1,
            content_ref_table TEXT,
            content_ref_id INTEGER,
            FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS course_pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            body_json TEXT,
            body_html TEXT,
            estimated_read_minutes INTEGER DEFAULT 1,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS page_file_references (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            file_id INTEGER NOT NULL,
            referenced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (page_id) REFERENCES course_pages(id) ON DELETE CASCADE,
            FOREIGN KEY (file_id) REFERENCES course_files(id) ON DELETE CASCADE,
            UNIQUE(page_id, file_id)
        );

        CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id INTEGER NOT NULL,
            user_email TEXT NOT NULL,
            first_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            scroll_pct_reached REAL DEFAULT 0,
            completed_at DATETIME,
            FOREIGN KEY (page_id) REFERENCES course_pages(id) ON DELETE CASCADE,
            UNIQUE(page_id, user_email)
        );

        CREATE TABLE IF NOT EXISTS module_item_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            module_item_id INTEGER NOT NULL,
            user_email TEXT NOT NULL,
            first_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (module_item_id) REFERENCES module_items(id) ON DELETE CASCADE,
            UNIQUE(module_item_id, user_email)
        );

        CREATE TABLE IF NOT EXISTS course_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            folder TEXT NOT NULL DEFAULT '',
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            content_type TEXT DEFAULT '',
            uploaded_by_teacher_email TEXT,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_at DATETIME,
            points_possible REAL DEFAULT 100,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS assignment_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            body TEXT DEFAULT '',
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            grade REAL,
            graded_at DATETIME,
            graded_by_teacher_email TEXT,
            feedback TEXT DEFAULT '',
            UNIQUE (assignment_id, scholar_email),
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_at DATETIME,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quiz_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id INTEGER NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            prompt TEXT NOT NULL,
            question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'open')),
            options TEXT DEFAULT '[]',
            correct_option TEXT,
            points REAL DEFAULT 1,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quiz_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            answers TEXT DEFAULT '{}',
            score REAL,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (quiz_id, scholar_email),
            FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS discussions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            graded INTEGER NOT NULL DEFAULT 0,
            points_possible REAL DEFAULT 0,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS discussion_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discussion_id INTEGER NOT NULL,
            parent_reply_id INTEGER,
            body TEXT NOT NULL,
            author_email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS rubrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            criteria TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS rubric_assignment_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rubric_id INTEGER NOT NULL,
            assignment_id INTEGER NOT NULL,
            UNIQUE (rubric_id, assignment_id),
            FOREIGN KEY (rubric_id) REFERENCES rubrics(id) ON DELETE CASCADE,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            published INTEGER NOT NULL DEFAULT 1,
            created_by_teacher_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS collaborations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT DEFAULT '',
            created_by_teacher_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_course_nav_items_course_id ON course_nav_items(course_id);
        CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);
        CREATE INDEX IF NOT EXISTS idx_enrollments_user_email ON enrollments(user_email);
        CREATE INDEX IF NOT EXISTS idx_modules_course_id ON modules(course_id);
        CREATE INDEX IF NOT EXISTS idx_module_items_module_id ON module_items(module_id);
        CREATE INDEX IF NOT EXISTS idx_course_pages_course_id ON course_pages(course_id);
        CREATE INDEX IF NOT EXISTS idx_course_files_course_id ON course_files(course_id);
        CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
        CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON assignment_submissions(assignment_id);
        CREATE INDEX IF NOT EXISTS idx_assignment_submissions_scholar_email ON assignment_submissions(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON quizzes(course_id);
        CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
        CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz_id ON quiz_submissions(quiz_id);
        CREATE INDEX IF NOT EXISTS idx_quiz_submissions_scholar_email ON quiz_submissions(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_discussions_course_id ON discussions(course_id);
        CREATE INDEX IF NOT EXISTS idx_discussion_replies_discussion_id ON discussion_replies(discussion_id);
        CREATE INDEX IF NOT EXISTS idx_rubrics_course_id ON rubrics(course_id);
        CREATE INDEX IF NOT EXISTS idx_announcements_course_id ON announcements(course_id);
        CREATE INDEX IF NOT EXISTS idx_outcomes_course_id ON outcomes(course_id);
        CREATE INDEX IF NOT EXISTS idx_collaborations_course_id ON collaborations(course_id);
        CREATE INDEX IF NOT EXISTS idx_page_file_references_page ON page_file_references(page_id);
        CREATE INDEX IF NOT EXISTS idx_page_file_references_file ON page_file_references(file_id);
        CREATE INDEX IF NOT EXISTS idx_page_views_page ON page_views(page_id);
        CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(user_email);
    `);

    // ===== Module Items schema migration (for existing DBs) =====
    migrateModuleItemsSchema();
    migrateCoursePagesTipTap();
    migratePageFileReferencesAndViews();

    migrateClassesToCoursesIfNeeded();

    // Ensure root category in local DB
    const rootPath = config.defaults.customContentRoot;
    const rootExists = localDb.prepare(`SELECT 1 FROM categories WHERE path_key = ?`).get(rootPath);

    if (!rootExists) {
        localDb.prepare(`
            INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled)
            VALUES (?, ?, ?, ?, 1, 0)
        `).run("Custom Content", "User-managed content", null, rootPath);

        if (!fs.existsSync(config.paths.customContent)) {
            fs.mkdirSync(config.paths.customContent, { recursive: true });
        }
    }

    // Science of Learning (SoL) & Longitudinal Engine Tables
    localDb.exec(`
        CREATE TABLE IF NOT EXISTS longitudinal_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scholar_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            topic TEXT NOT NULL,
            score REAL NOT NULL,
            total_possible REAL NOT NULL DEFAULT 100,
            difficulty_level TEXT NOT NULL DEFAULT 'medium',
            attempt_number INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS diagnostic_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scholar_email TEXT NOT NULL UNIQUE,
            overall_score REAL NOT NULL,
            subject_breakdown TEXT DEFAULT '{}',
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sol_refresher_completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scholar_email TEXT NOT NULL,
            module_id TEXT NOT NULL,
            score REAL NOT NULL,
            passed INTEGER NOT NULL DEFAULT 1,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (scholar_email, module_id)
        );

        CREATE TABLE IF NOT EXISTS sol_spaced_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scholar_email TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            topic_title TEXT NOT NULL,
            interval_days INTEGER NOT NULL CHECK (interval_days IN (3, 7, 30)),
            due_at DATETIME NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS unit_branding (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            school_name TEXT DEFAULT 'SOMABOX Partner School',
            logo_url TEXT DEFAULT '',
            primary_color TEXT DEFAULT '#203A3A',
            secondary_color TEXT DEFAULT '#0D9488',
            me_sync_url TEXT DEFAULT '',
            last_synced_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'system',
            link TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_longitudinal_progress_scholar ON longitudinal_progress(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_longitudinal_progress_subject ON longitudinal_progress(subject);
        CREATE INDEX IF NOT EXISTS idx_sol_spaced_reviews_scholar ON sol_spaced_reviews(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_user_notifications_email ON user_notifications(user_email);
    `);
}

// ===== Module Items schema migration for existing databases =====
function migrateModuleItemsSchema() {
    try {
        const cols = localDb.prepare("PRAGMA table_info(module_items)").all();
        const colNames = cols.map(c => c.name);

        // Check if we need to add new columns
        const needsIndentLevel = !colNames.includes('indent_level');
        const needsContentRefTable = !colNames.includes('content_ref_table');
        const needsContentRefId = !colNames.includes('content_ref_id');

        // Check if item_type CHECK constraint needs updating (to include sub_header)
        const tableSql = localDb.prepare("SELECT sql FROM sqlite_master WHERE name='module_items'").get()?.sql || '';
        const needsSubHeader = !tableSql.includes("'sub_header'");

        if (!needsIndentLevel && !needsContentRefTable && !needsContentRefId && !needsSubHeader) {
            return; // Already migrated
        }

        console.log("Migrating module_items schema...");

        if (needsSubHeader) {
            // Must rebuild table to change CHECK constraint
            localDb.exec(`
                PRAGMA foreign_keys = OFF;
                CREATE TABLE module_items_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    module_id INTEGER NOT NULL,
                    item_type TEXT NOT NULL CHECK (item_type IN ('page', 'assignment', 'quiz', 'file', 'discussion', 'sub_header')),
                    item_ref_id INTEGER,
                    title TEXT NOT NULL DEFAULT '',
                    position INTEGER NOT NULL DEFAULT 0,
                    indent_level INTEGER NOT NULL DEFAULT 0,
                    published INTEGER NOT NULL DEFAULT 1,
                    content_ref_table TEXT,
                    content_ref_id INTEGER,
                    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
                );
                INSERT INTO module_items_new (id, module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
                    SELECT id, module_id, item_type, item_ref_id, title, position,
                           COALESCE(${colNames.includes('indent_level') ? 'indent_level' : '0'}, 0),
                           published,
                           ${colNames.includes('content_ref_table') ? 'content_ref_table' : 'NULL'},
                           ${colNames.includes('content_ref_id') ? 'content_ref_id' : 'item_ref_id'}
                    FROM module_items;
                DROP TABLE module_items;
                ALTER TABLE module_items_new RENAME TO module_items;
                CREATE INDEX IF NOT EXISTS idx_module_items_module_id ON module_items(module_id);
                PRAGMA foreign_keys = ON;
            `);
        } else {
            // Just add missing columns
            if (needsIndentLevel) {
                localDb.exec("ALTER TABLE module_items ADD COLUMN indent_level INTEGER NOT NULL DEFAULT 0;");
            }
            if (needsContentRefTable) {
                localDb.exec("ALTER TABLE module_items ADD COLUMN content_ref_table TEXT;");
            }
            if (needsContentRefId) {
                localDb.exec("ALTER TABLE module_items ADD COLUMN content_ref_id INTEGER;");
                // Backfill from item_ref_id
                localDb.exec("UPDATE module_items SET content_ref_id = item_ref_id WHERE content_ref_id IS NULL AND item_ref_id IS NOT NULL;");
            }
        }

        // Backfill content_ref_table from item_type for rows that don't have it yet
        const CONTENT_TABLE_MAP = {
            page: 'course_pages',
            assignment: 'assignments',
            quiz: 'quizzes',
            file: 'course_files',
            discussion: 'discussions',
        };
        const updateRefTable = localDb.prepare("UPDATE module_items SET content_ref_table = ? WHERE item_type = ? AND content_ref_table IS NULL");
        for (const [itemType, tableName] of Object.entries(CONTENT_TABLE_MAP)) {
            updateRefTable.run(tableName, itemType);
        }

        // Backfill content_ref_id from item_ref_id where missing
        localDb.exec("UPDATE module_items SET content_ref_id = item_ref_id WHERE content_ref_id IS NULL AND item_ref_id IS NOT NULL;");

        console.log("module_items schema migration complete.");
    } catch (error) {
        console.error("module_items migration failed:", error.message);
    }
}

// ===== Course Pages TipTap migration for existing databases =====
function migrateCoursePagesTipTap() {
    try {
        const cols = localDb.prepare("PRAGMA table_info(course_pages)").all();
        const colNames = cols.map(c => c.name);

        if (!colNames.includes('body_json')) {
            console.log("Adding body_json column to course_pages...");
            localDb.exec("ALTER TABLE course_pages ADD COLUMN body_json TEXT;");
        }
        if (!colNames.includes('body_html')) {
            console.log("Adding body_html column to course_pages...");
            localDb.exec("ALTER TABLE course_pages ADD COLUMN body_html TEXT;");
        }
        if (!colNames.includes('estimated_read_minutes')) {
            console.log("Adding estimated_read_minutes column to course_pages...");
            localDb.exec("ALTER TABLE course_pages ADD COLUMN estimated_read_minutes INTEGER DEFAULT 1;");
        }
    } catch (error) {
        console.error("course_pages TipTap migration failed:", error.message);
    }
}

function migratePageFileReferencesAndViews() {
    try {
        localDb.exec(`
            CREATE TABLE IF NOT EXISTS page_file_references (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_id INTEGER NOT NULL,
                file_id INTEGER NOT NULL,
                referenced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (page_id) REFERENCES course_pages(id) ON DELETE CASCADE,
                FOREIGN KEY (file_id) REFERENCES course_files(id) ON DELETE CASCADE,
                UNIQUE(page_id, file_id)
            );

            CREATE TABLE IF NOT EXISTS page_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_id INTEGER NOT NULL,
                user_email TEXT NOT NULL,
                first_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                scroll_pct_reached REAL DEFAULT 0,
                completed_at DATETIME,
                FOREIGN KEY (page_id) REFERENCES course_pages(id) ON DELETE CASCADE,
                UNIQUE(page_id, user_email)
            );
        `);
    } catch (error) {
        console.error("page_file_references & page_views migration failed:", error.message);
    }
}

// One-time migration: classes/class_lessons/class_lesson_steps/class_memberships -> courses/modules/module_items/enrollments.
// Only runs if legacy `classes` rows exist and haven't been migrated yet (courses table still empty).
function migrateClassesToCoursesIfNeeded() {
    const hasLegacyClassesTable = localDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classes'")
        .get();
    if (!hasLegacyClassesTable) return;

    const legacyClassCount = Number(localDb.prepare("SELECT COUNT(*) AS total FROM classes").get()?.total || 0);
    if (legacyClassCount === 0) {
        dropLegacyClassTables();
        return;
    }

    const courseCount = Number(localDb.prepare("SELECT COUNT(*) AS total FROM courses").get()?.total || 0);
    if (courseCount > 0) {
        // Already migrated in a previous run.
        dropLegacyClassTables();
        return;
    }

    console.log(`Migrating ${legacyClassCount} legacy class(es) into the course system...`);

    try {
        const insertCourse = localDb.prepare(`
            INSERT INTO courses (id, title, description, grade, status, cover_image, created_by_teacher_email, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
        `);
        const insertEnrollment = localDb.prepare(`
            INSERT OR IGNORE INTO enrollments (course_id, user_email, role, status, joined_at)
            VALUES (?, ?, ?, 'active', ?)
        `);
        const insertModule = localDb.prepare(`
            INSERT INTO modules (course_id, title, description, position, published, due_at, created_by_teacher_email, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertModuleItem = localDb.prepare(`
            INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, published)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertPage = localDb.prepare(`
            INSERT INTO course_pages (course_id, title, body, published, created_by_teacher_email, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?)
        `);
        const insertFile = localDb.prepare(`
            INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const insertQuiz = localDb.prepare(`
            INSERT INTO quizzes (course_id, title, description, published, created_by_teacher_email, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?)
        `);
        const insertQuizQuestion = localDb.prepare(`
            INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, points)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        const classes = localDb.prepare("SELECT * FROM classes").all();

        const legacyCoversDir = path.join(config.paths.root, "local-content/class-covers");
        if (fs.existsSync(legacyCoversDir)) {
            fs.mkdirSync(config.paths.courseCovers, { recursive: true });
            for (const classRow of classes) {
                if (!classRow.cover_image) continue;
                const src = path.join(legacyCoversDir, classRow.cover_image);
                const dest = path.join(config.paths.courseCovers, classRow.cover_image);
                if (fs.existsSync(src)) {
                    try { fs.copyFileSync(src, dest); } catch { /* non-fatal */ }
                }
            }
        }

        for (const classRow of classes) {
            insertCourse.run(
                classRow.id,
                classRow.name,
                classRow.notes || "",
                classRow.grade || "",
                classRow.cover_image || null,
                classRow.teacher_email,
                classRow.created_at || new Date().toISOString(),
                classRow.updated_at || new Date().toISOString()
            );
            seedDefaultNavItems(classRow.id);
            insertEnrollment.run(classRow.id, classRow.teacher_email, "teacher", classRow.created_at || new Date().toISOString());

            const members = localDb.prepare("SELECT * FROM class_memberships WHERE class_id = ?").all(classRow.id);
            for (const member of members) {
                insertEnrollment.run(classRow.id, member.scholar_email, "student", member.joined_at || new Date().toISOString());
            }

            const lessons = localDb.prepare("SELECT * FROM class_lessons WHERE class_id = ? ORDER BY created_at ASC").all(classRow.id);
            lessons.forEach((lesson, lessonIndex) => {
                const moduleInsert = insertModule.run(
                    classRow.id,
                    lesson.title,
                    lesson.description || "",
                    lessonIndex,
                    Number(lesson.is_visible_to_students || 0),
                    lesson.due_at || null,
                    lesson.created_by_teacher_email,
                    lesson.created_at || new Date().toISOString(),
                    lesson.updated_at || new Date().toISOString()
                );
                const moduleId = Number(moduleInsert.lastInsertRowid);

                const steps = localDb.prepare("SELECT * FROM class_lesson_steps WHERE lesson_id = ? ORDER BY step_order ASC").all(lesson.id);
                steps.forEach((step, stepIndex) => {
                    let metadata = {};
                    try { metadata = JSON.parse(step.metadata || "{}"); } catch { metadata = {}; }
                    const contentType = metadata.contentType || (step.step_type === "question" ? "question" : "text");
                    const stepTitle = step.title || lesson.title;

                    if (contentType === "question" || step.step_type === "question") {
                        const quizInsert = insertQuiz.run(
                            classRow.id,
                            stepTitle,
                            "",
                            lesson.created_by_teacher_email,
                            lesson.created_at || new Date().toISOString(),
                            lesson.updated_at || new Date().toISOString()
                        );
                        const quizId = Number(quizInsert.lastInsertRowid);
                        const questions = Array.isArray(metadata.questions) ? metadata.questions : [];
                        questions.forEach((question, qIndex) => {
                            insertQuizQuestion.run(
                                quizId,
                                qIndex,
                                String(question?.prompt || "").trim() || "Untitled question",
                                question?.questionType === "multiple_choice" ? "multiple_choice" : "open",
                                JSON.stringify(Array.isArray(question?.options) ? question.options : []),
                                Number(question?.totalPoints) || 1
                            );
                        });
                        insertModuleItem.run(moduleId, "quiz", quizId, stepTitle, stepIndex, 1);
                    } else if (contentType === "file" || contentType === "video") {
                        const relativePath = String(step.body || "");
                        const originalName = relativePath.split("/").pop() || relativePath;
                        const fileInsert = insertFile.run(
                            classRow.id,
                            "",
                            relativePath,
                            originalName,
                            contentType,
                            lesson.created_by_teacher_email,
                            lesson.created_at || new Date().toISOString()
                        );
                        insertModuleItem.run(moduleId, "file", Number(fileInsert.lastInsertRowid), stepTitle, stepIndex, 1);
                    } else {
                        const pageInsert = insertPage.run(
                            classRow.id,
                            stepTitle,
                            step.body || "",
                            lesson.created_by_teacher_email,
                            lesson.created_at || new Date().toISOString(),
                            lesson.updated_at || new Date().toISOString()
                        );
                        insertModuleItem.run(moduleId, "page", Number(pageInsert.lastInsertRowid), stepTitle, stepIndex, 1);
                    }
                });
            });
        }

        console.log("Class -> Course migration complete.");
        dropLegacyClassTables();
    } catch (error) {
        console.error("Class -> Course migration failed — legacy tables preserved for retry:", error);
    }
}

function dropLegacyClassTables() {
    const legacyTables = [
        "class_lesson_question_responses",
        "class_lesson_progress",
        "class_lesson_steps",
        "class_lesson_targets",
        "class_lessons",
        "class_memberships",
        "lesson_feedback_comments",
        "lesson_grades",
        "lesson_submissions",
        "lesson_progress",
        "lesson_assignment_targets",
        "lesson_assignments",
        "classes",
    ];
    for (const table of legacyTables) {
        try {
            localDb.exec(`DROP TABLE IF EXISTS ${table};`);
        } catch (error) {
            console.error(`Failed to drop legacy table ${table}:`, error.message);
        }
    }
}
