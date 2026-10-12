// The cloud content catalogue (soma-x-server): authenticated requests to it, and the record of
// which files on the box were downloaded from it (cloud_content, migration 0023).
import { localDb } from '../../helpers/db-manager.js';
import { config } from '../../config/index.js';

export const cloudBase = () => config.cloudUrl.replace(/\/$/, '');

/** fetch() against the cloud with the box's key (the old endpoints ignore it; newer ones need it). */
export function cloudFetch(pathOrUrl, init = {}) {
    const url = /^https?:/.test(pathOrUrl) ? pathOrUrl : `${cloudBase()}${pathOrUrl}`;
    const headers = { ...(init.headers || {}), ...(config.cloudToken ? { Authorization: `Bearer ${config.cloudToken}` } : {}) };
    return fetch(url, { ...init, headers });
}

/** Remembers that pathKey (e.g. "library/science/cell.epub") is catalogue item `id`. */
export async function rememberCloudFile(pathKey, { collection, id, sha256 = null, version = null }) {
    if (!Number.isSafeInteger(Number(id))) return;
    await localDb.prepare(`
        INSERT INTO cloud_content (path_key, collection, cloud_id, sha256, version, downloaded_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (path_key) DO UPDATE SET collection = EXCLUDED.collection, cloud_id = EXCLUDED.cloud_id,
            sha256 = EXCLUDED.sha256, version = EXCLUDED.version, downloaded_at = CURRENT_TIMESTAMP
        RETURNING path_key
    `).run(pathKey, collection, Number(id), sha256 || null, version ?? null);
}

export async function cloudFile(pathKey) {
    return (await localDb.prepare('SELECT * FROM cloud_content WHERE path_key = ?').get(pathKey)) || null;
}

/** pathKey -> row, for one collection. */
export async function cloudFiles(collection) {
    const rows = await localDb.prepare('SELECT * FROM cloud_content WHERE collection = ?').all(collection);
    return new Map(rows.map((r) => [r.path_key, r]));
}

/** Forgets a file, or everything under a folder. */
export async function forgetCloudFiles(pathKey) {
    await localDb.prepare("DELETE FROM cloud_content WHERE path_key = ? OR path_key LIKE ? ESCAPE '\\'")
        .run(pathKey, `${pathKey.replace(/[\\%_]/g, (m) => `\\${m}`)}/%`);
}

/**
 * Whether the local copy matches the cloud's current one. With a recorded hash the hash decides;
 * files from before the box recorded hashes fall back to comparing sizes.
 */
export function isCurrent({ localSize, recorded, cloud }) {
    if (localSize == null) return false;
    if (recorded?.sha256 && cloud?.sha256) return recorded.sha256 === cloud.sha256;
    return cloud?.size == null || Number(localSize) === Number(cloud.size);
}
