"use client";

// Files load in <video>, <img>, <iframe> and the book readers with the HttpOnly media cookie
// (see lib/session.js). useMediaAccess checks a backend file before an <iframe> shows it
// (iframes can't report a 401) and, when a <video>/<img> fails, works out whether the cookie
// ran out: it renews it once and reloads the element, or asks the person to sign in again.
import { useCallback, useContext, useEffect, useState } from "react";
import { LogIn, ShieldAlert } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { checkMediaAccess, clearSession, isBackendUrl, loginUrlWithNext } from "@/lib/session";
import { SignUpPrompt } from "@/components/guest/GuestGate";
import Loader from "@/components/ui/Loader";

/**
 * state: "checking" | "ok" | "expired" | "forbidden" | "guest". With precheck=false the file
 * is shown straight away and only checked when the element reports an error (onMediaError).
 * reloadKey changes after a renewal; use it as the element's key so it loads again.
 * With preview=true (a visitor's preview, see Preview.jsx) a visitor's file is shown ("ok"): the
 * box serves it during the preview, and the player handles the end of it.
 */
export function useMediaAccess(url, { active = true, precheck = true, preview = false } = {}) {
    const { authenticated, authLoading } = useContext(DataContext);
    const [state, setState] = useState(precheck ? "checking" : "ok");
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!active || !url || authLoading) return undefined;
        if (!isBackendUrl(url)) { setState("ok"); return undefined; }
        if (!authenticated) { setState(preview ? "ok" : "guest"); return undefined; }
        if (!precheck) { setState("ok"); return undefined; }
        let cancelled = false;
        setState("checking");
        checkMediaAccess(url).then((result) => {
            if (cancelled) return;
            setState(result === "expired" || result === "forbidden" ? result : "ok");
        });
        return () => { cancelled = true; };
    }, [url, active, precheck, preview, authenticated, authLoading]);

    const onMediaError = useCallback(async () => {
        if (!url || !isBackendUrl(url)) return;
        if (!authenticated) { if (!preview) setState("guest"); return; }
        const result = await checkMediaAccess(url);
        if (result === "renewed") setReloadKey((k) => k + 1);
        else if (result === "expired" || result === "forbidden") setState(result);
    }, [url, authenticated, preview]);

    return { state, onMediaError, reloadKey };
}

/** What a viewer shows instead of a broken player. tone="dark" for black player backgrounds. */
export function MediaAccessNotice({ state, next, tone = "light", compact = false }) {
    const { t } = useLanguage();
    const dark = tone === "dark";

    if (state === "checking") {
        return (
            // The SOMABOX loader while the file is checked; white on the black player.
            <Loader
                variant="page"
                size={56}
                className="h-full min-h-[8rem]"
                color={dark ? "#ffffff" : undefined}
                label={t("guest.openingFile")}
            />
        );
    }

    if (state === "guest") {
        return (
            <div className="w-full h-full flex items-center justify-center p-4">
                <SignUpPrompt next={next} titleId="media-guest-title" />
            </div>
        );
    }

    if (state === "forbidden") {
        return (
            <div className={`w-full h-full min-h-[8rem] flex flex-col items-center justify-center gap-2 p-4 text-center ${dark ? "text-white" : "text-slate-700"}`} role="alert">
                <ShieldAlert className="w-7 h-7 text-amber-500" aria-hidden="true" />
                <p className="text-sm font-semibold">{t("guest.mediaForbidden")}</p>
            </div>
        );
    }

    if (state !== "expired") return null;

    const signInAgain = () => {
        clearSession();
        window.location.href = loginUrlWithNext(next);
    };

    return (
        <div className={`w-full h-full ${compact ? "min-h-[8rem]" : "min-h-[14rem]"} flex items-center justify-center p-4`} role="alert">
            <div className={`max-w-sm text-center rounded-2xl p-6 ${dark ? "bg-white/10 text-white" : "bg-white border border-slate-200 text-slate-800 shadow-sm"}`}>
                <LogIn className={`w-7 h-7 mx-auto mb-3 ${dark ? "text-teal-300" : "text-[var(--brand-primary)]"}`} aria-hidden="true" />
                <p className="font-bold leading-snug">{t("guest.mediaExpiredTitle")}</p>
                {!compact ? (
                    <p className={`text-sm mt-1.5 ${dark ? "text-white/75" : "text-slate-600"}`}>{t("guest.mediaExpiredBody")}</p>
                ) : null}
                <button
                    type="button"
                    onClick={signInAgain}
                    className="mt-4 h-10 px-5 rounded-xl bg-[var(--brand-primary)] hover:bg-black text-white text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-400"
                >
                    {t("guest.signInAgain")}
                </button>
            </div>
        </div>
    );
}
