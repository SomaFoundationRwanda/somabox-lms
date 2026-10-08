"use client";

import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Info } from "lucide-react";
import { PageHeader, Section } from "@/components/layout";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import Unauthorized from "@/components/sections/Unauthorized";
import { Button } from "@/components/ui/button";
import { RWANDA_LOCATIONS, OTHER_PROVINCE } from "@/lib/rwandaLocations";
import { fill } from "@/lib/fill";
import { FOCUS_RING } from "@/lib/a11y";
import Loader from "@/components/ui/Loader";

// One box serves one school. The school's name, code, place and rural/urban setting live here
// (GET/PUT /school), so learners aren't asked for them when they set up their profile.

const CODE_RE = /^[A-Z0-9]{2,8}$/;
const INPUT = `w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white ${FOCUS_RING}`;
const LABEL = "block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1";

const ruralToValue = (v) => (v === true ? "rural" : v === false ? "urban" : "unset");
const valueToRural = (v) => (v === "rural" ? true : v === "urban" ? false : null);

export default function SchoolSettingsPage() {
    const { SERVER_URL, authenticated, role } = useContext(DataContext);
    const { t } = useLanguage();
    const isAdmin = role === "admin";

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: "", text: "" });
    const [savedCode, setSavedCode] = useState("");
    const [nextNumber, setNextNumber] = useState(null);
    const [form, setForm] = useState({ name: "", code: "", province: "", district: "", rural: "unset" });

    const applySettings = (data) => {
        setForm({
            name: data?.name || "",
            code: data?.code || "",
            province: data?.province || "",
            district: data?.district || "",
            rural: ruralToValue(data?.isRural),
        });
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

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSave = async (e) => {
        e.preventDefault();
        if (!codeValid) {
            setMsg({ type: "error", text: t("school.settings.codeInvalid") });
            return;
        }
        setSaving(true);
        setMsg({ type: "", text: "" });
        try {
            const res = await fetch(`${SERVER_URL}/school`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name.trim(),
                    code,
                    province: form.province,
                    district: form.district.trim(),
                    isRural: valueToRural(form.rural),
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setMsg({ type: "error", text: data?.message || data?.error || t("school.settings.saveFailed") });
                return;
            }
            applySettings(data);
            setMsg({ type: "ok", text: t("school.settings.saved") });
        } catch (err) {
            setMsg({ type: "error", text: err?.message || t("school.settings.saveFailed") });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto pb-16">
            <div className="mb-4">
                <Link href="/manage/admin" className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white rounded ${FOCUS_RING}`}>
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("school.settings.back")}
                </Link>
            </div>

            <PageHeader
                eyebrow={t("school.settings.eyebrow")}
                title={t("school.settings.title")}
                description={t("school.settings.description")}
            />

            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-900 dark:text-sky-100">
                <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                    <p>{t("school.settings.oneBoxOneSchool")}</p>
                    <p>{t("school.settings.codeOnlyNew")}</p>
                </div>
            </div>

            <Section className="mt-6">
                {loading ? (
                    <Loader variant="page" size={56} className="min-h-[30vh]" label={t("school.loading")} />
                ) : loadError ? (
                    <p role="alert" className="flex items-start gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {loadError}
                    </p>
                ) : (
                    <form onSubmit={handleSave} className="space-y-5" noValidate>
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
                            <p id="school-code-help" className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("school.settings.codeHelp")}</p>
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
                                    <label key={opt.value} className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg border text-sm font-semibold cursor-pointer ${form.rural === opt.value ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100" : "border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200"}`}>
                                        <input type="radio" name="school-rural" value={opt.value} checked={form.rural === opt.value}
                                            onChange={() => setForm((f) => ({ ...f, rural: opt.value }))} className="w-4 h-4 accent-teal-600" />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("school.settings.ruralHelp")}</p>
                        </fieldset>

                        {msg.text && (
                            <p role={msg.type === "error" ? "alert" : "status"}
                                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${msg.type === "error"
                                    ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
                                {msg.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                                {msg.text}
                            </p>
                        )}

                        <div className="flex justify-end">
                            <Button type="submit" disabled={saving}
                                className="w-full sm:w-auto bg-[#203A3A] hover:bg-[#162727] text-white text-sm font-extrabold px-8 h-11 rounded-xl">
                                {saving ? t("school.saving") : t("school.settings.save")}
                            </Button>
                        </div>
                    </form>
                )}
            </Section>

            <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
                {t("school.settings.brandingNote")}{" "}
                <Link href="/manage/admin/branding" className={`font-bold underline underline-offset-2 rounded ${FOCUS_RING}`}>{t("school.settings.brandingLink")}</Link>
            </p>
        </div>
    );
}
