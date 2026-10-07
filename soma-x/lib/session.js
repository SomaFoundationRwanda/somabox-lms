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

/**
 * Wraps window.fetch once so every request to the backend carries the session token,
 * without touching each of the app's fetch calls. Also reacts to session problems:
 * a 401 ends the local session and returns to the login page; a pending password
 * change sends the user to their account page.
 */
export function installAuthFetch(serverUrl) {
    if (installed || typeof window === "undefined" || !serverUrl) return;
    installed = true;

    const base = serverUrl.replace(/\/+$/, "");
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init = {}) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
        const token = getSessionToken();
        if (!token || !url.startsWith(base)) return originalFetch(input, init);

        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        const response = await originalFetch(input, { ...init, headers });

        if (response.status === 401 && !url.startsWith(`${base}/auth/login`)) {
            clearSession();
            if (window.location.pathname !== "/") window.location.href = "/";
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
