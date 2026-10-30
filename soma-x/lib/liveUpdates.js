"use client";

// The browser side of live updates (backend: soma-x-backend/src/helpers/live.js). The box says
// *what* changed; here that becomes "this data is out of date" for the matching query keys, so a
// screen showing it reloads it and everything else reloads when it's next shown.
//
// One stream per browser, not per tab: tabs take turns holding a Web Lock, the holder keeps the
// stream open and passes events to the other tabs over a BroadcastChannel. When it closes,
// another tab takes over. The stream closes when the last tab goes or the person signs out.
import { apiFetch, apiUrl } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const LOCK = "somabox-live";
const CHANNEL = "somabox-live";
const LAST_KEY = "somabox_live_last"; // the last event seen, to catch up after a reconnect

const keysFor = (event) => {
    switch (event.kind) {
        // A course changed: everything kept for it, plus the lists and dashboards that show it.
        case "course":
            return [queryKeys.course(event.id), queryKeys.courses, queryKeys.dashboard, queryKeys.assignmentSummary, queryKeys.myCalendar];
        case "course-work":
            return [queryKeys.course(event.id), queryKeys.courses];
        case "courses":
            return [queryKeys.courses, queryKeys.dashboard, queryKeys.assignmentSummary, queryKeys.myCalendar];
        case "notifications":
            return [queryKeys.notifications];
        case "school":
            return [queryKeys.school];
        case "catalogue":
            return [queryKeys.catalogue];
        default:
            return [];
    }
};

function apply(queryClient, message) {
    if (message.type === "reset") {
        queryClient.invalidateQueries();
        return;
    }
    for (const queryKey of keysFor(message)) queryClient.invalidateQueries({ queryKey });
}

const readLast = () => { try { return sessionStorage.getItem(LAST_KEY) || ""; } catch { return ""; } };
const saveLast = (id) => { try { if (id) sessionStorage.setItem(LAST_KEY, id); } catch { /* ignore */ } };

/**
 * Holds the stream while this tab has the lock. Resolves when `signal` aborts (sign-out, page
 * closing). Reconnects with growing pauses (and some randomness, so a classroom of devices
 * doesn't reconnect all at once after the box restarts).
 */
async function holdStream(onMessage, signal) {
    let attempt = 0;
    while (!signal.aborted) {
        const opened = await new Promise((resolve) => {
            let source = null;
            const stop = () => { source?.close(); resolve(false); };
            signal.addEventListener("abort", stop, { once: true });
            apiFetch("/live/ticket", { method: "POST" }).then(({ ticket }) => {
                if (signal.aborted) return;
                const last = readLast();
                source = new EventSource(apiUrl(`/live?ticket=${encodeURIComponent(ticket)}${last ? `&last=${encodeURIComponent(last)}` : ""}`));
                const handle = (type) => (e) => {
                    saveLast(e.lastEventId);
                    if (type === "ready") { attempt = 0; return; }
                    onMessage({ type, ...(e.data ? JSON.parse(e.data) : {}) });
                };
                source.addEventListener("change", handle("change"));
                source.addEventListener("reset", handle("reset"));
                source.addEventListener("ready", handle("ready"));
                // A ticket works once, so the browser's own reconnect can't: close and start over.
                source.onerror = () => {
                    source.close();
                    signal.removeEventListener("abort", stop);
                    resolve(true);
                };
            }).catch(() => {
                signal.removeEventListener("abort", stop);
                resolve(true);
            });
        });
        if (!opened || signal.aborted) return;
        attempt += 1;
        const pause = Math.min(60_000, 2_000 * 2 ** Math.min(attempt, 5)) * (0.5 + Math.random());
        await new Promise((r) => setTimeout(r, pause));
    }
}

/** Starts live updates for this tab. Returns a function that stops them. */
export function startLiveUpdates(queryClient) {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};
    const stopped = new AbortController();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
    channel?.addEventListener("message", (e) => apply(queryClient, e.data));
    const onMessage = (message) => {
        apply(queryClient, message);
        channel?.postMessage(message);
    };

    if (navigator.locks?.request) {
        // Waits its turn; holds the lock (and the stream) until this tab stops.
        navigator.locks.request(LOCK, { signal: stopped.signal }, () => holdStream(onMessage, stopped.signal)).catch(() => {});
    } else {
        holdStream(onMessage, stopped.signal);
    }
    return () => {
        stopped.abort();
        channel?.close();
    };
}
