"use client";

// AI summaries of Explore and Library files (books, and videos/recordings with a transcript).
// GET  /content/summary?path=<path_key> → { enabled, available, reason, language, status, summary, ... }
// POST /content/summary { path }        → asks the box to make it (once per file and language,
//                                          shared with everyone). Learners have a daily limit.
// PATCH/DELETE /content/summary          → admins hide it from learners, or remove it to make it again.
// Making one takes minutes on the box, so the panel polls while it's queued or running and never
// blocks reading or watching.
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, EyeOff, Eye, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useGuestGate } from "@/components/guest/GuestGate";
import { fill } from "@/lib/fill";
import { FOCUS_RING } from "@/lib/a11y";
import Loader from "@/components/ui/Loader";
import { apiFetch, getErrorMessage } from "@/lib/api";

const POLL_MS = 5000;
const ACTIVE = ["queued", "running"];
const STAFF_ROLES = ["admin", "teacher", "ta"];

const messageOf = (data, fallback) => data?.message || data?.error || fallback;

/**
 * Loads (and keeps polling) the summary state of one file for the signed-in person.
 * Returns { data, loading, loadError, busy, actionError, staff, isAdmin, request, reload, setHidden, remake }.
 */
export function useContentSummary(pathKey, { active = true } = {}) {
    const { SERVER_URL, authenticated, role } = useContext(DataContext);
    const { t } = useLanguage();
    const staff = STAFF_ROLES.includes(role);
    const isAdmin = role === "admin";
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null); // { message, code }
    const [tick, setTick] = useState(0);
    const hasData = useRef(false);

    const canFetch = Boolean(active && pathKey && authenticated && SERVER_URL);
    const getUrl = canFetch ? `/content/summary?path=${encodeURIComponent(pathKey)}` : "";

    useEffect(() => {
        hasData.current = false;
        setData(null);
        setLoadError("");
        setActionError(null);
    }, [pathKey]);

    useEffect(() => {
        if (!getUrl) return undefined;
        let alive = true;
        let timer = null;
        const run = async (first) => {
            if (first && !hasData.current) setLoading(true);
            // While a summary is being made (and only then), it's checked again every few seconds.
            try {
                const json = await apiFetch(getUrl);
                if (!alive) return;
                hasData.current = true;
                setLoadError("");
                setData(json);
                if (ACTIVE.includes(json?.status)) timer = setTimeout(() => run(false), POLL_MS);
            } catch (err) {
                if (!alive) return;
                if (err?.status === 404) {
                    // Not a file the person can see: show nothing.
                    hasData.current = true;
                    setData({ enabled: false, status: "none" });
                    setLoadError("");
                } else {
                    setLoadError(err?.status === 0 ? getErrorMessage(err, t) : messageOf(err?.body, t("explore.summary.loadFailed")));
                }
            } finally {
                if (alive && first) setLoading(false);
            }
        };
        run(true);
        return () => { alive = false; clearTimeout(timer); };
        // t only changes the fallback text; don't refetch for it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getUrl, tick]);

    const reload = useCallback(() => setTick((n) => n + 1), []);

    const send = useCallback(async (method, body) => {
        setBusy(true);
        setActionError(null);
        try {
            const json = (await apiFetch("/content/summary", { method, json: body })) ?? null;
            return { ok: true, data: json };
        } catch (error) {
            if (error?.status === 0) {
                setActionError({ message: getErrorMessage(error, t), code: "" });
                return { ok: false, data: null };
            }
            const json = error?.body || null;
            const err = { message: messageOf(json, t("explore.summary.actionFailed")), code: json?.code || "" };
            setActionError(err);
            if (err.code === "SUMMARIES_OFF") setData((d) => ({ ...(d || {}), enabled: false }));
            return { ok: false, data: json };
        } finally {
            setBusy(false);
        }
    }, [t]);

    const request = useCallback(async () => {
        const out = await send("POST", { path: pathKey });
        if (out.ok && out.data) {
            hasData.current = true;
            setData((d) => ({ ...(d || {}), ...out.data }));
            reload(); // starts polling while it's being made
        }
    }, [send, pathKey, reload]);

    const setHidden = useCallback(async (hidden) => {
        const out = await send("PATCH", { path: pathKey, hidden, ...(data?.language ? { language: data.language } : {}) });
        if (out.ok) setData((d) => ({ ...(d || {}), hidden }));
    }, [send, pathKey, data?.language]);

    const remake = useCallback(async () => {
        const out = await send("DELETE", { path: pathKey });
        if (out.ok) reload();
    }, [send, pathKey, reload]);

    return { data, loading, loadError, busy, actionError, staff, isAdmin, request, reload, setHidden, remake };
}

/** Whether a "Summary" button should be offered at all for this state. */
export function summaryOffered(state) {
    const d = state?.data;
    if (!d || !d.enabled || d.status === "hidden") return false;
    return Boolean(d.available) || state.staff || (d.status && d.status !== "none");
}

/** A small button that opens/closes the summary panel; renders nothing when there's no summary to offer. */
export function SummaryToggleButton({ state, open, onToggle, className = "", controls }) {
    const { t } = useLanguage();
    const { isGuest } = useGuestGate();
    if (isGuest || !summaryOffered(state)) return null;
    const making = ACTIVE.includes(state.data?.status);
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={controls}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-ui font-bold transition-colors ${FOCUS_RING} ${className}`}
        >
            {making ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
            {t("explore.summary.button")}
        </button>
    );
}

function Disclaimer({ sampled }) {
    const { t } = useLanguage();
    return (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-caption text-warning-fg">
            <p className="font-bold">{t("explore.summary.disclaimer")}</p>
            {sampled ? <p className="mt-0.5">{t("explore.summary.sampled")}</p> : null}
        </div>
    );
}

function Progress({ data }) {
    const { t } = useLanguage();
    const total = Number(data?.partsTotal) || 0;
    const read = Math.min(Number(data?.partsRead) || 0, total || Infinity);
    const queued = data?.status === "queued";
    const ahead = Number(data?.position) || 0;
    const label = queued
        ? (ahead > 0 ? fill(t(ahead === 1 ? "explore.summary.oneAhead" : "explore.summary.nAhead"), { n: ahead }) : t("explore.summary.startingSoon"))
        : (total > 0 ? fill(t("explore.summary.readingPart"), { x: Math.max(1, read), y: total }) : t("explore.summary.reading"));
    return (
        <div className="space-y-2" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-ui font-semibold text-fg">
                <Loader2 className="w-4 h-4 animate-spin text-brand-fg" aria-hidden="true" />
                {label}
            </p>
            {!queued && total > 0 ? (
                <div className="h-2 w-full rounded-full bg-line overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-brand transition-all" style={{ width: `${Math.round((read / total) * 100)}%` }} />
                </div>
            ) : null}
            <p className="text-caption text-fg-muted">{t("explore.summary.keepGoing")}</p>
        </div>
    );
}

/**
 * The summary of one file. `pathKey` is the file's path_key (Explore item `slug`, Library
 * `path_key`). Pass `state` from useContentSummary to share it with a toggle button; otherwise
 * the panel loads it itself. `adminControls` adds Hide/Show and Make again for admins.
 */
export default function SummaryPanel({ pathKey, state: given, adminControls = false, onClose, headingId = "summary-panel-title", className = "" }) {
    const { t } = useLanguage();
    const { isGuest, requireAccount } = useGuestGate();
    const own = useContentSummary(pathKey, { active: !given && !isGuest });
    const s = given || own;
    const d = s.data;

    const header = (
        <div className="flex items-start justify-between gap-2">
            <h2 id={headingId} className="flex items-center gap-2 text-item font-extrabold text-fg">
                <Sparkles className="w-4 h-4 text-brand-fg" aria-hidden="true" />
                {t("explore.summary.title")}
            </h2>
            {onClose ? (
                <button type="button" onClick={onClose} aria-label={t("explore.summary.close")}
                    className={`p-2 -m-1 rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg ${FOCUS_RING}`}>
                    <X className="w-4 h-4" aria-hidden="true" />
                </button>
            ) : null}
        </div>
    );

    const wrap = (children) => (
        <section aria-labelledby={headingId} className={`space-y-3 text-fg ${className}`}>
            {header}
            {children}
        </section>
    );

    // Guests: asking for a summary needs an account.
    if (isGuest) {
        return wrap(
            <>
                <p className="text-ui text-fg-muted">{t("explore.summary.intro")}</p>
                <button type="button" onClick={() => requireAccount()}
                    className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-ui font-bold ${FOCUS_RING}`}>
                    <Sparkles className="w-4 h-4" aria-hidden="true" /> {t("explore.summary.get")}
                </button>
            </>
        );
    }

    if (s.loading && !d) {
        return wrap(
            <Loader variant="page" size={40} className="min-h-[8rem]" label={t("explore.summary.loading")} />
        );
    }

    if (s.loadError && !d) {
        return wrap(
            <div role="alert" className="space-y-2">
                <p className="flex items-start gap-2 text-ui font-semibold text-danger-fg">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {s.loadError}
                </p>
                <button type="button" onClick={s.reload} className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-line-strong text-ui font-bold hover:bg-surface-hover ${FOCUS_RING}`}>
                    <RotateCcw className="w-4 h-4" aria-hidden="true" /> {t("explore.summary.tryAgain")}
                </button>
            </div>
        );
    }

    if (!d) return null;

    // Switched off by the admin: learners see nothing; staff get a quiet note.
    if (!d.enabled) {
        return s.staff && adminControls ? wrap(<p className="text-ui text-fg-muted">{t("explore.summary.offForStaff")}</p>) : null;
    }
    if (d.status === "hidden") return null;

    // This file can't be summarised (e.g. a video without a transcript): staff see why.
    if (!d.available && (!d.status || d.status === "none")) {
        return s.staff ? wrap(<p className="text-ui text-fg-muted">{d.reason || t("explore.summary.notAvailable")}</p>) : null;
    }

    const actionError = s.actionError ? (
        <p role="alert" className="flex items-start gap-2 text-ui font-semibold text-danger-fg">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {s.actionError.message}
        </p>
    ) : null;

    const adminBar = adminControls && s.isAdmin && d.status && d.status !== "none" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {d.hidden ? (
                <span className="px-2 py-0.5 rounded bg-line text-fg text-caption font-bold">{t("explore.summary.hiddenBadge")}</span>
            ) : null}
            {d.status === "done" ? (
                <button type="button" disabled={s.busy} onClick={() => s.setHidden(!d.hidden)}
                    className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-line-strong text-ui font-bold hover:bg-surface-hover disabled:opacity-50 ${FOCUS_RING}`}>
                    {d.hidden ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
                    {d.hidden ? t("explore.summary.showToLearners") : t("explore.summary.hideFromLearners")}
                </button>
            ) : null}
            {d.status !== "running" ? (
                <button type="button" disabled={s.busy} onClick={s.remake}
                    className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-line-strong text-ui font-bold hover:bg-surface-hover disabled:opacity-50 ${FOCUS_RING}`}>
                    <RotateCcw className="w-4 h-4" aria-hidden="true" /> {t("explore.summary.makeAgain")}
                </button>
            ) : null}
            <p className="w-full text-caption text-fg-muted">{t("explore.summary.makeAgainHelp")}</p>
        </div>
    ) : null;

    if (!d.status || d.status === "none") {
        return wrap(
            <>
                <p className="text-ui text-fg-muted">{t("explore.summary.intro")}</p>
                {d.available ? (
                    <button type="button" disabled={s.busy} onClick={s.request}
                        className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-ui font-bold disabled:opacity-60 ${FOCUS_RING}`}>
                        {s.busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                        {t("explore.summary.get")}
                    </button>
                ) : null}
                {actionError}
            </>
        );
    }

    if (ACTIVE.includes(d.status)) {
        return wrap(<><Progress data={d} />{adminBar}</>);
    }

    if (d.status === "failed") {
        return wrap(
            <>
                <div role="alert" className="space-y-1">
                    <p className="flex items-start gap-2 text-ui font-semibold text-danger-fg">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {t("explore.summary.failed")}
                    </p>
                    {d.error ? <p className="text-caption text-fg-muted">{d.error}</p> : null}
                </div>
                <button type="button" disabled={s.busy} onClick={s.request}
                    className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-ui font-bold disabled:opacity-60 ${FOCUS_RING}`}>
                    {s.busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="w-4 h-4" aria-hidden="true" />}
                    {t("explore.summary.tryAgain")}
                </button>
                {actionError}
                {adminBar}
            </>
        );
    }

    // done
    const sum = d.summary || {};
    const keyPoints = Array.isArray(sum.keyPoints) ? sum.keyPoints.filter(Boolean) : [];
    const questions = Array.isArray(sum.questions) ? sum.questions.filter(Boolean) : [];
    return wrap(
        <>
            <Disclaimer sampled={sum.sampled} />
            {sum.overview ? <p className="text-ui leading-relaxed text-fg whitespace-pre-line">{sum.overview}</p> : null}
            {keyPoints.length ? (
                <div>
                    <h3 className="text-ui font-extrabold text-fg mb-1">{t("explore.summary.keyPoints")}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-ui text-fg">
                        {keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                </div>
            ) : null}
            {questions.length ? (
                <div>
                    <h3 className="text-ui font-extrabold text-fg mb-1">{t("explore.summary.thinkAbout")}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-ui text-fg">
                        {questions.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                </div>
            ) : null}
            {actionError}
            {adminBar}
        </>
    );
}
