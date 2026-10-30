// Progress of one batch of cloud downloads (library books, curriculum files), for the admin pages:
// how many of the selected files are done, skipped or failed, how many bytes have arrived, and
// which files are on their way. One per download kind; GET .../download-status returns snapshot().

const MAX_LISTED = 20;

export function createDownloadProgress() {
    let state = idle();
    let fileBytes = new Map(); // key -> bytes counted so far for that file
    let sizes = new Map();     // key -> expected size, when the cloud said

    function idle() {
        return {
            status: 'init', total: 0, downloaded: 0, skipped: 0, failed: 0,
            bytesDone: 0, bytesTotal: 0, sizesKnown: true, current: [], failedNames: [],
            startedAt: null, finishedAt: null,
        };
    }

    const addBytes = (key, n) => {
        const before = fileBytes.get(key) || 0;
        const size = sizes.get(key);
        // A resumed or re-fetched file never counts for more than its size.
        const after = size ? Math.min(size, before + n) : before + n;
        fileBytes.set(key, after);
        state.bytesDone += after - before;
    };

    return {
        get running() { return state.status === 'downloading'; },

        /** items: [{ key, name, size? }] */
        start(items) {
            state = { ...idle(), status: 'downloading', total: items.length, startedAt: new Date().toISOString() };
            fileBytes = new Map();
            sizes = new Map();
            for (const item of items) {
                const size = Number(item.size);
                if (Number.isFinite(size) && size > 0) {
                    sizes.set(item.key, size);
                    state.bytesTotal += size;
                } else {
                    state.sizesKnown = false;
                }
            }
        },

        begin(key, name) {
            state.current = [...state.current.filter((c) => c.key !== key), { key, name }];
        },

        /** Bytes received for a file (call as chunks arrive). */
        bytes(key, n) {
            addBytes(key, n);
        },

        /** outcome: 'downloaded' | 'updated' | 'skipped' | 'failed' */
        finish(key, name, outcome) {
            state.current = state.current.filter((c) => c.key !== key);
            // Done with this file either way: its whole size counts toward the bar.
            const size = sizes.get(key);
            if (size) addBytes(key, size);
            if (outcome === 'skipped') state.skipped += 1;
            else if (outcome === 'failed') {
                state.failed += 1;
                if (state.failedNames.length < MAX_LISTED) state.failedNames.push(name);
            } else state.downloaded += 1;
        },

        end({ error = false } = {}) {
            state.current = [];
            state.status = error || state.failed ? 'failed' : 'finished';
            state.finishedAt = new Date().toISOString();
        },

        snapshot() {
            const done = state.downloaded + state.skipped + state.failed;
            const byBytes = state.sizesKnown && state.bytesTotal > 0;
            const ratio = byBytes ? state.bytesDone / state.bytesTotal : state.total ? done / state.total : 0;
            // 100 only once the batch is over, so a bar never sits full while files are still coming.
            const percent = state.finishedAt ? 100 : Math.min(99, Math.floor(ratio * 100));
            const { sizesKnown, current, ...rest } = state;
            return { ...rest, done, percent, current: current.slice(0, MAX_LISTED).map((c) => c.name) };
        },
    };
}
