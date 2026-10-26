"use client";

// The one way the app talks to the box's backend. Every request gets the session token and the
// media cookie (credentials), every failure becomes an ApiError, and session problems are handled
// in one place (a 401 signs out, a pending password change goes to the account page).
//
//   const courses = await apiFetch("/courses/mine");
//   await apiFetch(`/courses/${id}/people`, { method: "POST", json: { email } });
//   const file = await apiFetch(`/users/me/export`, { responseType: "blob" });
//
// The box is on the local network: when it can't be reached (Wi-Fi dropped, the box restarting)
// the error has status 0 and code "NETWORK", so screens can say so instead of a server message.
import { baseFetch, getSessionToken, handleSessionProblem } from "@/lib/session";

const API_BASE = String(process.env.NEXT_PUBLIC_SERVER_URL || "").replace(/\/+$/, "");

export class ApiError extends Error {
    /**
     * @param {string} message
     * @param {number} status HTTP status, or 0 when the box couldn't be reached
     * @param {any} body the parsed error body ({ message, code, ... }) or null
     */
    constructor(message, status, body) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
        /** The backend's error code (e.g. "NO_ACCOUNT", "SOLE_TEACHER"), or "NETWORK". */
        this.code = status === 0 ? "NETWORK" : body?.code || null;
    }
}

/**
 * A message to show for a failed request: the backend's message, "can't reach the box", or a
 * general one. `t` is the language function (useLanguage). Translating backend errors by their
 * code can be added here later without touching the call sites.
 */
export function getErrorMessage(error, t) {
    const say = (key, english) => (t ? t(key) : null) || english;
    if (error instanceof ApiError) {
        if (error.status === 0) return say("shell.common.cantReachBox", "Can't reach SOMABOX. Check the Wi-Fi and try again.");
        if (error.body?.message) return error.body.message;
    }
    return say("shell.common.somethingWrong", "Something went wrong. Please try again.");
}

/** The full URL of a backend path, for <a href>, <img src>, EventSource and the like. */
export function apiUrl(path) {
    return /^https?:\/\//.test(path) ? path : `${API_BASE}${path}`;
}

/** A JSON body for apiFetch: apiFetch(path, { method: "POST", ...jsonBody(value) }). */
export function jsonBody(value) {
    return { body: JSON.stringify(value), headers: { "Content-Type": "application/json" } };
}

/**
 * @param {string} path backend path, e.g. "/courses/mine"
 * @param {RequestInit & {
 *   json?: any,                 // sent as a JSON body
 *   responseType?: "json" | "blob" | "text" | "response",
 *   allowUnauthenticated?: boolean, // a 401 is just an error (sign-in, setup), not a sign-out
 * }} [options]
 */
export async function apiFetch(path, options = {}) {
    const { json, responseType = "json", allowUnauthenticated = false, headers: given, ...init } = options;
    const headers = new Headers(given);
    const token = getSessionToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    if (json !== undefined) {
        init.body = JSON.stringify(json);
        headers.set("Content-Type", "application/json");
    }

    let response;
    try {
        response = await baseFetch()(apiUrl(path), { credentials: "include", ...init, headers });
    } catch (error) {
        if (error?.name === "AbortError") throw error;
        throw new ApiError(`${init.method || "GET"} ${path}: can't reach the box`, 0, null);
    }

    if (!response.ok) {
        if (!allowUnauthenticated) handleSessionProblem(response);
        const body = await response.json().catch(() => null);
        throw new ApiError(body?.message || `${init.method || "GET"} ${path} failed with ${response.status}`, response.status, body);
    }

    if (responseType === "response") return response;
    if (responseType === "blob") return response.blob();
    const text = await response.text();
    if (responseType === "text") return text;
    // Checked by content, not just 204: an empty 200/201 would make JSON.parse throw.
    return text ? JSON.parse(text) : undefined;
}
