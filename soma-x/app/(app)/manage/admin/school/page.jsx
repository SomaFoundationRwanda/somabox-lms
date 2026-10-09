"use client";

import { useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, ArrowLeft, Check, ImageUp, Info, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader, Section } from "@/components/layout";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, isHexColor, useSchool } from "@/context/SchoolContext";
import Unauthorized from "@/components/sections/Unauthorized";
import { Button } from "@/components/ui/button";
import { RWANDA_LOCATIONS, OTHER_PROVINCE } from "@/lib/rwandaLocations";
import { fill } from "@/lib/fill";
import { FOCUS_RING } from "@/lib/a11y";
import Loader from "@/components/ui/Loader";

// One box serves one school. Everything about it is set here (GET/PUT /school): its name and
// learner-code prefix, its location (applied to every learner and teacher, who are never asked),
// its look (logo and colours, shown to everyone including visitors) and visitor previews.

const CODE_RE = /^[A-Z0-9]{2,8}$/;
const INPUT = `w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white ${FOCUS_RING}`;
const LABEL = "block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1";
const HELP = "mt-1 text-xs text-slate-600 dark:text-slate-400";
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

const ruralToValue = (v) => (v === true ? "rural" : v === false ? "urban" : "unset");
const valueToRural = (v) => (v === "rural" ? true : v === "urban" ? false : null);

// Contrast of white text on a colour (WCAG). Under 4.5 the colour is too light for white text.
function whiteContrast(hex) {
    if (!isHexColor(hex)) return 21;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return 1.05 / (lum + 0.05);
}

function Message({ msg }) {
    if (!msg?.text) return null;
    const error = msg.type === "error";
    return (
        <p role={error ? "alert" : "status"}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${error
                ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
            {error ? <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
            {msg.text}
        </p>
    );
}

function ColourField({ id, label, help, value, onChange, t }) {
    const valid = isHexColor(value);
    const lowContrast = valid && whiteContrast(value) < 4.5;
    return (
        <div>
            <label htmlFor={`${id}-hex`} className={LABEL}>{label}</label>
            <div className="flex items-center gap-2">
                <input type="color" value={(valid ? value : DEFAULT_PRIMARY).toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())}
                    aria-label={label} className={`w-11 h-11 shrink-0 rounded-xl cursor-pointer border border-slate-300 dark:border-slate-700 bg-white p-1 ${FOCUS_RING}`} />
                <input id={`${id}-hex`} type="text" value={value} maxLength={7} spellCheck={false} autoCapitalize="characters"
                    onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
                    aria-invalid={!valid} aria-describedby={`${id}-help${lowContrast ? ` ${id}-warn` : ""}`}
                    className={`${INPUT} font-mono uppercase`} />
            </div>
            <p id={`${id}-help`} className={HELP}>{valid ? help : t("school.settings.colourInvalid")}</p>
            {lowContrast && (
                <p id={`${id}-warn`} className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">{t("school.settings.lowContrast")}</p>
            )}
        </div>
    );
}

export default function SchoolSettingsPage() {
    const { SERVER_URL, authenticated, role } = useContext(DataContext);
    const { t } = useLanguage();
    const { refreshSchool } = useSchool();
    const isAdmin = role === "admin";

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: "", text: "" });
    const [savedCode, setSavedCode] = useState("");
    const [nextNumber, setNextNumber] = useState(null);
    const [form, setForm] = useState({
        name: "", code: "", province: "", district: "", rural: "unset",
        primaryColor: DEFAULT_PRIMARY, secondaryColor: DEFAULT_SECONDARY,
        previewEnabled: true, previewSeconds: "40", previewItems: "5",
    });
    const [logoUrl, setLogoUrl] = useState(null);
    const [logoBusy, setLogoBusy] = useState(false);
    const [logoMsg, setLogoMsg] = useState({ type: "", text: "" });
    const fileRef = useRef(null);

    const applySettings = (data) => {
        setForm({
            name: data?.name || "",
            code: data?.code || "",
            province: data?.province || "",
            district: data?.district || "",
            rural: ruralToValue(data?.isRural),
            primaryColor: isHexColor(data?.primaryColor) ? data.primaryColor.toUpperCase() : DEFAULT_PRIMARY,
            secondaryColor: isHexColor(data?.secondaryColor) ? data.secondaryColor.toUpperCase() : DEFAULT_SECONDARY,
            previewEnabled: data?.guestPreview?.enabled !== false,
            previewSeconds: String(data?.guestPreview?.seconds ?? 40),
            previewItems: String(data?.guestPreview?.items ?? 5),
        });
        setLogoUrl(data?.logoUrl || null);
        setSavedCode(data?.code || "");
        if (data?.nextLearnerNumber != null) setNextNumber(data.nextLearnerNumber);
    };

    useEffect(() => {
        if (!SERVER_URL || !isAdmin) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${SERVER_URL}/school`);
                const data = await res.json().catch(() => null);
                if (cancelled) return;
                if (!res.ok) {
                    setLoadError(data?.message || data?.error || t("school.settings.loadFailed"));
                    return;
                }
                applySettings(data);
            } catch (err) {
                if (!cancelled) setLoadError(err?.message || t("school.settings.loadFailed"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [SERVER_URL, isAdmin]);

    if (!authenticated || !isAdmin) return <Unauthorized />;

    const code = form.code.trim().toUpperCase();
    const codeValid = CODE_RE.test(code);
    const preview = codeValid && nextNumber != null ? `${code}-${String(nextNumber).padStart(4, "0")}` : "";
    const districts = form.province ? RWANDA_LOCATIONS[form.province] || [] : [];
    const isOther = form.province === OTHER_PROVINCE || (form.province && !RWANDA_LOCATIONS[form.province]);
    const seconds = Number(form.previewSeconds);
    const items = Number(form.previewItems);
    const secondsValid = Number.isInteger(seconds) && seconds >= 10 && seconds <= 600;
    const itemsValid = Number.isInteger(items) && items >= 1 && items <= 50;
    const coloursValid = isHexColor(form.primaryColor) && isHexColor(form.secondaryColor);
    const previewPrimary = isHexColor(form.primaryColor) ? form.primaryColor : DEFAULT_PRIMARY;
    const previewSecondary = isHexColor(form.secondaryColor) ? form.secondaryColor : DEFAULT_SECONDARY;

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSave = async (e) => {
        e.preventDefault();
        const problem = !codeValid ? t("school.settings.codeInvalid")
            : !coloursValid ? t("school.settings.colourInvalid")
                : form.previewEnabled && !secondsValid ? t("school.settings.secondsInvalid")
                    : form.previewEnabled && !itemsValid ? t("school.settings.itemsInvalid")
                        : "";
        if (problem) {
            setMsg({ type: "error", text: problem });
            return;
        }
        setSaving(true);
        setMsg({ type: "", text: "" });
        try {
            const body = {
                code,
                province: form.province,
                district: form.district.trim(),
                isRural: valueToRural(form.rural),
                primaryColor: form.primaryColor,
                secondaryColor: form.secondaryColor,
                guestPreview: form.previewEnabled
                    ? { enabled: true, seconds, items }
                    : { enabled: false },
            };
            // The name can't be emptied on the box; an empty field just leaves it as it is.
            if (form.name.trim()) body.name = form.name.trim();
            const res = await fetch(`${SERVER_URL}/school`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMsg({ type: "error", text: data?.message || data?.error || t("school.settings.saveFailed") });
                return;
            }
            applySettings(data);
            setMsg({ type: "ok", text: t("school.settings.saved") });
            // The whole app (sidebar, buttons, login page) takes the new look now.
            await refreshSchool();
        } catch (err) {
            setMsg({ type: "error", text: err?.message || t("school.settings.saveFailed") });
        } finally {
            setSaving(false);
        }
    };

    const uploadLogo = async (file) => {
        if (!file) return;
        if (!LOGO_TYPES.includes(file.type)) { setLogoMsg({ type: "error", text: t("school.settings.logoType") }); return; }
        if (file.size > LOGO_MAX_BYTES) { setLogoMsg({ type: "error", text: t("school.settings.logoTooBig") }); return; }
        setLogoBusy(true);
        setLogoMsg({ type: "", text: "" });
        try {
            const body = new FormData();
            body.append("logo", file);
            const res = await fetch(`${SERVER_URL}/school/logo`, { method: "POST", body });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setLogoMsg({ type: "error", text: data?.message || data?.error || t("school.settings.logoFailed") });
                return;
            }
            setLogoUrl(data?.logoUrl || null);
            setLogoMsg({ type: "ok", text: t("school.settings.logoUploaded") });
            await refreshSchool();
        } catch (err) {
            setLogoMsg({ type: "error", text: err?.message || t("school.settings.logoFailed") });
        } finally {
            setLogoBusy(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const removeLogo = async () => {
        setLogoBusy(true);
        setLogoMsg({ type: "", text: "" });
        try {
            const res = await fetch(`${SERVER_URL}/school/logo`, { method: "DELETE" });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setLogoMsg({ type: "error", text: data?.message || data?.error || t("school.settings.logoFailed") });
                return;
            }
            setLogoUrl(null);
            setLogoMsg({ type: "ok", text: t("school.settings.logoRemoved") });
            await refreshSchool();
        } catch (err) {
            setLogoMsg({ type: "error", text: err?.message || t("school.settings.logoFailed") });
        } finally {
            setLogoBusy(false);
        }
    };

    const logoSrc = logoUrl ? `${SERVER_URL}${logoUrl}` : null;
    const shownName = form.name.trim() || t("school.settings.namePlaceholder");

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto pb-24">
            <div className="mb-4">
                <Link href="/manage/admin" className={`inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white rounded ${FOCUS_RING}`}>
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("school.settings.back")}
                </Link>
            </div>

            <PageHeader
                eyebrow={t("school.settings.eyebrow")}
                title={t("school.settings.title")}
                description={t("school.settings.description")}
            />

            {loading ? (
                <Loader variant="page" size={56} className="min-h-[30vh]" label={t("school.loading")} />
            ) : loadError ? (
                <p role="alert" className="mt-6 flex items-start gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {loadError}
                </p>
            ) : (
                <form onSubmit={handleSave} className="mt-6 space-y-8" noValidate>
                    {/* ── School ── */}
                    <Section title={t("school.settings.sectionSchool")} description={t("school.settings.codeOnlyNew")}>
                        <div className="space-y-5">
                            <div>
                                <label htmlFor="school-name" className={LABEL}>{t("school.settings.name")}</label>
                                <input id="school-name" type="text" value={form.name} onChange={set("name")} className={INPUT}
                                    placeholder={t("school.settings.namePlaceholder")} autoComplete="organization" />
                            </div>

                            <div>
                                <label htmlFor="school-code" className={LABEL}>{t("school.settings.code")}</label>
                                <input id="school-code" type="text" value={form.code} maxLength={8}
                                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
                                    className={`${INPUT} font-mono uppercase tracking-wider max-w-[12rem]`}
                                    aria-describedby="school-code-help school-code-preview"
                                    aria-invalid={form.code !== "" && !codeValid}
                                    autoCapitalize="characters" spellCheck={false} />
                                <p id="school-code-help" className={HELP}>{t("school.settings.codeHelp")}</p>
                                <p id="school-code-preview" className="mt-1 text-sm text-slate-800 dark:text-slate-200" aria-live="polite">
                                    {preview
                                        ? (() => {
                                            const [before, after = ""] = String(t("school.settings.codePreview")).split("{example}");
                                            return <>{before}<span className="font-mono font-black">{preview}</span>{after}</>;
                                        })()
                                        : form.code ? <span className="text-rose-700 dark:text-rose-300">{t("school.settings.codeInvalid")}</span> : null}
                                </p>
                                {savedCode && code !== savedCode && codeValid && (
                                    <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                                        {fill(t("school.settings.codeChanging"), { old: savedCode })}
                                    </p>
                                )}
                            </div>
                        </div>
                    </Section>

                    {/* ── Location ── */}
                    <Section divided title={t("school.settings.sectionLocation")}>
                        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
                            <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                            <p>{t("school.settings.locationHelp")}</p>
                        </div>
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="school-province" className={LABEL}>{t("school.settings.province")}</label>
                                    <select id="school-province" value={RWANDA_LOCATIONS[form.province] ? form.province : (form.province ? OTHER_PROVINCE : "")}
                                        onChange={(e) => setForm((f) => ({ ...f, province: e.target.value, district: "" }))} className={INPUT}>
                                        <option value="">{t("school.settings.notSet")}</option>
                                        {Object.keys(RWANDA_LOCATIONS).map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="school-district" className={LABEL}>{t("school.settings.district")}</label>
                                    {isOther ? (
                                        <input id="school-district" type="text" value={form.district} onChange={set("district")} className={INPUT} />
                                    ) : (
                                        <select id="school-district" value={form.district} onChange={set("district")} disabled={!form.province}
                                            className={`${INPUT} disabled:opacity-50`}>
                                            <option value="">{form.province ? t("school.settings.notSet") : t("school.settings.provinceFirst")}</option>
                                            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                                            {form.district && !districts.includes(form.district) && <option value={form.district}>{form.district}</option>}
                                        </select>
                                    )}
                                </div>
                            </div>

                            <fieldset>
                                <legend className={LABEL}>{t("school.settings.ruralLegend")}</legend>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {[
                                        { value: "rural", label: t("school.settings.rural") },
                                        { value: "urban", label: t("school.settings.urban") },
                                        { value: "unset", label: t("school.settings.ruralUnset") },
                                    ].map((opt) => (
                                        <label key={opt.value} className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border text-sm font-semibold cursor-pointer ${form.rural === opt.value ? "border-[var(--brand-secondary)] bg-teal-50 dark:bg-teal-950/40 text-slate-900 dark:text-teal-100" : "border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"}`}>
                                            <input type="radio" name="school-rural" value={opt.value} checked={form.rural === opt.value}
                                                onChange={() => setForm((f) => ({ ...f, rural: opt.value }))} className="w-4 h-4 accent-[var(--brand-secondary)]" />
                                            {opt.label}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        </div>
                    </Section>

                    {/* ── Look ── */}
                    <Section divided title={t("school.settings.sectionLook")} description={t("school.settings.lookHelp")}>
                        <div className="space-y-6">
                            <div>
                                <p className={LABEL} id="school-logo-label">{t("school.settings.logo")}</p>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="w-full sm:w-48 h-24 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center p-3">
                                        {logoSrc ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={logoSrc} alt={fill(t("school.settings.logoAlt"), { name: shownName })} className="max-h-full max-w-full object-contain" />
                                        ) : (
                                            <Image src="/schoolLogo/somabox.png" alt={t("school.settings.logoNone")} width={160} height={55} className="w-auto h-12 object-contain" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <p className="text-xs text-slate-600 dark:text-slate-400" id="school-logo-help">
                                            {logoSrc ? t("school.settings.logoHelp") : `${t("school.settings.logoNone")}. ${t("school.settings.logoHelp")}`}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <input ref={fileRef} id="school-logo-file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                                                aria-describedby="school-logo-help" onChange={(e) => uploadLogo(e.target.files?.[0])} disabled={logoBusy} />
                                            <label htmlFor="school-logo-file"
                                                className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-800 dark:text-slate-100 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 focus-within:ring-2 focus-within:ring-[var(--brand-secondary)] ${logoBusy ? "opacity-50 pointer-events-none" : ""}`}>
                                                <ImageUp className="w-4 h-4" aria-hidden="true" />
                                                {logoBusy ? t("school.settings.logoUploading") : logoSrc ? t("school.settings.logoReplace") : t("school.settings.logoChoose")}
                                            </label>
                                            {logoSrc && (
                                                <button type="button" onClick={removeLogo} disabled={logoBusy}
                                                    className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 ${FOCUS_RING}`}>
                                                    <Trash2 className="w-4 h-4" aria-hidden="true" /> {t("school.settings.logoRemove")}
                                                </button>
                                            )}
                                        </div>
                                        <Message msg={logoMsg} />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <ColourField id="school-primary" t={t} label={t("school.settings.primary")} help={t("school.settings.primaryHelp")}
                                    value={form.primaryColor} onChange={(v) => setForm((f) => ({ ...f, primaryColor: v }))} />
                                <ColourField id="school-secondary" t={t} label={t("school.settings.secondary")} help={t("school.settings.secondaryHelp")}
                                    value={form.secondaryColor} onChange={(v) => setForm((f) => ({ ...f, secondaryColor: v }))} />
                            </div>
                            {(form.primaryColor !== DEFAULT_PRIMARY || form.secondaryColor !== DEFAULT_SECONDARY) && (
                                <button type="button" onClick={() => setForm((f) => ({ ...f, primaryColor: DEFAULT_PRIMARY, secondaryColor: DEFAULT_SECONDARY }))}
                                    className={`inline-flex items-center gap-1.5 min-h-[44px] text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded ${FOCUS_RING}`}>
                                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> {t("school.settings.resetColours")}
                                </button>
                            )}

                            {/* Live preview of a header and a button in the chosen colours (not saved yet). */}
                            <div aria-label={t("school.settings.preview")} role="group" className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("school.settings.preview")}</p>
                                <div className="m-3 rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: previewPrimary }}>
                                    <div className="h-10 min-w-10 max-w-[120px] rounded-lg bg-white flex items-center justify-center px-1.5 shrink-0">
                                        {logoSrc ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={logoSrc} alt="" className="max-h-8 max-w-full object-contain" />
                                        ) : (
                                            <Image src="/schoolLogo/somabox-logo-dark.webp" alt="" width={28} height={28} className="w-7 h-7 object-contain" />
                                        )}
                                    </div>
                                    <span className="text-sm font-black text-white truncate">{shownName}</span>
                                </div>
                                <div className="px-4 pb-4 flex flex-wrap items-center gap-3">
                                    <span className="inline-flex items-center h-10 px-5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: previewSecondary }}>
                                        {t("school.settings.previewButton")}
                                    </span>
                                    <span className="inline-flex items-center h-10 px-5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: previewPrimary }}>
                                        {t("school.settings.previewButtonDark")}
                                    </span>
                                    <span className="text-sm font-bold underline underline-offset-2" style={{ color: previewSecondary }}>
                                        {t("school.settings.previewLink")}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Section>

                    {/* ── Visitor previews ── */}
                    <Section divided title={t("school.settings.sectionVisitors")}>
                        <p className="mb-4 text-sm text-slate-700 dark:text-slate-300">{t("school.settings.visitorsHelp")}</p>
                        <div className="space-y-5">
                            <div className="flex items-center justify-between gap-3 min-h-[44px]">
                                <p id="school-preview-label" className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("school.settings.visitorsOn")}</p>
                                <button type="button" role="switch" aria-checked={form.previewEnabled} aria-labelledby="school-preview-label"
                                    onClick={() => setForm((f) => ({ ...f, previewEnabled: !f.previewEnabled }))}
                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${FOCUS_RING} ${form.previewEnabled ? "bg-[var(--brand-secondary)]" : "bg-slate-300 dark:bg-slate-700"}`}>
                                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${form.previewEnabled ? "translate-x-6" : "translate-x-1"}`} />
                                </button>
                            </div>
                            {form.previewEnabled && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="school-preview-seconds" className={LABEL}>{t("school.settings.seconds")}</label>
                                        <input id="school-preview-seconds" type="number" inputMode="numeric" min={10} max={600} step={1}
                                            value={form.previewSeconds} onChange={set("previewSeconds")} className={INPUT}
                                            aria-invalid={!secondsValid} aria-describedby="school-preview-seconds-help" />
                                        <p id="school-preview-seconds-help" className={HELP}>{secondsValid ? t("school.settings.secondsHelp") : t("school.settings.secondsInvalid")}</p>
                                    </div>
                                    <div>
                                        <label htmlFor="school-preview-items" className={LABEL}>{t("school.settings.items")}</label>
                                        <input id="school-preview-items" type="number" inputMode="numeric" min={1} max={50} step={1}
                                            value={form.previewItems} onChange={set("previewItems")} className={INPUT}
                                            aria-invalid={!itemsValid} aria-describedby="school-preview-items-help" />
                                        <p id="school-preview-items-help" className={HELP}>{itemsValid ? t("school.settings.itemsHelp") : t("school.settings.itemsInvalid")}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Section>

                    <div className="sticky bottom-20 md:bottom-4 z-10 space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur p-3 shadow-lg">
                        <Message msg={msg} />
                        <div className="flex justify-end">
                            <Button type="submit" disabled={saving}
                                className="w-full sm:w-auto bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white text-sm font-extrabold px-8 h-11 rounded-xl">
                                {saving ? t("school.saving") : t("school.settings.save")}
                            </Button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
}
