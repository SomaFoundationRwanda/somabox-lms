import path from 'path';
import { fileURLToPath } from 'url';
import somabox from '@somabox/config';

// Loads the repository's single .env (see .env.example) and stops with a clear message if a
// setting is wrong. The rest of the backend reads the checked values from process.env.
const settings = somabox.readConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '../../');

export const config = {
    // PORT is an explicit override (the e2e server, pm2); otherwise BACKEND_PORT from the .env.
    port: Number(process.env.PORT) || settings.ports.BACKEND_PORT,
    cloudUrl: process.env.CLOUD_URL || 'http://localhost:2999',
    // The box's key on the soma-x-server (VPS). The same key is used for sync (SYNC_TOKEN), so
    // one key per box is enough; CLOUD_TOKEN only needs setting if they differ.
    cloudToken: process.env.CLOUD_TOKEN || process.env.SYNC_TOKEN || '',
    db: {
        connectionString: process.env.DATABASE_URL || undefined,
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432', 10),
        user: process.env.PGUSER || process.env.USER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'somabox_lms',
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.PGMAXCONNECTIONS || '50', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        serverPath: path.join(ROOT_DIR, 'src/db/db.sqlite3'),
        localPath: path.join(ROOT_DIR, 'src/db/local.db.sqlite3'),
    },
    paths: {
        root: ROOT_DIR,
        content: path.join(ROOT_DIR, 'local-content'),
        rwandanEducation: path.join(ROOT_DIR, 'local-content/rwandan-education'),
        customContent: path.join(ROOT_DIR, 'local-content/custom-content'),
        lessons: path.join(ROOT_DIR, 'local-content/lessons'),
        library: path.join(ROOT_DIR, 'local-content/library'),
        libraryCovers: path.join(ROOT_DIR, 'local-content/library/covers'),
        courseCovers: path.join(ROOT_DIR, 'local-content/course-covers'),
        courseFiles: path.join(ROOT_DIR, 'local-content/course-files'),
        pdfCovers: path.join(ROOT_DIR, 'local-content/pdf-book-covers'),
        rwandanPdfCovers: path.join(ROOT_DIR, 'local-content/pdf-book-covers/rwandan-education'),
        static: {
            khan: path.join(ROOT_DIR, 'local-content/international/khan-academy'),
            w3schools: path.join(ROOT_DIR, 'local-content/international/w3schools'),
            wikipedia: path.join(ROOT_DIR, 'local-content/international/wikipedia'),
        }
    },
    defaults: {
        customContentRoot: 'custom-content',
        thumbnail: 'https://images.pexels.com/photos/1907785/pexels-photo-1907785.jpeg?auto=compress&cs=tinysrgb&w=300'
    }
};
