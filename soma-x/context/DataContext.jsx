"use client"
import { createContext, useEffect, useState, useCallback } from "react";
import { X, AlertCircle, CheckCircle2, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const DataContext = createContext();

export default DataContext

// Helper functions for basic obfuscation
const shiftString = (str) => {
    if (!str) return '';
    return str.split('').map(ch => {
        if (/[a-z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 97 + 1) % 26 + 97);
        } else if (/[A-Z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 65 + 1) % 26 + 65);
        }
        return ch;
    }).join('');
}

const unshiftString = (str) => {
    if (!str) return '';
    return str.split('').map(ch => {
        if (/[a-z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 97 + 25) % 26 + 97);
        } else if (/[A-Z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 65 + 25) % 26 + 65);
        }
        return ch;
    }).join('');
}

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
    const [summaryData, setSummaryData] = useState(null);
    const [mainCategories, setMainCategories] = useState(null);
    const [customContentSummary, setCustomContentSummary] = useState(null);
    const [role, setRole] = useState("");
    const [authenticated, setAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [isDark, setIsDark] = useState(false);
    const [brightness, setBrightnessState] = useState(100);
    // Guards against hydration mismatch (#418): components using isDark/
    // authenticated won't render browser-specific content until after mount.
    const [mounted, setMounted] = useState(false);

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    // Fetch shared content data on mount
    useEffect(() => {
        const loadAllData = async () => {
            try {
                const summaryRes = await fetch(`${SERVER_URL}/content/levels/summary`);
                if (summaryRes.ok) setSummaryData(await summaryRes.json());

                const categoriesRes = await fetch(`${SERVER_URL}/content/main-categories`);
                if (categoriesRes.ok) setMainCategories(await categoriesRes.json());

                const customSummaryRes = await fetch(`${SERVER_URL}/content/custom-content/summary`);
                if (customSummaryRes.ok) setCustomContentSummary(await customSummaryRes.json());
            } catch (error) {
                console.error("Data fetching error:", error);
            }
        };

        loadAllData();
    }, [SERVER_URL]);

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

    // Auth + theme — runs only on the client after mount
    useEffect(() => {
        const storedAl = localStorage.getItem('al');
        const storedGh = localStorage.getItem('gh');

        if (storedAl && storedGh) {
            try {
                const decryptedRole = unshiftString(storedGh);
                const allowedRoles = ['admin', 'teacher', 'scholar'];
                if (allowedRoles.includes(decryptedRole)) {
                    setRole(storedGh);
                    setAuthenticated(true);
                }
            } catch {
                // invalid stored value — stay unauthenticated
            }
        }

        setAuthLoading(false);

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

    const logout = useCallback(() => {
        localStorage.removeItem('al');
        localStorage.removeItem('gh');
        setAuthenticated(false);
        setRole("");
        window.location.href = '/';
    }, []);

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
            xhr: null
        };

        const xhr = new XMLHttpRequest();
        xhr.open(method, url);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: percent } : u));
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100, status: "success" } : u));
                if (typeof document !== "undefined") {
                    document.dispatchEvent(new CustomEvent("lesson-uploaded", { detail: { classId } }));
                }
                setTimeout(() => {
                    setUploads(prev => prev.filter(u => u.id !== uploadId));
                }, 6000);
            } else {
                let errMsg = "Upload failed";
                try {
                    const payload = JSON.parse(xhr.responseText);
                    errMsg = payload.message || errMsg;
                } catch (e) {}
                setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "failed", error: errMsg } : u));
            }
        };

        xhr.onerror = () => {
            setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "failed", error: "Network error during upload" } : u));
        };

        newUpload.xhr = xhr;
        setUploads(prev => [...prev, newUpload]);
        xhr.send(formData);
    }, []);

    const cancelUpload = useCallback((uploadId) => {
        setUploads(prev => {
            const upload = prev.find(u => u.id === uploadId);
            if (upload && upload.xhr) {
                upload.xhr.abort();
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
        setSummaryData,
        mainCategories,
        setMainCategories,
        customContentSummary,
        setCustomContentSummary,
        authenticated,
        setAuthenticated,
        authLoading,
        isDark,
        toggleDark,
        brightness,
        setBrightness,
        role,
        setRole,
        shiftString,
        unshiftString,
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
        <div className="fixed bottom-6 right-6 z-[9999] w-80 bg-slate-900/90 dark:bg-slate-950/95 text-white rounded-2xl shadow-2xl border border-slate-700/50 backdrop-blur-md overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 dark:bg-slate-900/80 border-b border-slate-700/50 select-none">
                <div className="flex items-center gap-2">
                    {activeCount > 0 ? (
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="font-semibold text-sm">
                        {activeCount > 0 ? `Uploading (${activeCount})` : "Uploads complete"}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setIsMinimized(prev => !prev)}
                        className="p-1 hover:bg-white/10 rounded-md transition-colors"
                        title={isMinimized ? "Expand" : "Collapse"}
                    >
                        {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* List */}
            {!isMinimized && (
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-850 p-3 space-y-3">
                    {uploads.map((upload) => (
                        <div key={upload.id} className="space-y-2 pt-2 first:pt-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate text-slate-200" title={upload.title}>
                                        {upload.title}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {upload.status === "uploading" && `Uploading... ${upload.progress}%`}
                                        {upload.status === "success" && "Upload complete"}
                                        {upload.status === "failed" && `Failed: ${upload.error}`}
                                    </p>
                                </div>
                                {upload.status === "uploading" && (
                                    <button
                                        onClick={() => cancelUpload(upload.id)}
                                        className="text-slate-400 hover:text-red-400 p-1 hover:bg-white/5 rounded transition-all"
                                        title="Cancel Upload"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Progress Bar */}
                            {upload.status === "uploading" && (
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                                        style={{ width: `${upload.progress}%` }}
                                    ></div>
                                </div>
                            )}

                            {upload.status === "success" && (
                                <div className="w-full h-1.5 bg-emerald-500/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full w-full animate-pulse"></div>
                                </div>
                            )}

                            {upload.status === "failed" && (
                                <div className="w-full h-1.5 bg-red-500/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 rounded-full w-full"></div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
