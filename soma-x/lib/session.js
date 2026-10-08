"use client";

// Client side of the server session: the bearer token issued by POST /auth/login or
// /auth/register. Identity (email, role) is never stored in the browser; it comes
// from GET /auth/me.
const TOKEN_KEY = "st";
// Keys from the old client-side "session" (Caesar-shifted email/name/role) and the
// Phase 0 password-change flag. Cleared on login/logout so stale data can't linger.
const LEGACY_KEYS = ["al", "un", "gh", "mcp"];

export function getSessionToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setSessionToken(token) {
    try {
        LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
        localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // storage unavailable (private mode); the user will need to log in again
    }
}

export function clearSession() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
        // ignore
    }
}

let installed = false;
// window.fetch before the wrapper, for requests that must not get the wrapper's bearer token or
// its "401 ends the session" handling (media probes, media-session renewals).
let rawFetch = null;
let apiBase = "";

const isApiUrl = (url) => !!apiBase && url.startsWith(apiBase);

/** Where to send someone back to the login page, remembering where they were. */
export function loginUrlWithNext(next) {
    const target = next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "");
    return target && target !== "/" ? `/?next=${encodeURIComponent(target)}` : "/";
}

/**
 * Wraps window.fetch once so every request to the backend carries the session token,
 * without touching each of the app's fetch calls. Also reacts to session problems:
 * a 401 ends the local session and returns to the login page; a pending password
 * change sends the user to their account page.
 *
 * Requests to the backend are also sent with credentials: "include", so the browser
 * stores and sends the HttpOnly media cookie (somabox_media) that <video>, <img>,
 * <iframe> and the book readers need. The backend reflects the origin and allows
 * credentials, so this works from the app on another port of the same host.
 */
export function installAuthFetch(serverUrl) {
    if (installed || typeof window === "undefined" || !serverUrl) return;
    installed = true;

    apiBase = serverUrl.replace(/\/+$/, "");
    const base = apiBase;
    const originalFetch = window.fetch.bind(window);
    rawFetch = originalFetch;

    window.fetch = async (input, init = {}) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
        if (!url.startsWith(base)) return originalFetch(input, init);

        const withCookies = { credentials: "include", ...init };
        const token = getSessionToken();
        if (!token) return originalFetch(input, withCookies);

        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        const response = await originalFetch(input, { ...withCookies, headers });

        if (response.status === 401 && !url.startsWith(`${base}/auth/login`)) {
            clearSession();
            if (window.location.pathname !== "/") window.location.href = loginUrlWithNext();
        } else if (response.status === 403) {
            response.clone().json().then((body) => {
                if (body?.code === "PASSWORD_CHANGE_REQUIRED" && window.location.pathname !== "/account") {
                    window.location.href = "/account";
                }
            }).catch(() => {});
        }
        return response;
    };
}

// ── Media cookie ───────────────────────────────────────────────────
// Login and signup set the media cookie; POST /auth/media-session renews it (12 h) for
// people who signed in earlier. Renewed on app load and every 6 hours while the app is open.
const MEDIA_RENEW_MS = 6 * 60 * 60 * 1000;
let lastMediaRenewal = 0;
let renewing = null;

/**
 * Renews the media cookie. Resolves to "ok", "expired" (the sign-in itself ran out), or
 * "offline" (the box couldn't be reached; existing cookies may still work).
 */
export function renewMediaSession(serverUrl = apiBase) {
    const token = getSessionToken();
    const base = String(serverUrl || "").replace(/\/+$/, "");
    if (!token) return Promise.resolve("expired");
    if (renewing) return renewing;
    const doFetch = rawFetch || (typeof window !== "undefined" ? window.fetch.bind(window) : null);
    if (!doFetch || !base) return Promise.resolve("offline");
    renewing = doFetch(`${base}/auth/media-session`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
    })
        .then((res) => {
            if (res.ok) {
                lastMediaRenewal = Date.now();
                return "ok";
            }
            return res.status === 401 ? "expired" : "offline";
        })
        .catch(() => "offline")
        .finally(() => { renewing = null; });
    return renewing;
}

/** Renews the media cookie now and every 6 hours. Returns a function that stops it. */
export function startMediaSessionKeepAlive(serverUrl) {
    if (typeof window === "undefined") return () => {};
    renewMediaSession(serverUrl);
    const timer = window.setInterval(() => renewMediaSession(serverUrl), MEDIA_RENEW_MS);
    // A laptop that slept past the renewal time renews when it wakes up.
    const onVisible = () => {
        if (document.visibilityState === "visible" && Date.now() - lastMediaRenewal > MEDIA_RENEW_MS) {
            renewMediaSession(serverUrl);
        }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
        window.clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
    };
}

/**
 * Checks whether the browser may open a backend file with its cookie alone (as <video>,
 * <iframe> and <img> do). Resolves to "ok", "login" (401: cookie missing or expired),
 * "forbidden" (403), or "unknown" (anything else, including offline: let the viewer try).
 */
export async function probeMediaUrl(url) {
    const doFetch = rawFetch || (typeof window !== "undefined" ? window.fetch.bind(window) : null);
    if (!doFetch || !url || !isApiUrl(url)) return "ok";
    try {
        const res = await doFetch(url, { method: "HEAD", credentials: "include", cache: "no-store" });
        if (res.status === 401) return "login";
        if (res.status === 403) return "forbidden";
        return res.ok ? "ok" : "unknown";
    } catch {
        return "unknown";
    }
}

/**
 * Whether the browser can open a backend file with its cookie, renewing the cookie once if
 * it's missing or old. Resolves to "ok" (opens as is), "renewed" (opens after renewing: load
 * it again), "expired" (the sign-in ran out: sign in again), "forbidden", or "unknown" (not a
 * sign-in problem, or offline: let the viewer try).
 */
export async function checkMediaAccess(url) {
    const first = await probeMediaUrl(url);
    if (first !== "login") return first;
    const renewed = await renewMediaSession();
    if (renewed === "expired") return "expired";
    const second = await probeMediaUrl(url);
    if (second === "login") return "expired";
    return second === "ok" ? "renewed" : second;
}

/** Whether a URL points at the backend (and so needs the media cookie). */
export function isBackendUrl(url) {
    return isApiUrl(String(url || ""));
}

/** A same-site path to return to after signing in, or "" when `next` isn't safe. */
export function safeNext(next) {
    const value = String(next || "");
    if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "";
    if (value === "/" || value.startsWith("/?") || value.startsWith("/signup")) return "";
    return value;
}

const NEXT_KEY = "somabox_next";

/** Remembers where a guest wanted to go (backup for ?next=, which a page reload may lose). */
export function rememberNext(next) {
    const value = safeNext(next);
    if (!value) return;
    try { sessionStorage.setItem(NEXT_KEY, value); } catch { /* storage unavailable */ }
}

/** The remembered destination from ?next= or sessionStorage (and forgets it). */
export function takeNext() {
    let fromQuery = "";
    try {
        fromQuery = safeNext(new URLSearchParams(window.location.search).get("next"));
    } catch { /* ignore */ }
    let stored = "";
    try {
        stored = safeNext(sessionStorage.getItem(NEXT_KEY));
        sessionStorage.removeItem(NEXT_KEY);
    } catch { /* ignore */ }
    return fromQuery || stored;
}
