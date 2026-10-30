#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="$AI_DIR/data/feedback.db"
OUTPUT_CSV="${1:-$AI_DIR/data/feedback_export_$(date +%Y%m%d_%H%M%S).csv}"

if [ ! -f "$DB_PATH" ]; then
    echo "Error: Feedback database not found at $DB_PATH"
    exit 1
fi

echo "=== Exporting AI Feedback to CSV ==="
echo "Database: $DB_PATH"
echo "Output: $OUTPUT_CSV"

node -e "
const Database = require('$AI_DIR/gateway/node_modules/better-sqlite3');
const fs = require('fs');

const db = new Database('$DB_PATH');
const rows = db.prepare('SELECT id, response_id, teacher_hash, rating, comment, mode, model_name, created_at FROM feedback ORDER BY created_at DESC').all();

const headers = ['id', 'response_id', 'teacher_hash', 'rating', 'comment', 'mode', 'model_name', 'created_at'];
const csvLines = [headers.join(',')];

for (const row of rows) {
    const values = headers.map(h => {
        const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
        return '\"' + val.replace(/\"/g, '\"\"') + '\"';
    });
    csvLines.push(values.join(','));
}

fs.writeFileSync('$OUTPUT_CSV', csvLines.join('\n'));
console.log('Exported ' + rows.length + ' feedback entries to $OUTPUT_CSV');
"

echo "=== Export Complete ==="
