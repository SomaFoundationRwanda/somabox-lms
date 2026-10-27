"use client"
import { createContext, useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { clearSession, getSessionToken, startMediaSessionKeepAlive } from "@/lib/session";
import { clearUserQueue, pendingCount } from "@/lib/submissionQueue";
import { apiFetch, apiUpload } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { startLiveUpdates } from "@/lib/liveUpdates";

// The signed-in user as the app uses it, from GET /auth/me.
async function loadMe() {
    const { user: me } = await apiFetch("/auth/me");
    return {
        id: me.id,
        email: String(me.email || "").toLowerCase(),
        fullName: me.full_name || "",
        role: me.role,
        mustChangePassword: !!me.must_change_password,
        // Learners' sign-in code (e.g. GSK-0012); "" for staff.
        learnerCode: me.learner_code || "",
    };
}


const DataContext = createContext();

export default DataContext

// ── Brightness engine ──────────────────────────────────────────────
// Replaces the old binary dark/light toggle with a continuous 0-100
// slider. The page canvas (background + primary text) is computed live
// from the slider value and always meets WCAG AA (>=4.5:1) — verified
// empirically: interpolating CANVAS_DARK -> CANVAS_LIGHT and
// auto-picking pure black/white text for whichever gives higher
// contrast never drops below ~4.6:1 across the full 0-100 range.
// Softer/branded near-black or near-white text fails this guarantee
// (dips to ~3.9:1 mid-slider), so the auto-picked text MUST stay pure
// black/white — don't "soften" TEXT_DARK/TEXT_LIGHT below.
const CANVAS_DARK = [0x08, 0x0B, 0x0F];
const CANVAS_LIGHT = [0xF5, 0xF6, 0xF8];
const TEXT_DARK = [0, 0, 0];
const TEXT_LIGHT = [255, 255, 255];

function srgbToLinear(c) {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function relativeLuminance([r, g, b]) {
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(c1, c2) {
    const l1 = relativeLuminance(c1), l2 = relativeLuminance(c2);
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}
function lerpRgb(a, b, t) {
    return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}
function rgbCss([r, g, b]) {
    return `rgb(${r}, ${g}, ${b})`;
}

// brightness: 0 (darkest) .. 100 (lightest)
function computeCanvasVars(brightness) {
    const t = Math.min(100, Math.max(0, brightness)) / 100;
    const bg = lerpRgb(CANVAS_DARK, CANVAS_LIGHT, t);
    const textColor = contrastRatio(bg, TEXT_LIGHT) > contrastRatio(bg, TEXT_DARK) ? TEXT_LIGHT : TEXT_DARK;
    return { canvasBg: rgbCss(bg), canvasText: rgbCss(textColor) };
}

export function DataProvider({ children }) {
    const queryClient = useQueryClient();
    // Whether this browser holds a session token (read after mount: storage is client-only).
    const [hasToken, setHasToken] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [brightness, setBrightnessState] = useState(100);
    // Guards against hydration mismatch (#418): components using isDark/
    // authenticated won't render browser-specific content until after mount.
    const [mounted, setMounted] = useState(false);

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    // The Explore catalogue: one public fetch (GET /content/explore) built from the folders on
    // the box. mainCategories, summaryData and customContentSummary are all views of it. Kept
    // until the box says the catalogue changed (live updates) or the app reloads.
    const explore = useQuery({ queryKey: queryKeys.explore, queryFn: () => apiFetch("/content/explore") });
    // On a failed first load, an empty catalogue: pages show their empty state, not a spinner.
    const catalogue = explore.data ?? (explore.isError ? {} : null);
    const mainCategories = catalogue ? (Array.isArray(catalogue.mainCategories) ? catalogue.mainCategories : []) : null;
    const summaryData = catalogue ? catalogue.summary || {} : null;
    const customContentSummary = summaryData;
    const exploreVersion = catalogue?.version ?? null;
    const refreshExplore = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.explore }), [queryClient]);

    const applyBrightness = useCallback((value, { persist = true } = {}) => {
        const clamped = Math.min(100, Math.max(0, value));
        const dark = clamped < 50;
        const { canvasBg, canvasText } = computeCanvasVars(clamped);

        setBrightnessState(clamped);
        setIsDark(dark);
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.style.setProperty('--canvas-bg', canvasBg);
        document.documentElement.style.setProperty('--canvas-text', canvasText);

        if (persist) {
            localStorage.setItem('brightness', String(clamped));
            localStorage.setItem('theme', dark ? 'dark' : 'light');
        }
    }, []);

    const setBrightness = useCallback((value) => applyBrightness(value), [applyBrightness]);

    // Back-compat shim for existing Light/Dark buttons: true -> darkest, false -> lightest.
    const toggleDark = useCallback((val) => applyBrightness(val ? 0 : 100), [applyBrightness]);

    // The logged-in user: { id, email, fullName, role, mustChangePassword, learnerCode }.
    const me = useQuery({ queryKey: queryKeys.me, queryFn: loadMe, enabled: hasToken });
    const user = me.data ?? null;
    const authenticated = !!user;
    const authLoading = !mounted || (hasToken && me.isPending);

    // A session the box no longer accepts ends here (a 401 is already handled by apiFetch). When
    // the box can't be reached, the session is kept: the person is signed in again once it's back.
    useEffect(() => {
        if (me.error && me.error.status !== 0) {
            clearSession();
            setHasToken(false);
            queryClient.removeQueries({ queryKey: queryKeys.me });
        }
    }, [me.error, queryClient]);

    const refreshUser = useCallback(async () => {
        if (!getSessionToken()) return null;
        setHasToken(true);
        try {
            return await queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: loadMe, staleTime: 0 });
        } catch {
            return null;
        }
    }, [queryClient]);

    // While someone is signed in, the box tells this browser what changed (lib/liveUpdates.js).
    useEffect(() => {
        if (!authenticated) return undefined;
        return startLiveUpdates(queryClient);
    }, [authenticated, queryClient]);

    // Auth + theme — runs only on the client after mount
    useEffect(() => {
        setHasToken(!!getSessionToken());

        // Resolve initial brightness: prefer the new "brightness" key; fall
        // back to migrating the old binary "theme" key (dark -> 0, light -> 100)
        // so returning users keep their prior preference.
        const storedBrightness = localStorage.getItem('brightness');
        let initialBrightness;
        if (storedBrightness !== null && !Number.isNaN(Number(storedBrightness))) {
            initialBrightness = Number(storedBrightness);
        } else {
            const storedTheme = localStorage.getItem('theme');
            initialBrightness = storedTheme === 'dark' ? 0 : 100;
        }
        applyBrightness(initialBrightness, { persist: false });

        // Signal that client has fully mounted — safe to use isDark / authenticated
        setMounted(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Videos, PDFs, books and lessons load with the HttpOnly media cookie, not the bearer
    // token. Renew it on load for people who signed in earlier, then every 6 hours.
    useEffect(() => {
        if (!authenticated) return undefined;
        return startMediaSessionKeepAlive();
    }, [authenticated, SERVER_URL]);

    const logout = useCallback(async () => {
        // Shared devices: work waiting in the offline submission queue belongs to this user.
        // Warn if some hasn't reached the box yet, then delete it with the session so the next
        // person on this device can't read it.
        const userId = user?.id;
        const waiting = pendingCount(userId);
        if (waiting > 0) {
            const what = waiting === 1 ? "1 submission hasn't" : `${waiting} submissions haven't`;
            if (!window.confirm(`${what} been sent yet. Log out anyway? They'll be deleted from this device.`)) return;
        }
        clearUserQueue(userId);
        try {
            await apiFetch("/auth/logout", { method: "POST", allowUnauthenticated: true });
        } catch {
            // offline, or already signed out on the box: the local session is still cleared below
        }
        clearSession();
        // Nothing of this person's stays in memory for the next one on this device.
        queryClient.clear();
        window.location.href = '/';
    }, [SERVER_URL, user, queryClient]);

    const [uploads, setUploads] = useState([]);

    const startUpload = useCallback((url, method, formData, title, classId) => {
        const uploadId = Date.now().toString();
        const newUpload = {
            id: uploadId,
            title: title || "Lesson Upload",
            progress: 0,
            status: "uploading",
            error: null,
            classId,
            request: null
        };

        // Uploads report progress, so they go through apiUpload (XMLHttpRequest), not apiFetch.
        const upload = apiUpload(url, formData, {
            method,
            onProgress: (percent) => setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: percent } : u)),
        });
        upload.promise.then(() => {
            setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100, status: "success" } : u));
            if (typeof document !== "undefined") {
                document.dispatchEvent(new CustomEvent("lesson-uploaded", { detail: { classId } }));
            }
            setTimeout(() => {
                setUploads(prev => prev.filter(u => u.id !== uploadId));
            }, 6000);
        }).catch((error) => {
            if (error?.name === "AbortError") return;
            const errMsg = error?.status === 0 ? "Network error during upload" : error?.body?.message || "Upload failed";
            setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "failed", error: errMsg } : u));
        });

        newUpload.request = upload;
        setUploads(prev => [...prev, newUpload]);
    }, []);

    const cancelUpload = useCallback((uploadId) => {
        setUploads(prev => {
            const upload = prev.find(u => u.id === uploadId);
            if (upload && upload.request) {
                upload.request.abort();
            }
            return prev.filter(u => u.id !== uploadId);
        });
    }, []);

    useEffect(() => {
        const hasActiveUploads = uploads.some(u => u.status === "uploading");
        if (!hasActiveUploads) return;

        const handleBeforeUnload = (e) => {
            e.preventDefault();
            e.returnValue = "An upload is in progress. If you close this page, the upload will be cancelled.";
            return e.returnValue;
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [uploads]);

    const contextData = {
        summaryData,
        mainCategories,
        customContentSummary,
        exploreVersion,
        refreshExplore,
        authenticated,
        authLoading,
        isDark,
        toggleDark,
        brightness,
        setBrightness,
        user,
        // Plain role string ("admin" | "teacher" | "scholar"), or "" when logged out.
        role: user?.role || "",
        refreshUser,
        logout,
        SERVER_URL,
        mounted,
        uploads,
        startUpload,
        cancelUpload,
    };

    return (
        <DataContext.Provider value={contextData}>
            {children}
            <UploadWidget uploads={uploads} cancelUpload={cancelUpload} />
        </DataContext.Provider>
    );
}

function UploadWidget({ uploads, cancelUpload }) {
    const [isMinimized, setIsMinimized] = useState(false);

    if (!uploads || uploads.length === 0) return null;

    const activeCount = uploads.filter(u => u.status === "uploading").length;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] dark w-80 bg-surface/90 text-fg rounded-2xl shadow-2xl border border-line-strong backdrop-blur-md overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-surface-raised/80 border-b border-line-strong select-none">
                <div className="flex items-center gap-2">
                    {activeCount > 0 ? (
                        <Loader2 className="w-4 h-4 text-info-fg animate-spin" />
                    ) : (
                        <CheckCircle2 className="w-4 h-4 text-success-fg" />
                    )}
                    <span className="font-semibold text-ui">
                        {activeCount > 0 ? `Uploading (${activeCount})` : "Uploads complete"}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setIsMinimized(prev => !prev)}
                        className="p-1 hover:bg-surface-hover rounded-md transition-colors"
                        title={isMinimized ? "Expand" : "Collapse"}
                    >
                        {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* List */}
            {!isMinimized && (
                <div className="max-h-60 overflow-y-auto divide-y divide-line p-3 space-y-3">
                    {uploads.map((upload) => (
                        <div key={upload.id} className="space-y-2 pt-2 first:pt-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="text-caption font-medium truncate text-fg" title={upload.title}>
                                        {upload.title}
                                    </p>
                                    <p className="text-caption text-fg-subtle mt-0.5">
                                        {upload.status === "uploading" && `Uploading... ${upload.progress}%`}
                                        {upload.status === "success" && "Upload complete"}
                                        {upload.status === "failed" && `Failed: ${upload.error}`}
                                    </p>
                                </div>
                                {upload.status === "uploading" && (
                                    <button
                                        onClick={() => cancelUpload(upload.id)}
                                        className="text-fg-subtle hover:text-danger-fg p-1 hover:bg-surface-hover rounded transition-all"
                                        title="Cancel Upload"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Progress Bar */}
                            {upload.status === "uploading" && (
                                <div className="w-full h-1.5 bg-surface-raised rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-info transition-all duration-300 rounded-full"
                                        style={{ width: `${upload.progress}%` }}
                                    ></div>
                                </div>
                            )}

                            {upload.status === "success" && (
                                <div className="w-full h-1.5 bg-success/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-success rounded-full w-full animate-pulse"></div>
                                </div>
                            )}

                            {upload.status === "failed" && (
                                <div className="w-full h-1.5 bg-danger/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-danger rounded-full w-full"></div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
