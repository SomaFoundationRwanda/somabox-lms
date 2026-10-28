"use client";

import React, { useState, useEffect, useContext, useRef } from 'react';
import {
    User,
    Phone,
    GraduationCap,
    Globe,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Sparkles,
    ShieldCheck,
    Building2,
    Award,
    Loader2
} from 'lucide-react';
import DataContext from '@/context/DataContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { apiFetch, getErrorMessage } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import LanguageSwitcher from '@/components/global/LanguageSwitcher';
import { fill } from '@/lib/fill';
import { GRADE_LEVELS } from '@/lib/grades';
import { AccessibilityField, GenderField } from '@/components/profile/ProfileFields';
import { GENDERS } from '@/lib/profileOptions';
import { Field, Select, TextInput } from '@/components/form';
import { Label } from "@/components/form";

// Nobody is asked where they live: one box serves one school, and the box places everyone at the
// school's location (province, district, rural/urban), set by the admin on the School page.


// What each role is asked, step by step. Learners: who they are, then their class and language.
// Teachers: only what's theirs to answer (the admin set their name and email), on one step.
// The `fields` name the blocks rendered by FIELD below; `required` gate the step's button.
const VARIANTS = {
    scholar: {
        text: "learner.profileSetup",
        steps: [
            { key: "personal", icon: User, title: "personalTitle", help: "personalHelp", label: "stepPersonal", fields: ["fullName", "phone", "gender", "disability"], required: ["fullName", "gender", "disability"] },
            { key: "academic", icon: GraduationCap, title: "academicTitle", help: "academicHelp", label: "stepAcademic", fields: ["school", "grade", "language"], required: ["grade"] },
        ],
    },
    teacher: {
        text: "teacher.profileSetup",
        steps: [
            { key: "about", icon: User, title: "aboutTitle", help: "aboutHelp", label: "stepAbout", fields: ["gender", "disability", "language"], required: ["gender", "disability"] },
        ],
    },
};

export default function MandatoryProfileSetupModal() {
    const { authenticated, role, user, refreshUser } = useContext(DataContext);
    const queryClient = useQueryClient();
    const { lang, setLang, t } = useLanguage();
    const { showToast } = useToast();

    const [isOpen, setIsOpen] = useState(false);
    // An account a teacher made for a learner: the teacher already knows who they are, so the
    // questions can wait ("Later", asked again next visit) instead of blocking the first one.
    const [deferrable, setDeferrable] = useState(false);
    const DEFER_KEY = "somabox.profileSetup.later";
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [isCompletedSuccess, setIsCompletedSuccess] = useState(false);

    // Form fields
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState('');
    // Must be answered explicitly: a pre-ticked default would record "no disability" for people
    // who never chose (the school reports on this).
    const [disabilityStatus, setDisabilityStatus] = useState('');
    // One box serves one school: the school (name, place, rural/urban) comes from the box's
    // settings and is shown read-only. { name, code, province, district, isRural }.
    const [school, setSchool] = useState(null);
    const [gradeLevel, setGradeLevel] = useState('');
    const [preferredLanguage, setPreferredLanguage] = useState(lang || 'en');

    // Validation errors
    const [errors, setErrors] = useState({});
    // Screen-reader-only live region text — announced whenever the step
    // changes or a blocked Continue attempt needs explaining.
    const [announcement, setAnnouncement] = useState('');
    // Focus target for the newly-shown step, so screen readers land on its
    // heading (and read it) instead of silently staying on the Continue button.
    const stepHeadingRef = useRef(null);

    // Switching the UI language here (top of the form) also sets the preferred language saved
    // with the profile, so finishing the form doesn't switch it back.
    const firstLangRun = useRef(true);
    useEffect(() => {
        if (firstLangRun.current) { firstLangRun.current = false; return; }
        setPreferredLanguage(lang);
    }, [lang]);

    const userEmail = user?.email || "";

    const currentRole = role || 'scholar';

    useEffect(() => {
        // A temporary password is changed first (the server allows nothing else until then).
        if (!authenticated || !userEmail || user?.mustChangePassword) {
            setIsOpen(false);
            setCheckingStatus(false);
            return;
        }

        const checkProfileCompleteness = async () => {
            try {
                // The same kept profile as the account page (one request for both).
                const data = await queryClient.fetchQuery({ queryKey: queryKeys.profile, queryFn: () => apiFetch("/users/profile/view") });

                // Populate existing data
                if (data.full_name) setFullName(data.full_name);
                if (data.phone) setPhone(data.phone);
                if (GENDERS.includes(data.gender)) setGender(data.gender);
                if (data.school) setSchool(data.school);
                // Only reuse this once it was actually answered (older accounts hold defaults).
                if (data.isProfileComplete && data.disability_status) setDisabilityStatus(data.disability_status);
                if (data.grade_level) setGradeLevel(data.grade_level);
                if (data.preferred_language) setPreferredLanguage(data.preferred_language);

                // The server decides: a profile counts as complete once every required answer was
                // given explicitly (it records when). Nothing on this device can skip it.
                let later = false;
                try { later = !!data.profile_deferred && window.sessionStorage.getItem(DEFER_KEY) === "1"; } catch { /* storage unavailable */ }
                setDeferrable(!!data.profile_deferred);
                setIsOpen(!data.isProfileComplete && !later);
            } catch (err) {
                console.error("Error checking profile completion:", err);
            } finally {
                setCheckingStatus(false);
            }
        };

        checkProfileCompleteness();
    }, [authenticated, userEmail, currentRole, user?.mustChangePassword]); // eslint-disable-line react-hooks/exhaustive-deps

    const variant = VARIANTS[currentRole] || VARIANTS.scholar;
    // Text that differs per variant (title, step names); the field labels are shared.
    const vt = (key) => t(`${variant.text}.${key}`);
    const answers = { fullName: fullName.trim(), gender, disability: disabilityStatus, grade: gradeLevel };
    const missing = (n) => variant.steps[n - 1].required.filter((field) => !answers[field]);
    // Live per-step validity — drives the disabled/aria-disabled state on
    // Continue directly, independent of whether the user has attempted to
    // submit yet, so the requirement is always accurately represented.
    const isStepValid = (n) => missing(n).length === 0;

    const STEP_LABELS = Object.fromEntries(variant.steps.map((st, i) => [i + 1, vt(st.label)]));
    const LAST_STEP = variant.steps.length;
    const current = variant.steps[step - 1];
    // "GS Kigali · Gasabo, Kigali City" (the place only when the school has set it).
    const schoolPlace = [school?.district, school?.province].filter(Boolean).join(", ");

    const ERROR_TEXT = {
        fullName: () => t("learner.profileSetup.errName"),
        gender: () => t("learner.profileSetup.errGender"),
        disability: () => t("school.onboarding.errDisability"),
        grade: () => t("learner.profileSetup.errGrade"),
    };
    const ERROR_KEY = { fullName: "fullName", gender: "gender", disability: "disability", grade: "gradeLevel" };
    const validateStep = (n) => {
        const errs = Object.fromEntries(missing(n).map((field) => [ERROR_KEY[field], ERROR_TEXT[field]()]));
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleNext = () => {
        const valid = validateStep(step);
        if (!valid) {
            // Continue is only reachable here via keyboard activation racing the
            // disabled state, or a stale click — announce why it didn't move so
            // a screen-reader user isn't left wondering if anything happened.
            setAnnouncement(t("learner.profileSetup.fillRequired"));
            return;
        }
        const nextStep = step + 1;
        setStep(nextStep);
        setErrors({});
        setAnnouncement(fill(t("learner.profileSetup.stepAnnounce"), { n: nextStep, label: STEP_LABELS[nextStep] }));
    };

    const handleBack = () => {
        if (step > 1) {
            setErrors({});
            const prevStep = step - 1;
            setStep(prevStep);
            setAnnouncement(fill(t("learner.profileSetup.stepAnnounce"), { n: prevStep, label: STEP_LABELS[prevStep] }));
        }
    };

    // Move focus to the new step's heading whenever the step changes, so
    // screen readers land on (and read) the new section instead of silently
    // remaining on the Continue/Previous button that triggered the change.
    useEffect(() => {
        if (isOpen && !isCompletedSuccess) {
            stepHeadingRef.current?.focus();
        }
    }, [step, isOpen, isCompletedSuccess]);

    const asked = new Set(variant.steps.flatMap((st) => st.fields));

    const handleFinalSubmit = async (e) => {
        e.preventDefault();
        if (!validateStep(LAST_STEP)) return;

        setLoading(true);
        setErrors({});

        try {
            await apiFetch("/users/profile/update", {
                method: "PATCH",
                json: {
                    ...(asked.has("fullName") ? { fullName: fullName.trim() } : {}),
                    ...(asked.has("phone") ? { phone: phone.trim() } : {}),
                    ...(asked.has("grade") ? { gradeLevel } : {}),
                    gender,
                    disabilityStatus,
                    preferredLanguage,
                    completeProfile: true
                },
            }).catch((err) => {
                throw new Error(err?.body?.message || (err?.status === 0 ? getErrorMessage(err, t) : t("learner.profileSetup.saveFailed")));
            });

            // Pick up the new name in the header and menus; the profile reminder goes.
            await refreshUser();
            queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
            queryClient.invalidateQueries({ queryKey: queryKeys.profile });
            if (preferredLanguage) {
                setLang(preferredLanguage);
            }

            setIsCompletedSuccess(true);
            showToast(t("learner.profileSetup.doneToast"), "success");

            setTimeout(() => {
                setIsOpen(false);
            }, 1800);

        } catch (err) {
            console.error("Failed to complete profile:", err);
            showToast(fill(t("learner.profileSetup.errorToast"), { message: err.message }), "error");
        } finally {
            setLoading(false);
        }
    };

    // The blocks a step can show (see VARIANTS).
    const FIELD = {
        fullName: () => (
            <Field label={t("learner.profileSetup.fullName")} error={errors.fullName} required>
                <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("learner.profileSetup.namePlaceholder")} size="lg" autoComplete="name" />
            </Field>
        ),
        phone: () => (
            <Field label={t("learner.profileSetup.phone")} optional={t("learner.profileSetup.optional")}>
                <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+250 788 123 456" size="lg" autoComplete="tel" />
            </Field>
        ),
        gender: () => <GenderField value={gender} onChange={setGender} error={errors.gender} size="lg" />,
        disability: () => <AccessibilityField value={disabilityStatus} onChange={setDisabilityStatus} error={errors.disability} size="lg" />,
        school: () => (
            <>
            {/* School and its place: set by the school, shown read-only (nobody is asked). */}
            {school?.name && (
                <div className="flex items-start gap-2 p-3.5 rounded-xl bg-surface-sunken border border-line text-ui">
                    <Building2 className="w-4 h-4 mt-0.5 text-brand-fg shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="font-semibold text-fg-muted">
                            {t("school.onboarding.schoolLabel")}{" "}
                            <span className="font-extrabold text-fg">{school.name}</span>
                            {schoolPlace ? <span className="text-fg-muted"> · {schoolPlace}</span> : null}
                        </p>
                        <p className="text-caption text-fg-subtle mt-0.5">{t("school.onboarding.setBySchool")}</p>
                    </div>
                </div>
            )}
            </>
        ),
        grade: () => (
            <Field label={t("learner.profileSetup.grade")} error={errors.gradeLevel} required={currentRole === 'scholar'}>
                <Select value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} size="lg"
                    placeholder={t("learner.profileSetup.selectLevel")}
                    options={GRADE_LEVELS.map((g) => ({ value: g.value, label: t(`learner.profileSetup.grades.${g.key}`) }))} />
            </Field>
        ),
        language: () => (
            <>
            {/* Preferred Interface Language */}
            <div>
                <Label>
                    {t("learner.profileSetup.preferredLanguage")}
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                        { code: "en", name: "English" },
                        { code: "rw", name: "Ikinyarwanda" },
                        { code: "fr", name: "Français" },
                        { code: "sw", name: "Kiswahili" },
                        { code: "es", name: "Español" }
                    ].map((l) => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => setPreferredLanguage(l.code)}
                            className={`py-2.5 px-3 rounded-xl border text-caption font-bold transition-all flex items-center justify-center gap-1.5 ${
                                preferredLanguage === l.code
                                    ? "border-brand bg-brand-soft text-brand-fg ring-2 ring-brand/20"
                                    : "border-line bg-surface-sunken/50 text-fg-muted hover:bg-surface-hover"
                            }`}
                        >
                            <Globe className="w-3.5 h-3.5 opacity-70" />
                            {l.name}
                        </button>
                    ))}
                </div>
            </div>
            </>
        ),
    };

    if (!isOpen || checkingStatus) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-scrim backdrop-blur-md animate-in fade-in duration-200">
            {/* Modal Container */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="onboarding-modal-title"
                className="w-full max-w-2xl bg-surface-raised rounded-3xl shadow-2xl border border-line overflow-hidden flex flex-col max-h-[90vh] transition-all transform animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Banner */}
                <div className="dark relative bg-brand-deep px-6 sm:px-8 py-6 text-white overflow-hidden shrink-0">
                    <div className="absolute -top-12 -right-12 w-40 h-40 bg-brand/20 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-warning/20 rounded-full blur-xl pointer-events-none" />

                    <div className="relative z-10 flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-brand-fg text-caption font-bold">
                                <Sparkles className="w-3.5 h-3.5 text-brand-fg" />
                                {vt("badge")}
                            </div>
                            <h2 id="onboarding-modal-title" className="text-section sm:text-title font-extrabold tracking-tight text-white">
                                {vt("title")}
                            </h2>
                            <p className="text-white/80 text-caption sm:text-ui font-medium">
                                {vt("subtitle")}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                            <LanguageSwitcher compact />
                            <div className="hidden sm:flex p-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm text-brand-fg">
                                <ShieldCheck className="w-8 h-8" />
                            </div>
                        </div>
                    </div>

                    {/* Step Progress Tracker (only when there's more than one step) */}
                    {LAST_STEP > 1 && (
                    <div className="mt-6 pt-4 border-t border-white/15 flex items-center justify-between gap-2">
                        {variant.steps.map((st, i) => ({ num: i + 1, label: STEP_LABELS[i + 1] })).map((item, idx) => {
                            const isActive = step === item.num;
                            const isDone = step > item.num || isCompletedSuccess;

                            return (
                                <div key={item.num} className="flex items-center gap-2 flex-1 min-w-0">
                                    <div
                                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-caption font-extrabold transition-all shrink-0 ${
                                            isDone
                                                ? "bg-brand text-on-brand"
                                                : isActive
                                                ? "bg-fg text-surface ring-2 ring-brand/40 ring-offset-2 ring-offset-brand-strong"
                                                : "bg-white/20 text-on-brand/60"
                                        }`}
                                    >
                                        {isDone ? <CheckCircle2 className="w-4 h-4" /> : item.num}
                                    </div>
                                    <div className="hidden md:block truncate">
                                        <p className={`text-caption font-bold leading-tight ${isActive ? "text-white" : "text-white/60"}`}>
                                            {fill(t("learner.profileSetup.stepN"), { n: item.num })}
                                        </p>
                                        <p className="text-caption text-white/70 truncate">{item.label}</p>
                                    </div>
                                    {idx < LAST_STEP - 1 && (
                                        <div className={`flex-1 h-0.5 mx-1 hidden sm:block ${step > item.num ? "bg-brand" : "bg-white/20"}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    )}
                </div>

                {/* Form Body Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                    {isCompletedSuccess ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 rounded-full bg-success-soft border-2 border-success text-success-fg flex items-center justify-center shadow-xl">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-title font-extrabold text-fg">
                                    {t("learner.profileSetup.allSet")}
                                </h3>
                                <p className="text-ui font-medium text-fg-muted max-w-sm">
                                    {t("learner.profileSetup.allSetBody")}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-caption font-bold text-brand-fg pt-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t("learner.profileSetup.unlocking")}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="space-y-5 animate-in fade-in-50 duration-200">
                                <div className="border-b border-line pb-3">
                                    <h3 ref={stepHeadingRef} tabIndex={-1} className="text-item font-extrabold text-fg flex items-center gap-2 outline-none">
                                        <current.icon className="w-4 h-4 text-brand-fg" />
                                        {vt(current.title)}
                                    </h3>
                                    <p className="text-caption text-fg-subtle mt-0.5">
                                        {vt(current.help)}
                                    </p>
                                </div>
                                {current.fields.map((field) => <React.Fragment key={field}>{FIELD[field]()}</React.Fragment>)}
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer Controls */}
                {!isCompletedSuccess && (
                    <div className="p-4 sm:p-6 bg-surface-sunken border-t border-line flex items-center justify-between gap-3 shrink-0">
                        <div>
                            {step > 1 ? (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    disabled={loading}
                                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-line-strong bg-surface text-caption font-extrabold text-fg-muted hover:bg-surface-hover transition-all disabled:opacity-50"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    {t("learner.profileSetup.previous")}
                                </button>
                            ) : deferrable ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        try { window.sessionStorage.setItem(DEFER_KEY, "1"); } catch { /* storage unavailable */ }
                                        setIsOpen(false);
                                    }}
                                    className="inline-flex items-center px-4 py-2.5 rounded-xl border border-line-strong bg-surface text-caption font-extrabold text-fg-muted hover:bg-surface-hover"
                                >
                                    {t("learner.profileSetup.later")}
                                </button>
                            ) : (
                                <span className="text-caption font-bold text-fg-subtle">
                                    {t("learner.profileSetup.mandatory")}
                                </span>
                            )}
                        </div>

                        <div>
                            {step < LAST_STEP ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    disabled={!isStepValid(step)}
                                    aria-disabled={!isStepValid(step)}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-strong hover:bg-brand-strong text-on-brand-strong text-caption font-extrabold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-strong"
                                >
                                    {t("learner.profileSetup.continue")}
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleFinalSubmit}
                                    disabled={loading || !isStepValid(LAST_STEP)}
                                    aria-disabled={loading || !isStepValid(LAST_STEP)}
                                    className="inline-flex items-center gap-2 px-7 py-2.5 rounded-xl bg-gradient-to-r from-brand to-brand-strong hover:from-brand hover:to-brand-strong text-white text-caption font-extrabold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t("learner.profileSetup.saving")}
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            {t("learner.profileSetup.finish")}
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Screen-reader-only live region: announces step changes and
                    blocked Continue attempts that JAWS/VoiceOver users would
                    otherwise have no signal for. */}
                <div aria-live="polite" role="status" className="sr-only">
                    {announcement}
                </div>
            </div>
        </div>
    );
}
