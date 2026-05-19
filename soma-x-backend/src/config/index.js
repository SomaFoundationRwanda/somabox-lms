import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '../../');

export const config = {
    port: process.env.PORT || 3000,
    cloudUrl: process.env.CLOUD_URL || 'http://localhost:2999',
    db: {
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
        classCovers: path.join(ROOT_DIR, 'local-content/class-covers'),
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
