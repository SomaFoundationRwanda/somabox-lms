"use client";

// Guests may browse the catalogue, the library and public courses, but opening anything
// (a video, a book, a lesson, a course) needs an account: the files themselves are only
// served to signed-in people. requireAccount(next) returns true for signed-in people and,
// for guests, shows the "create a free account" prompt and remembers `next` so they come
// back to it after signing up (and the profile step) or logging in.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { rememberNext, safeNext } from "@/lib/session";

const GuestGateContext = createContext(null);

const currentPath = () =>
    typeof window === "undefined" ? "" : window.location.pathname + window.location.search;

/** Links to the sign-up and login pages that bring the person back to `next`. */
export function authLinks(next) {
    const target = safeNext(next);
    const query = target ? `?next=${encodeURIComponent(target)}` : "";
    return { signup: `/signup${query}`, login: `/${query}` };
}

/** The prompt's content, used in the modal and inline (e.g. the /frame page). */
export function SignUpPrompt({ next, onDismiss, titleId = "guest-gate-title", autoFocus = false }) {
    const { t } = useLanguage();
    const target = next || currentPath();
    const links = authLinks(target);
    const signUpRef = useRef(null);

    useEffect(() => {
        if (autoFocus) signUpRef.current?.focus();
    }, [autoFocus]);

    const remember = () => rememberNext(target);

    return (
        <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 sm:p-8 text-center">
            {onDismiss ? (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={t("guest.close")}
                    className="absolute top-3 right-3 p-2 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                >
                    <X className="w-4 h-4" aria-hidden="true" />
                </button>
            ) : null}
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#203A3A] flex items-center justify-center mx-auto mb-4">
                <LockKeyhole className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 id={titleId} className="text-xl font-bold text-slate-900 leading-snug">
                {t("guest.gateTitle")}
            </h2>
            <p className="text-sm text-slate-600 mt-2">{t("guest.gateWhy")}</p>
            <p className="text-xs text-slate-500 mt-1">{t("guest.gateReturn")}</p>
            <div className="mt-6 flex flex-col gap-2.5">
                <a
                    ref={signUpRef}
                    href={links.signup}
                    onClick={remember}
                    className="w-full h-11 rounded-xl bg-[#203A3A] hover:bg-black text-white text-[15px] font-bold flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#203A3A]"
                >
                    {t("guest.signUp")}
                </a>
                <a
                    href={links.login}
                    onClick={remember}
                    className="w-full h-11 rounded-xl border-2 border-slate-300 hover:border-slate-400 text-slate-800 text-[15px] font-bold flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#203A3A]"
                >
                    {t("guest.haveAccount")}
                </a>
                {onDismiss ? (
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="text-sm font-semibold text-slate-500 hover:text-slate-800 mt-1"
                    >
                        {t("guest.notNow")}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function SignUpModal({ next, onClose }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        const previous = document.activeElement;
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            if (previous && typeof previous.focus === "function") previous.focus();
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[2000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="guest-gate-title"
                className="w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <SignUpPrompt next={next} onDismiss={onClose} autoFocus />
            </div>
        </div>
    );
}

export function GuestGateProvider({ children }) {
    const { authenticated } = useContext(DataContext);
    const [pendingNext, setPendingNext] = useState(null);

    const requireAccount = useCallback((next) => {
        if (authenticated) return true;
        setPendingNext(safeNext(next) || currentPath());
        return false;
    }, [authenticated]);

    const close = useCallback(() => setPendingNext(null), []);
    const value = useMemo(() => ({ isGuest: !authenticated, requireAccount }), [authenticated, requireAccount]);

    return (
        <GuestGateContext.Provider value={value}>
            {children}
            {pendingNext !== null && !authenticated ? <SignUpModal next={pendingNext} onClose={close} /> : null}
        </GuestGateContext.Provider>
    );
}

/**
 * { isGuest, requireAccount(next) }. Outside a GuestGateProvider, guests are sent to the
 * login page (with ?next=) instead of seeing the prompt.
 */
export function useGuestGate() {
    const gate = useContext(GuestGateContext);
    const { authenticated } = useContext(DataContext);
    const fallback = useCallback((next) => {
        if (authenticated) return true;
        const target = safeNext(next) || currentPath();
        rememberNext(target);
        window.location.href = authLinks(target).login;
        return false;
    }, [authenticated]);
    return gate || { isGuest: !authenticated, requireAccount: fallback };
}
