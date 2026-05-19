-- Categories = folders
CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
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

-- Content = actual files
CREATE TABLE content_items (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    type TEXT NOT NULL, -- video, document, etc.
    url TEXT NOT NULL,
    path_key TEXT NOT NULL UNIQUE, -- relative file path, ensures uniqueness
    size INTEGER,
    duration INTEGER,
    pages INTEGER,
    is_disabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);


-- User accounts: admins vs teachers
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    school_name TEXT,
    grade_level TEXT,
    preferred_language TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','teacher','scholar')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sync log: track manual sync attempts
CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    status TEXT, -- e.g. 'success','failed','partial'
    details TEXT -- optional JSON for errors
);


-- End of schema

CREATE TABLE book_categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category_ids TEXT NOT NULL, -- Comma-separated list of category IDs
    coverUrl TEXT
);