// The cloud content catalogue (soma-x-server): authenticated requests to it, and the record of
// which files on the box were downloaded from it (cloud_content, migration 0023).
import crypto from 'crypto';
import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
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

async function sha256Of(file) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

/**
 * Downloads a cloud file to `target`. The box may lose its connection any time (someone unplugs
 * the cable), so the bytes go to `target.part`, which is kept on failure and resumed with a Range
 * request next time. With `sha256` the finished file is checked, so a resumed file built from an
 * older version is thrown away and fetched again in full. `onBytes(n)` is told as bytes arrive
 * (a resumed part file counts at the start). Returns the number of bytes fetched.
 */
export async function downloadTo(contentPath, target, { sha256 = null, onBytes = null } = {}, attempt = 0) {
    const partial = `${target}.part`;
    const have = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
    const res = await cloudFetch(contentPath, have ? { headers: { Range: `bytes=${have}-` } } : {});
    if (res.status === 416) {
        // The part file is already complete or doesn't fit this file any more.
        await res.body?.cancel();
        fs.rmSync(partial, { force: true });
        if (attempt > 0) throw new Error(`Cloud refused the download of ${contentPath}`);
        return downloadTo(contentPath, target, { sha256, onBytes }, attempt + 1);
    }
    if (!res.ok) throw new Error(`Failed to download ${contentPath}: ${res.status} ${res.statusText}`);
    const resumed = res.status === 206 && have > 0;
    if (resumed) onBytes?.(have);
    const count = async function* (source) {
        for await (const chunk of source) {
            onBytes(chunk.length);
            yield chunk;
        }
    };
    await pipeline(
        Readable.fromWeb(res.body),
        ...(onBytes ? [count] : []),
        fs.createWriteStream(partial, { flags: resumed ? 'a' : 'w' }),
    );

    if (sha256 && (await sha256Of(partial)) !== sha256) {
        fs.rmSync(partial, { force: true });
        if (resumed && attempt === 0) return downloadTo(contentPath, target, { sha256, onBytes }, attempt + 1);
        throw new Error(`Downloaded ${contentPath} does not match the cloud's copy`);
    }
    fs.renameSync(partial, target);
    return fs.statSync(target).size - (resumed ? have : 0);
}
