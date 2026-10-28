"use client";

// Client side of the server session: the bearer token issued by POST /auth/login or
// /auth/register. Identity (email, role) is never stored in the browser; it comes
// from GET /auth/me.
import { apiFetch } from "@/lib/api";

const TOKEN_KEY = "st";
// Keys from the old client-side "session" (Caesar-shifted email/name/role) and the
// Phase 0 password-change flag. Cleared on login/logout so stale data can't linger.
const LEGACY_KEYS = ["al", "un", "gh", "mcp"];

export function getSessionToken() {
    try {
        return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

/**
 * Keeps the token only until the browser closes (sessionStorage: tabs opened from the app keep
 * it, the next person to open the browser doesn't). Every device is treated as shared: a learner
 * may forget to say it is.
 */
export function setSessionToken(token) {
    try {
        LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
        // storage unavailable (private mode); the user will need to log in again
    }
}

/**
 * Ends the local session. dropDrafts: the person signed out themselves, so the unsent text kept
 * on this device goes too (lib/drafts.js). A session that simply timed out keeps it, so the same
 * person finds their writing when they sign back in (drafts are kept per person).
 */
export function clearSession({ dropDrafts = false } = {}) {
    try {
        if (dropDrafts) {
            for (const k of Object.keys(localStorage)) if (k.startsWith("somabox.draft.")) localStorage.removeItem(k);
        }
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
        // The data kept for fast reloads (lib/persistCache.js) belongs to the session.
        for (const k of Object.keys(localStorage)) if (k.startsWith("somabox.cache.")) localStorage.removeItem(k);
    } catch {
        // ignore
    }
}

/** Learners created without an email get an internal address (…@learner.invalid): never shown. */
export function isInternalEmail(email) {
    return String(email || "").toLowerCase().endsWith("@learner.invalid");
}

/** The email to show for an account: its learner code instead of an internal address. */
export function shownEmail(user) {
    return isInternalEmail(user?.email) ? (user?.learner_code || user?.learnerCode || "") : (user?.email || "");
}

// Where each person manages their own account (and changes a temporary password): teachers in
// Teacher Settings, everyone else on the Account page.
export function accountPage(role) {
    return role === "teacher" ? "/teacher/settings" : "/account";
}
const ACCOUNT_PAGES = ["/account", "/teacher/settings"];

// The backend's address, to tell its files (which need the media cookie) from others.
const apiBase = String(process.env.NEXT_PUBLIC_SERVER_URL || "").replace(/\/+$/, "");

const isApiUrl = (url) => !!apiBase && url.startsWith(apiBase);

/** Where to send someone back to the login page, remembering where they were. */
export function loginUrlWithNext(next) {
    const target = next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "");
    return target && target !== "/" ? `/?next=${encodeURIComponent(target)}` : "/";
}

/**
 * What a backend answer means for the session: a 401 ends the local session and returns to the
 * login page; a pending password change (403 PASSWORD_CHANGE_REQUIRED) sends the user to their
 * account page. Used by apiFetch and apiUpload (lib/api.js).
 */
export function handleSessionProblem(response) {
    if (typeof window === "undefined") return;
    if (response.status === 401) {
        clearSession();
        if (window.location.pathname !== "/") window.location.href = loginUrlWithNext();
    } else if (response.status === 403) {
        response.clone().json().then((body) => {
            if (body?.code === "PASSWORD_CHANGE_REQUIRED" && !ACCOUNT_PAGES.includes(window.location.pathname)) {
                window.location.href = window.location.pathname.startsWith("/teacher") ? "/teacher/settings" : "/account";
            }
        }).catch(() => {});
    }
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
export function renewMediaSession() {
    if (!getSessionToken()) return Promise.resolve("expired");
    if (renewing) return renewing;
    // A 401 here means the sign-in itself ran out: reported, not handled as a sign-out.
    renewing = apiFetch("/auth/media-session", { method: "POST", allowUnauthenticated: true })
        .then(() => {
            lastMediaRenewal = Date.now();
            return "ok";
        })
        .catch((error) => (error?.status === 401 ? "expired" : "offline"))
        .finally(() => { renewing = null; });
    return renewing;
}

/** Renews the media cookie now and every 6 hours. Returns a function that stops it. */
export function startMediaSessionKeepAlive() {
    if (typeof window === "undefined") return () => {};
    renewMediaSession();
    const timer = window.setInterval(() => renewMediaSession(), MEDIA_RENEW_MS);
    // A laptop that slept past the renewal time renews when it wakes up.
    const onVisible = () => {
        if (document.visibilityState === "visible" && Date.now() - lastMediaRenewal > MEDIA_RENEW_MS) {
            renewMediaSession();
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
    if (!url || !isApiUrl(url)) return "ok";
    try {
        // The cookie alone, like <video> and <iframe>: no session token on this request.
        await apiFetch(url, { method: "HEAD", cache: "no-store", withSession: false, allowUnauthenticated: true, responseType: "response" });
        return "ok";
    } catch (error) {
        if (error?.status === 401) return "login";
        if (error?.status === 403) return "forbidden";
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
