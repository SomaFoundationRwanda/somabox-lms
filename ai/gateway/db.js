import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'feedback.db');
const db = new Database(dbPath);

// Initialize Feedback schema
db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        response_id TEXT NOT NULL,
        teacher_hash TEXT NOT NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        mode TEXT NOT NULL,
        model_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

export function insertFeedback({ responseId, teacherHash, rating, comment, mode, modelName }) {
    const stmt = db.prepare(`
        INSERT INTO feedback (response_id, teacher_hash, rating, comment, mode, model_name)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(responseId, teacherHash, rating, comment || '', mode, modelName);
}

export function getAllFeedback() {
    const stmt = db.prepare(`SELECT * FROM feedback ORDER BY created_at DESC`);
    return stmt.all();
}

export default db;
