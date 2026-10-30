// The schema as it stood before versioned migrations (formerly the body of initSchemas()).
// It is idempotent (IF NOT EXISTS everywhere), so existing databases can apply it safely.
// Running it once, instead of on every startup, means tables and columns later migrations
// drop or replace are not re-created on restart. Never edit this file; add a migration.
export async function up(client) {
    await client.query(`
        -- Users table
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL DEFAULT '',
            phone TEXT,
            school_name TEXT,
            grade_level TEXT,
            preferred_language TEXT,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','teacher','scholar')),
            gender TEXT DEFAULT 'prefer_not_to_say',
            region_province TEXT DEFAULT 'Not Specified',
            region_district TEXT DEFAULT 'Not Specified',
            is_rural INTEGER DEFAULT 0,
            disability_status TEXT DEFAULT 'none',
            accessibility_profile TEXT DEFAULT '{}',
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Admin Audit Logs
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id SERIAL PRIMARY KEY,
            admin_email TEXT NOT NULL,
            action TEXT NOT NULL,
            target_user_id INTEGER,
            target_user_email TEXT,
            details TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Categories
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            subtitle TEXT,
            parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            path_key TEXT NOT NULL UNIQUE,
            is_main INTEGER NOT NULL DEFAULT 0,
            is_disabled INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Content Items
        CREATE TABLE IF NOT EXISTS content_items (
            id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            subtitle TEXT,
            type TEXT NOT NULL,
            url TEXT NOT NULL,
            path_key TEXT NOT NULL UNIQUE,
            size BIGINT,
            duration INTEGER,
            pages INTEGER,
            is_disabled INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Book Categories & Books
        CREATE TABLE IF NOT EXISTS book_categories (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS books (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            category_ids TEXT NOT NULL,
            cover_url TEXT,
            "coverUrl" TEXT
        );

        -- Sync Log
        CREATE TABLE IF NOT EXISTS sync_log (
            id SERIAL PRIMARY KEY,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP WITH TIME ZONE,
            status TEXT,
            details TEXT
        );

        -- Courses
        CREATE TABLE IF NOT EXISTS courses (
            id VARCHAR(10) PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            syllabus_body TEXT DEFAULT '',
            grade TEXT DEFAULT '',
            start_date TIMESTAMP WITH TIME ZONE,
            end_date TIMESTAMP WITH TIME ZONE,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('unpublished', 'active', 'completed')),
            home_page_type TEXT NOT NULL DEFAULT 'modules' CHECK (home_page_type IN ('modules', 'activity', 'page')),
            cover_image TEXT,
            created_by_teacher_email TEXT NOT NULL,
            visibility TEXT DEFAULT 'private',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Course Navigation Items
        CREATE TABLE IF NOT EXISTS course_nav_items (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            nav_key TEXT NOT NULL CHECK (nav_key IN (
                'home', 'announcements', 'syllabus', 'modules', 'grades', 'people', 'assignments',
                'rubrics', 'files', 'collaborations', 'outcomes', 'quizzes', 'pages', 'discussions', 'settings'
            )),
            label TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            visible_to_students INTEGER NOT NULL DEFAULT 1,
            is_default INTEGER NOT NULL DEFAULT 1,
            UNIQUE (course_id, nav_key)
        );

        -- Enrollments
        CREATE TABLE IF NOT EXISTS enrollments (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            user_email TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('teacher', 'ta', 'student', 'observer')),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'inactive', 'concluded')),
            joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (course_id, user_email)
        );

        -- Modules
        CREATE TABLE IF NOT EXISTS modules (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            published INTEGER NOT NULL DEFAULT 0,
            due_at TIMESTAMP WITH TIME ZONE,
            created_by_teacher_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Module Items
        CREATE TABLE IF NOT EXISTS module_items (
            id SERIAL PRIMARY KEY,
            module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
            item_type TEXT NOT NULL CHECK (item_type IN ('page', 'assignment', 'quiz', 'file', 'discussion', 'sub_header')),
            item_ref_id INTEGER,
            title TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            indent_level INTEGER NOT NULL DEFAULT 0,
            published INTEGER NOT NULL DEFAULT 1,
            content_ref_table TEXT,
            content_ref_id INTEGER
        );

        -- Course Pages
        CREATE TABLE IF NOT EXISTS course_pages (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            body_json TEXT,
            body_html TEXT,
            estimated_read_minutes INTEGER DEFAULT 1,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Course Files
        CREATE TABLE IF NOT EXISTS course_files (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            folder TEXT NOT NULL DEFAULT '',
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            content_type TEXT DEFAULT '',
            uploaded_by_teacher_email TEXT,
            uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Page File References
        CREATE TABLE IF NOT EXISTS page_file_references (
            id SERIAL PRIMARY KEY,
            page_id INTEGER NOT NULL REFERENCES course_pages(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES course_files(id) ON DELETE CASCADE,
            referenced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(page_id, file_id)
        );

        -- Page Views
        CREATE TABLE IF NOT EXISTS page_views (
            id SERIAL PRIMARY KEY,
            page_id INTEGER NOT NULL REFERENCES course_pages(id) ON DELETE CASCADE,
            user_email TEXT NOT NULL,
            first_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            scroll_pct_reached NUMERIC DEFAULT 0,
            completed_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(page_id, user_email)
        );

        -- Module Item Progress
        CREATE TABLE IF NOT EXISTS module_item_progress (
            id SERIAL PRIMARY KEY,
            module_item_id INTEGER NOT NULL REFERENCES module_items(id) ON DELETE CASCADE,
            user_email TEXT NOT NULL,
            first_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            last_viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP WITH TIME ZONE,
            UNIQUE(module_item_id, user_email)
        );

        -- Assignments
        CREATE TABLE IF NOT EXISTS assignments (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_at TIMESTAMP WITH TIME ZONE,
            points_possible NUMERIC DEFAULT 100,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Assignment Submissions
        CREATE TABLE IF NOT EXISTS assignment_submissions (
            id SERIAL PRIMARY KEY,
            assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
            scholar_email TEXT NOT NULL,
            body TEXT DEFAULT '',
            submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            grade NUMERIC,
            graded_at TIMESTAMP WITH TIME ZONE,
            graded_by_teacher_email TEXT,
            feedback TEXT DEFAULT '',
            UNIQUE (assignment_id, scholar_email)
        );

        -- Quizzes
        CREATE TABLE IF NOT EXISTS quizzes (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            due_at TIMESTAMP WITH TIME ZONE,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Quiz Questions
        CREATE TABLE IF NOT EXISTS quiz_questions (
            id SERIAL PRIMARY KEY,
            quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            prompt TEXT NOT NULL,
            question_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'open')),
            options TEXT DEFAULT '[]',
            correct_option TEXT,
            points NUMERIC DEFAULT 1
        );

        -- Quiz Submissions
        CREATE TABLE IF NOT EXISTS quiz_submissions (
            id SERIAL PRIMARY KEY,
            quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            scholar_email TEXT NOT NULL,
            answers TEXT DEFAULT '{}',
            score NUMERIC,
            submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (quiz_id, scholar_email)
        );

        -- Discussions
        CREATE TABLE IF NOT EXISTS discussions (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            graded INTEGER NOT NULL DEFAULT 0,
            points_possible NUMERIC DEFAULT 0,
            published INTEGER NOT NULL DEFAULT 0,
            created_by_teacher_email TEXT,
            linked_assignment_id INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Discussion Replies
        CREATE TABLE IF NOT EXISTS discussion_replies (
            id SERIAL PRIMARY KEY,
            discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
            parent_reply_id INTEGER REFERENCES discussion_replies(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            author_email TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Rubrics
        CREATE TABLE IF NOT EXISTS rubrics (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            criteria TEXT DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Rubric Assignment Links
        CREATE TABLE IF NOT EXISTS rubric_assignment_links (
            id SERIAL PRIMARY KEY,
            rubric_id INTEGER NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
            assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
            UNIQUE (rubric_id, assignment_id)
        );

        -- Announcements
        CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT DEFAULT '',
            published INTEGER NOT NULL DEFAULT 1,
            created_by_teacher_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Outcomes
        CREATE TABLE IF NOT EXISTS outcomes (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Collaborations
        CREATE TABLE IF NOT EXISTS collaborations (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            url TEXT DEFAULT '',
            created_by_teacher_email TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Collaboration Members
        CREATE TABLE IF NOT EXISTS collaboration_members (
            id SERIAL PRIMARY KEY,
            collaboration_id INTEGER NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
            user_email TEXT NOT NULL,
            added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (collaboration_id, user_email)
        );

        -- Longitudinal Progress
        CREATE TABLE IF NOT EXISTS longitudinal_progress (
            id SERIAL PRIMARY KEY,
            scholar_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            topic TEXT NOT NULL,
            score NUMERIC NOT NULL,
            total_possible NUMERIC NOT NULL DEFAULT 100,
            difficulty_level TEXT NOT NULL DEFAULT 'medium',
            attempt_number INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Diagnostic Results
        CREATE TABLE IF NOT EXISTS diagnostic_results (
            id SERIAL PRIMARY KEY,
            scholar_email TEXT NOT NULL UNIQUE,
            overall_score NUMERIC NOT NULL,
            subject_breakdown TEXT DEFAULT '{}',
            completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- SoL Refresher Completions
        CREATE TABLE IF NOT EXISTS sol_refresher_completions (
            id SERIAL PRIMARY KEY,
            scholar_email TEXT NOT NULL,
            module_id TEXT NOT NULL,
            score NUMERIC NOT NULL,
            passed INTEGER NOT NULL DEFAULT 1,
            completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (scholar_email, module_id)
        );

        -- SoL Spaced Reviews
        CREATE TABLE IF NOT EXISTS sol_spaced_reviews (
            id SERIAL PRIMARY KEY,
            scholar_email TEXT NOT NULL,
            topic_id TEXT NOT NULL,
            topic_title TEXT NOT NULL,
            interval_days INTEGER NOT NULL CHECK (interval_days IN (3, 7, 30)),
            due_at TIMESTAMP WITH TIME ZONE NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
            completed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- Unit Branding
        CREATE TABLE IF NOT EXISTS unit_branding (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            school_name TEXT DEFAULT 'SOMABOX Partner School',
            logo_url TEXT DEFAULT '',
            primary_color TEXT DEFAULT '#203A3A',
            secondary_color TEXT DEFAULT '#0D9488',
            me_sync_url TEXT DEFAULT '',
            last_synced_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- User Notifications
        CREATE TABLE IF NOT EXISTS user_notifications (
            id SERIAL PRIMARY KEY,
            user_email TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'system',
            link TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        -- High-Concurrency Performance Indexes
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(LOWER(role));
        CREATE INDEX IF NOT EXISTS idx_course_nav_items_course_id ON course_nav_items(course_id);
        CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);
        CREATE INDEX IF NOT EXISTS idx_enrollments_user_email ON enrollments(LOWER(user_email));
        CREATE INDEX IF NOT EXISTS idx_modules_course_id ON modules(course_id);
        CREATE INDEX IF NOT EXISTS idx_module_items_module_id ON module_items(module_id);
        CREATE INDEX IF NOT EXISTS idx_course_pages_course_id ON course_pages(course_id);
        CREATE INDEX IF NOT EXISTS idx_course_files_course_id ON course_files(course_id);
        CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
        CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON assignment_submissions(assignment_id);
        CREATE INDEX IF NOT EXISTS idx_assignment_submissions_scholar_email ON assignment_submissions(LOWER(scholar_email));
        CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON quizzes(course_id);
        CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
        CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz_id ON quiz_submissions(quiz_id);
        CREATE INDEX IF NOT EXISTS idx_quiz_submissions_scholar_email ON quiz_submissions(LOWER(scholar_email));
        CREATE INDEX IF NOT EXISTS idx_discussions_course_id ON discussions(course_id);
        CREATE INDEX IF NOT EXISTS idx_discussion_replies_discussion_id ON discussion_replies(discussion_id);
        CREATE INDEX IF NOT EXISTS idx_rubrics_course_id ON rubrics(course_id);
        CREATE INDEX IF NOT EXISTS idx_announcements_course_id ON announcements(course_id);
        CREATE INDEX IF NOT EXISTS idx_outcomes_course_id ON outcomes(course_id);
        CREATE INDEX IF NOT EXISTS idx_collaborations_course_id ON collaborations(course_id);
        CREATE INDEX IF NOT EXISTS idx_collaboration_members_collaboration_id ON collaboration_members(collaboration_id);
        CREATE INDEX IF NOT EXISTS idx_page_file_references_page ON page_file_references(page_id);
        CREATE INDEX IF NOT EXISTS idx_page_file_references_file ON page_file_references(file_id);
        CREATE INDEX IF NOT EXISTS idx_page_views_page ON page_views(page_id);
        CREATE INDEX IF NOT EXISTS idx_page_views_user ON page_views(LOWER(user_email));
        CREATE INDEX IF NOT EXISTS idx_longitudinal_progress_scholar ON longitudinal_progress(LOWER(scholar_email));
        CREATE INDEX IF NOT EXISTS idx_longitudinal_progress_subject ON longitudinal_progress(subject);
        CREATE INDEX IF NOT EXISTS idx_sol_spaced_reviews_scholar ON sol_spaced_reviews(LOWER(scholar_email));
        CREATE INDEX IF NOT EXISTS idx_user_notifications_email ON user_notifications(LOWER(user_email));

        -- Item Outcomes Junction Table
        CREATE TABLE IF NOT EXISTS item_outcomes (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            item_type TEXT NOT NULL CHECK (item_type IN ('assignment', 'quiz', 'page', 'discussion')),
            item_id INTEGER NOT NULL,
            outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
            UNIQUE (item_type, item_id, outcome_id)
        );

        -- Student Outcome Baseline Assessments Table
        CREATE TABLE IF NOT EXISTS student_outcome_baselines (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            scholar_email TEXT NOT NULL,
            outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
            baseline_score NUMERIC NOT NULL DEFAULT 0,
            assessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (course_id, scholar_email, outcome_id)
        );

        -- Auto-migrations for course timing & outcome properties
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS length_weeks INTEGER DEFAULT 4;
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS grading_scale TEXT DEFAULT '{"A":90,"B":80,"C":70,"D":60,"F":0}';
        ALTER TABLE courses ADD COLUMN IF NOT EXISTS setup_step INTEGER DEFAULT 1;

        ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS code TEXT DEFAULT 'OUT-1';
        ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS mastery_levels TEXT DEFAULT '[{"level":"Exceeds Mastery","points":4},{"level":"Meets Mastery","points":3},{"level":"Approaching Mastery","points":2},{"level":"Below Mastery","points":1}]';

        ALTER TABLE modules ADD COLUMN IF NOT EXISTS week_offset INTEGER DEFAULT 0;
        ALTER TABLE modules ADD COLUMN IF NOT EXISTS day_offset INTEGER DEFAULT 0;

        ALTER TABLE module_items ADD COLUMN IF NOT EXISTS release_day INTEGER DEFAULT 0;
        ALTER TABLE module_items ADD COLUMN IF NOT EXISTS due_day INTEGER DEFAULT 7;
        ALTER TABLE module_items ADD COLUMN IF NOT EXISTS close_day INTEGER DEFAULT 7;
    `);
}
