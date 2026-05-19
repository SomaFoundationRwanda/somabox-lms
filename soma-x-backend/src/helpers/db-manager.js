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

/**
 * Initialize schemas if they don't exist
 * Note: serverDb needs schema.sql for users, categories, etc.
 * localDb needs core tables for custom content.
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

    // Migrate classes table
    const classesColumns = localDb.prepare("PRAGMA table_info(classes)").all();
    const hasCoverImageColumn = classesColumns.some((col) => col.name === "cover_image");
    if (!hasCoverImageColumn && classesColumns.length > 0) {
        localDb.exec(`ALTER TABLE classes ADD COLUMN cover_image TEXT;`);
    }

    // 2. Initialize Local DB (Custom Content + Classes)
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

        CREATE TABLE IF NOT EXISTS classes (
            id TEXT PRIMARY KEY
                CHECK (length(id) = 6 AND id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
            name TEXT NOT NULL,
            grade TEXT NOT NULL,
            students INTEGER NOT NULL DEFAULT 0,
            schedule TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            teacher_email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS class_memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id TEXT NOT NULL,
            scholar_email TEXT NOT NULL,
            joined_via TEXT NOT NULL DEFAULT 'code',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (class_id, scholar_email),
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lesson_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id TEXT NOT NULL,
            content_path_key TEXT NOT NULL,
            assigned_by_teacher_email TEXT NOT NULL,
            target_type TEXT NOT NULL CHECK (target_type IN ('class', 'scholars')),
            due_at DATETIME,
            assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lesson_assignment_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (assignment_id, scholar_email),
            FOREIGN KEY (assignment_id) REFERENCES lesson_assignments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lesson_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed')),
            last_position INTEGER,
            score REAL,
            started_at DATETIME,
            completed_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (assignment_id, scholar_email),
            FOREIGN KEY (assignment_id) REFERENCES lesson_assignments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS class_lessons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_at DATETIME,
            content_folder TEXT UNIQUE,
            is_visible_to_students INTEGER NOT NULL DEFAULT 1,
            target_type TEXT NOT NULL DEFAULT 'class' CHECK (target_type IN ('class', 'scholars')),
            created_by_teacher_email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS class_lesson_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (lesson_id, scholar_email),
            FOREIGN KEY (lesson_id) REFERENCES class_lessons(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS class_lesson_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_id INTEGER NOT NULL,
            step_order INTEGER NOT NULL,
            step_type TEXT NOT NULL CHECK (step_type IN ('question', 'content')),
            title TEXT DEFAULT '',
            body TEXT DEFAULT '',
            metadata TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lesson_id) REFERENCES class_lessons(id) ON DELETE CASCADE,
            UNIQUE (lesson_id, step_order)
        );

        CREATE TABLE IF NOT EXISTS class_lesson_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
            current_step INTEGER NOT NULL DEFAULT 1,
            started_at DATETIME,
            completed_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (lesson_id, scholar_email),
            FOREIGN KEY (lesson_id) REFERENCES class_lessons(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS class_lesson_question_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_id INTEGER NOT NULL,
            step_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            question_index INTEGER NOT NULL,
            response_text TEXT DEFAULT '',
            selected_option TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (lesson_id, step_id, scholar_email, question_index),
            FOREIGN KEY (lesson_id) REFERENCES class_lessons(id) ON DELETE CASCADE,
            FOREIGN KEY (step_id) REFERENCES class_lesson_steps(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_class_memberships_scholar_email ON class_memberships(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_class_memberships_class_id ON class_memberships(class_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_assignments_class_id ON lesson_assignments(class_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_assignment_targets_assignment_id ON lesson_assignment_targets(assignment_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_assignment_targets_scholar_email ON lesson_assignment_targets(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_lesson_progress_assignment_id ON lesson_progress(assignment_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_progress_scholar_email ON lesson_progress(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_class_lessons_class_id ON class_lessons(class_id);
        CREATE INDEX IF NOT EXISTS idx_class_lessons_teacher_email ON class_lessons(created_by_teacher_email);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_targets_lesson_id ON class_lesson_targets(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_targets_scholar_email ON class_lesson_targets(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_steps_lesson_id ON class_lesson_steps(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_progress_lesson_id ON class_lesson_progress(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_progress_scholar_email ON class_lesson_progress(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_question_responses_lesson_id ON class_lesson_question_responses(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_question_responses_step_id ON class_lesson_question_responses(step_id);
        CREATE INDEX IF NOT EXISTS idx_class_lesson_question_responses_scholar_email ON class_lesson_question_responses(scholar_email);
    `);

    const classLessonsColumns = localDb.prepare("PRAGMA table_info(class_lessons)").all();
    const hasContentFolderColumn = classLessonsColumns.some((column) => column.name === "content_folder");
    if (!hasContentFolderColumn) {
        localDb.exec(`ALTER TABLE class_lessons ADD COLUMN content_folder TEXT;`);
    }
    const hasVisibilityColumn = classLessonsColumns.some((column) => column.name === "is_visible_to_students");
    if (!hasVisibilityColumn) {
        localDb.exec(`ALTER TABLE class_lessons ADD COLUMN is_visible_to_students INTEGER NOT NULL DEFAULT 1;`);
    }
    const hasDueAtColumn = classLessonsColumns.some((column) => column.name === "due_at");
    if (!hasDueAtColumn) {
        localDb.exec(`ALTER TABLE class_lessons ADD COLUMN due_at DATETIME;`);
    }
    const hasTargetTypeColumn = classLessonsColumns.some((column) => column.name === "target_type");
    if (!hasTargetTypeColumn) {
        localDb.exec(`ALTER TABLE class_lessons ADD COLUMN target_type TEXT NOT NULL DEFAULT 'class';`);
    }

    const classLessonStepsColumns = localDb.prepare("PRAGMA table_info(class_lesson_steps)").all();
    const hasMetadataColumn = classLessonStepsColumns.some((column) => column.name === "metadata");
    if (!hasMetadataColumn) {
        localDb.exec(`ALTER TABLE class_lesson_steps ADD COLUMN metadata TEXT DEFAULT '{}';`);
    }

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

    // Migrate old classes schema (INTEGER id) -> new 6-digit TEXT id
    const classTableInfo = localDb.prepare("PRAGMA table_info(classes)").all();
    const classIdColumn = classTableInfo.find((c) => c.name === "id");
    const needsClassIdMigration =
        classIdColumn && String(classIdColumn.type || "").toUpperCase() !== "TEXT";

    if (needsClassIdMigration) {
        console.log("Migrating classes table to 6-digit text IDs...");

        const oldRows = localDb.prepare(`
            SELECT id, name, grade, students, schedule, notes, teacher_email, created_at, updated_at
            FROM classes
        `).all();

        localDb.exec(`
            ALTER TABLE classes RENAME TO classes_legacy;
            CREATE TABLE classes (
                id TEXT PRIMARY KEY
                    CHECK (length(id) = 6 AND id GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'),
                name TEXT NOT NULL,
                grade TEXT NOT NULL,
                students INTEGER NOT NULL DEFAULT 0,
                schedule TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                teacher_email TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const usedCodes = new Set();
        const insertMigrated = localDb.prepare(`
            INSERT INTO classes (id, name, grade, students, schedule, notes, teacher_email, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const generateCode = () => {
            let attempts = 0;
            while (attempts < 2000) {
                const code = String(Math.floor(100000 + Math.random() * 900000));
                if (!usedCodes.has(code)) {
                    usedCodes.add(code);
                    return code;
                }
                attempts += 1;
            }
            throw new Error("Failed to generate unique 6-digit class code during migration");
        };

        for (const row of oldRows) {
            const newId = generateCode();
            insertMigrated.run(
                newId,
                row.name,
                row.grade,
                Number(row.students || 0),
                row.schedule || "",
                row.notes || "",
                row.teacher_email,
                row.created_at || new Date().toISOString(),
                row.updated_at || new Date().toISOString()
            );
        }

        localDb.exec(`DROP TABLE classes_legacy;`);
        console.log("Classes migration complete.");
    }

    // Initialize Grading Tables
    localDb.exec(`
        CREATE TABLE IF NOT EXISTS lesson_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_locked INTEGER NOT NULL DEFAULT 1,
            UNIQUE (lesson_id, scholar_email),
            FOREIGN KEY (lesson_id) REFERENCES class_lessons(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lesson_grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL UNIQUE,
            grade REAL,
            total_points REAL DEFAULT 100,
            graded_by_teacher_email TEXT NOT NULL,
            graded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES lesson_submissions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lesson_feedback_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL,
            teacher_email TEXT NOT NULL,
            comment_text TEXT NOT NULL,
            awarded_points REAL,
            possible_points REAL,
            question_index INTEGER,
            step_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES lesson_submissions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_lesson_submissions_lesson_id ON lesson_submissions(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_submissions_scholar_email ON lesson_submissions(scholar_email);
        CREATE INDEX IF NOT EXISTS idx_lesson_submissions_locked ON lesson_submissions(is_locked);
        CREATE INDEX IF NOT EXISTS idx_lesson_grades_submission_id ON lesson_grades(submission_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_grades_teacher_email ON lesson_grades(graded_by_teacher_email);
        CREATE INDEX IF NOT EXISTS idx_lesson_feedback_comments_submission_id ON lesson_feedback_comments(submission_id);
        CREATE INDEX IF NOT EXISTS idx_lesson_feedback_comments_teacher_email ON lesson_feedback_comments(teacher_email);
    `);

    // Add submission tracking columns to lesson_progress if they don't exist
    const progressTableInfo = localDb.prepare("PRAGMA table_info(class_lesson_progress)").all();
    const hasSubmittedAtColumn = progressTableInfo.some((column) => column.name === "submitted_at");
    if (!hasSubmittedAtColumn) {
        localDb.exec(`ALTER TABLE class_lesson_progress ADD COLUMN submitted_at DATETIME;`);
    }

    const responseTableInfo = localDb.prepare("PRAGMA table_info(class_lesson_question_responses)").all();
    const hasResponseUpdatedAtColumn = responseTableInfo.some((column) => column.name === "updated_at");
    if (!hasResponseUpdatedAtColumn) {
        localDb.exec(`ALTER TABLE class_lesson_question_responses ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
    }

    const feedbackTableInfo = localDb.prepare("PRAGMA table_info(lesson_feedback_comments)").all();
    const hasAwardedPointsColumn = feedbackTableInfo.some((column) => column.name === "awarded_points");
    if (!hasAwardedPointsColumn) {
        localDb.exec(`ALTER TABLE lesson_feedback_comments ADD COLUMN awarded_points REAL;`);
    }
    const hasPossiblePointsColumn = feedbackTableInfo.some((column) => column.name === "possible_points");
    if (!hasPossiblePointsColumn) {
        localDb.exec(`ALTER TABLE lesson_feedback_comments ADD COLUMN possible_points REAL;`);
    }
}
