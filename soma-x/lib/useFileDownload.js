"use client";

// Books and documents are fetched here before they are shown, so a slow device shows how far the
// download has got ("Opening… 42%") instead of a blank black or white frame. The box sends each
// file's size, so the share received can be counted as it arrives.
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

/**
 * Reads a fetch Response's body, calling onProgress(percent, receivedBytes) as it arrives.
 * percent is null when the size isn't known. Returns the body as a Blob.
 */
export async function readWithProgress(response, onProgress, type) {
    const total = Number(response.headers.get("content-length")) || 0;
    const blobType = type || response.headers.get("content-type") || "";
    if (!response.body?.getReader) {
        const blob = await response.blob();
        onProgress?.(100, blob.size);
        return new Blob([blob], { type: blobType });
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onProgress?.(total ? Math.min(99, Math.floor((received * 100) / total)) : null, received);
    }
    onProgress?.(100, received);
    return new Blob(chunks, { type: blobType });
}

/**
 * Downloads `url` while active. state: "loading" | "ready" | "error" | "expired" | "forbidden"
 * | "guest". As { blob, objectUrl } it gives the file once it's in (objectUrl is released when the
 * url changes or the viewer closes). type overrides the file's type (e.g. EPUB for epub.js).
 */
export function useFileDownload(url, { active = true, type } = {}) {
    const [result, setResult] = useState({ state: "loading", percent: 0, received: 0 });

    useEffect(() => {
        if (!active || !url) return undefined;
        let cancelled = false;
        let objectUrl = null;
        setResult({ state: "loading", percent: 0, received: 0 });
        (async () => {
            const signedIn = Boolean(getSessionToken());
            try {
                const response = await apiFetch(url, { responseType: "response", allowUnauthenticated: !signedIn });
                const blob = await readWithProgress(response, (percent, received) => {
                    if (!cancelled) setResult((r) => ({ ...r, percent, received }));
                }, type);
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                setResult({ state: "ready", percent: 100, received: blob.size, blob, objectUrl });
            } catch (err) {
                if (cancelled) return;
                const state = err?.status === 401 ? (signedIn ? "expired" : "guest")
                    : err?.status === 403 ? "forbidden" : "error";
                setResult({ state, percent: 0, received: 0, error: err });
            }
        })();
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [url, active, type]);

    return result;
}
