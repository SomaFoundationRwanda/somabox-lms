// Slows down password guessing on the box's network: at most 4 failed sign-ins a minute for
// one account (email or learner code), and 20 a minute from one device address, so trying
// many accounts from one device is limited too. A correct password clears the account's count.
// Kept in memory: the box runs one backend process, and a restart forgetting the counts is fine.
const WINDOW_MS = 60 * 1000;
const PER_ACCOUNT = 4;
const PER_ADDRESS = 20;

const failures = new Map(); // key -> timestamps of failures within the window

function recent(key, now) {
    const kept = (failures.get(key) || []).filter((at) => now - at < WINDOW_MS);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
}

const accountKey = (account) => `account:${String(account || '').trim().toLowerCase()}`;
const addressKey = (address) => `address:${address || 'unknown'}`;

/** Seconds until another attempt is allowed, or 0 when it may go ahead. */
export function loginRetryAfter(account, address, now = Date.now()) {
    let waitMs = 0;
    for (const [key, limit] of [[accountKey(account), PER_ACCOUNT], [addressKey(address), PER_ADDRESS]]) {
        const list = recent(key, now);
        if (list.length >= limit) waitMs = Math.max(waitMs, list[list.length - limit] + WINDOW_MS - now);
    }
    return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}

export function recordLoginFailure(account, address, now = Date.now()) {
    for (const key of [accountKey(account), addressKey(address)]) {
        failures.set(key, [...recent(key, now), now]);
    }
    // Forget old entries now and then, so guessing at many names can't grow the map forever.
    if (failures.size > 5000) for (const key of [...failures.keys()]) recent(key, now);
}

export function clearLoginFailures(account) {
    failures.delete(accountKey(account));
}

/** Tests only: start from a clean slate. */
export function resetLoginThrottle() {
    failures.clear();
}
