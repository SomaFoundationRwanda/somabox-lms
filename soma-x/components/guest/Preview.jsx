"use client";

// Visitor previews: when the school allows it (School page), people without an account can open
// a few Explore and Library items (video, audio, PDF, EPUB) for a short time before they are
// asked to sign up. POST /content/preview starts the preview on the box (which then serves the
// file to this visitor for that long, and only the start of videos and audio); the player or
// reader counts down and shows the sign-up panel when the time is up.
//
// Web lessons in the frame and anything in courses are not previewable: they keep the sign-up
// prompt (useGuestGate().requireAccount).
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Clock, LockKeyhole } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useSchool } from "@/context/SchoolContext";
import { authLinks, useGuestGate } from "@/components/guest/GuestGate";
import { rememberNext } from "@/lib/session";
import { fill } from "@/lib/fill";

const PREVIEWABLE = new Set(["video", "audio", "book", "pdf", "document", "epub"]);

/** "0:32" */
export const formatPreviewTime = (seconds) => {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * open(path, next, type) → { ok, preview }. Signed-in people get { ok: true, preview: null }.
 * Visitors get a preview ({ seconds, secondsLeft, remainingItems, next }) when the school allows
 * it and they have items left; otherwise the sign-up prompt is shown (with the box's reason) and
 * ok is false. `starting` is true while the box is asked.
 */
export function useGuestPreview() {
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
    const { authenticated } = useContext(DataContext);
    const { school, loaded } = useSchool();
    const { requireAccount } = useGuestGate();
    const { t } = useLanguage();
    const [starting, setStarting] = useState(false);
    const busy = useRef(false);

    const open = useCallback(async (path, next, type) => {
        if (authenticated) return { ok: true, preview: null };
        // Before the school's settings arrive, let the box decide (it answers PREVIEW_OFF if off).
        if ((loaded && !school.guestPreview.enabled) || !path || (type && !PREVIEWABLE.has(type))) {
            requireAccount(next);
            return { ok: false, preview: null };
        }
        if (busy.current) return { ok: false, preview: null };
        busy.current = true;
        setStarting(true);
        try {
            const res = await fetch(`${SERVER_URL}/content/preview`, {
                method: "POST",
                credentials: "include", // keeps the visitor cookie the box uses to count previews
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                // PREVIEW_LIMIT / PREVIEW_ENDED / PREVIEW_OFF: the sign-up prompt, with the box's words.
                requireAccount(next, { message: data?.message || t("guest.previewFailed") });
                return { ok: false, preview: null };
            }
            if (data?.signedIn) return { ok: true, preview: null };
            const seconds = Number(data?.seconds) || school.guestPreview.seconds;
            const secondsLeft = Number.isFinite(Number(data?.secondsLeft)) ? Number(data.secondsLeft) : seconds;
            return {
                ok: true,
                preview: { seconds, secondsLeft, remainingItems: data?.remainingItems ?? null, next, startedAt: Date.now() },
            };
        } catch {
            requireAccount(next, { message: t("guest.previewFailed") });
            return { ok: false, preview: null };
        } finally {
            busy.current = false;
            setStarting(false);
        }
    }, [SERVER_URL, authenticated, loaded, school.guestPreview.enabled, school.guestPreview.seconds, requireAccount, t]);

    return { open, starting };
}

/**
 * Counts down a preview while `running` (playback for video/audio, open time for books).
 * Returns { left, ended, end() }; end() finishes it early (e.g. the box stopped sending the file).
 */
export function usePreview(preview, running) {
    // `left` belongs to one preview; a new preview starts from its own time (no flash of "ended").
    const [state, setState] = useState({ preview, left: preview ? preview.secondsLeft : 0, forced: false });
    const used = useRef(0);
    const last = useRef(null);
    const current = state.preview === preview ? state : { preview, left: preview ? preview.secondsLeft : 0, forced: false };

    useEffect(() => {
        used.current = 0;
        last.current = null;
        setState({ preview, left: preview ? preview.secondsLeft : 0, forced: false });
    }, [preview]);

    const done = current.forced || current.left <= 0;
    useEffect(() => {
        if (!preview || !running || done) return undefined;
        last.current = performance.now();
        const tick = () => {
            const now = performance.now();
            used.current += (now - (last.current ?? now)) / 1000;
            last.current = now;
            const left = Math.max(0, preview.secondsLeft - used.current);
            setState((s) => (s.preview === preview ? { ...s, left } : s));
        };
        const id = window.setInterval(tick, 250);
        return () => {
            window.clearInterval(id);
            tick();
            last.current = null;
        };
    }, [preview, running, done]);

    const previewRef = useRef(preview);
    previewRef.current = preview;
    const end = useCallback(() => setState((s) => ({ ...s, preview: previewRef.current, forced: true })), []);
    return { left: current.forced ? 0 : current.left, ended: Boolean(preview) && done, end };
}

/** "Preview · 0:32 left · Sign up to watch it all" — counts down while the preview runs. */
export function PreviewChip({ left, next, reading = false, tone = "dark" }) {
    const { t } = useLanguage();
    const links = authLinks(next);
    const dark = tone === "dark";
    return (
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-[12px] font-semibold ${dark ? "bg-amber-400 text-slate-950" : "bg-amber-50 text-amber-950 border-b border-amber-200"}`}>
            <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span role="timer" aria-live="off" className="tabular-nums">
                {fill(t("guest.previewChip"), { time: formatPreviewTime(left) })}
            </span>
            <span aria-hidden="true">·</span>
            <a href={links.signup} onClick={() => rememberNext(next)}
                className="font-bold underline underline-offset-2 hover:no-underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900">
                {t(reading ? "guest.previewSignUpRead" : "guest.previewSignUpWatch")}
            </a>
        </div>
    );
}

/** The panel over the player or reader when the preview has ended. It can't be dismissed. */
export function PreviewEndedPanel({ next, reading = false }) {
    const { t } = useLanguage();
    const links = authLinks(next);
    const signUpRef = useRef(null);
    useEffect(() => { signUpRef.current?.focus(); }, []);
    const remember = () => rememberNext(next);

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <div role="alertdialog" aria-modal="false" aria-labelledby="preview-ended-title" aria-describedby="preview-ended-why"
                className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 sm:p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[var(--brand-primary)] flex items-center justify-center mx-auto mb-4">
                    <LockKeyhole className="w-7 h-7" aria-hidden="true" />
                </div>
                <h2 id="preview-ended-title" className="text-xl font-bold text-slate-900 leading-snug">
                    {t(reading ? "guest.previewEndedRead" : "guest.previewEndedWatch")}
                </h2>
                <p id="preview-ended-why" className="text-sm text-slate-600 mt-2">{t("guest.gateWhy")}</p>
                <p className="text-xs text-slate-500 mt-1">{t("guest.gateReturn")}</p>
                <div className="mt-6 flex flex-col gap-2.5">
                    <a ref={signUpRef} href={links.signup} onClick={remember}
                        className="w-full h-11 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white text-[15px] font-bold flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand-secondary)]">
                        {t("guest.signUp")}
                    </a>
                    <a href={links.login} onClick={remember}
                        className="w-full h-11 rounded-xl border-2 border-slate-300 hover:border-slate-400 text-slate-800 text-[15px] font-bold flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand-secondary)]">
                        {t("guest.haveAccount")}
                    </a>
                </div>
            </div>
        </div>
    );
}
