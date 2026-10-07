"use client";

import React, { useState, useEffect, useContext, useRef } from 'react';
import {
    User,
    Phone,
    MapPin,
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
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';

// Rwanda Provinces and Districts Dataset
const RWANDA_LOCATIONS = {
    "Kigali City": ["Gasabo", "Kicukiro", "Nyarugenge"],
    "Northern Province": ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
    "Southern Province": ["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"],
    "Eastern Province": ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"],
    "Western Province": ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"],
    "International / Other": ["Other District / Region"]
};

const GRADE_LEVELS = [
    { value: "Primary 1", label: "Primary 1 (P1)" },
    { value: "Primary 2", label: "Primary 2 (P2)" },
    { value: "Primary 3", label: "Primary 3 (P3)" },
    { value: "Primary 4", label: "Primary 4 (P4)" },
    { value: "Primary 5", label: "Primary 5 (P5)" },
    { value: "Primary 6", label: "Primary 6 (P6)" },
    { value: "Senior 1", label: "Senior 1 (S1 - O'Level)" },
    { value: "Senior 2", label: "Senior 2 (S2 - O'Level)" },
    { value: "Senior 3", label: "Senior 3 (S3 - O'Level)" },
    { value: "Senior 4", label: "Senior 4 (S4 - A'Level / TVET)" },
    { value: "Senior 5", label: "Senior 5 (S5 - A'Level / TVET)" },
    { value: "Senior 6", label: "Senior 6 (S6 - A'Level / TVET)" },
    { value: "University / Higher Ed", label: "University / Higher Education" },
    { value: "Teacher / Educator", label: "Teacher / Educator" },
    { value: "Self-Paced Learner", label: "Self-Paced / Independent Learner" }
];

export default function MandatoryProfileSetupModal() {
    const { authenticated, role, user, refreshUser } = useContext(DataContext);
    const { lang, setLang } = useLanguage();
    const { showToast } = useToast();

    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [isCompletedSuccess, setIsCompletedSuccess] = useState(false);

    // Form fields
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState('');
    const [province, setProvince] = useState('');
    const [district, setDistrict] = useState('');
    const [customDistrict, setCustomDistrict] = useState('');
    const [isRural, setIsRural] = useState(false);
    const [disabilityStatus, setDisabilityStatus] = useState('none');
    const [schoolName, setSchoolName] = useState('');
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

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3002';

    const userEmail = user?.email || "";

    const currentRole = role || 'scholar';

    useEffect(() => {
        if (!authenticated || !userEmail) {
            setCheckingStatus(false);
            return;
        }

        const checkProfileCompleteness = async () => {
            try {
                // Check if user already marked it completed locally
                const isLocallyComplete = typeof window !== 'undefined' && localStorage.getItem(`somabox_profile_completed_${userEmail}`) === 'true';
                const res = await fetch(`${SERVER_URL}/users/profile/view`);
                if (!res.ok) {
                    setCheckingStatus(false);
                    return;
                }
                const data = await res.json();

                // Populate existing data
                if (data.full_name) setFullName(data.full_name);
                if (data.phone) setPhone(data.phone);
                if (data.gender && data.gender !== 'prefer_not_to_say') setGender(data.gender);
                if (data.region_province && data.region_province !== 'Not Specified') setProvince(data.region_province);
                if (data.region_district && data.region_district !== 'Not Specified') setDistrict(data.region_district);
                if (data.is_rural !== undefined) setIsRural(data.is_rural === 1);
                if (data.disability_status) setDisabilityStatus(data.disability_status);
                if (data.school_name) setSchoolName(data.school_name);
                if (data.grade_level) setGradeLevel(data.grade_level);
                if (data.preferred_language) setPreferredLanguage(data.preferred_language);

                // Check profile completeness
                const hasGender = Boolean(data.gender && data.gender !== 'prefer_not_to_say' && data.gender.trim() !== '');
                const hasProvince = Boolean(data.region_province && data.region_province !== 'Not Specified' && data.region_province.trim() !== '');
                const hasDistrict = Boolean(data.region_district && data.region_district !== 'Not Specified' && data.region_district.trim() !== '');

                const isComplete = Boolean(data.isProfileComplete || (hasGender && hasProvince && hasDistrict));

                if (isComplete) {
                    // Profile is already filled and complete: record completion flag and DO NOT show popup
                    if (typeof window !== 'undefined') {
                        localStorage.setItem(`somabox_profile_completed_${userEmail}`, 'true');
                    }
                    setIsOpen(false);
                } else if (!isLocallyComplete) {
                    // Profile is missing required information and not marked complete: show mandatory onboarding
                    setIsOpen(true);
                }
            } catch (err) {
                console.error("Error checking profile completion:", err);
            } finally {
                setCheckingStatus(false);
            }
        };

        checkProfileCompleteness();
    }, [authenticated, userEmail, currentRole, SERVER_URL]);

    // Live per-step validity — drives the disabled/aria-disabled state on
    // Continue directly, independent of whether the user has attempted to
    // submit yet, so the requirement is always accurately represented.
    const isStep1Valid = fullName.trim() !== '' && !!gender;
    const isStep2Valid = !!province && (
        province === "International / Other" ? customDistrict.trim() !== '' : !!district
    );
    const isStep3Valid = currentRole !== 'scholar' || !!gradeLevel;

    const STEP_LABELS = { 1: "Personal Details", 2: "Location & Region", 3: "Academic Info" };

    // Handle step 1 validation
    const validateStep1 = () => {
        const errs = {};
        if (!fullName.trim()) errs.fullName = "Full name is required";
        if (!gender) errs.gender = "Please select your gender identity";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // Handle step 2 validation
    const validateStep2 = () => {
        const errs = {};
        if (!province) errs.province = "Please select your province / region";
        const finalDistrict = province === "International / Other" ? customDistrict : district;
        if (!finalDistrict || !finalDistrict.trim()) errs.district = "Please select or provide your district";
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // Handle step 3 validation
    const validateStep3 = () => {
        const errs = {};
        if (currentRole === 'scholar' && !gradeLevel) {
            errs.gradeLevel = "Please choose your grade or study level";
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleNext = () => {
        const valid = step === 1 ? validateStep1() : step === 2 ? validateStep2() : true;
        if (!valid) {
            // Continue is only reachable here via keyboard activation racing the
            // disabled state, or a stale click — announce why it didn't move so
            // a screen-reader user isn't left wondering if anything happened.
            setAnnouncement("Please fill in the required fields before continuing.");
            return;
        }
        const nextStep = step + 1;
        setStep(nextStep);
        setErrors({});
        setAnnouncement(`Step ${nextStep} of 3: ${STEP_LABELS[nextStep]}`);
    };

    const handleBack = () => {
        if (step > 1) {
            setErrors({});
            const prevStep = step - 1;
            setStep(prevStep);
            setAnnouncement(`Step ${prevStep} of 3: ${STEP_LABELS[prevStep]}`);
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

    const handleFinalSubmit = async (e) => {
        e.preventDefault();
        if (!validateStep3()) return;

        setLoading(true);
        setErrors({});

        const finalDistrict = province === "International / Other" ? (customDistrict || "International") : district;

        try {
            const res = await fetch(`${SERVER_URL}/users/profile/update`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: fullName.trim(),
                    phone: phone.trim(),
                    gender,
                    regionProvince: province,
                    regionDistrict: finalDistrict,
                    isRural,
                    disabilityStatus,
                    schoolName: schoolName.trim(),
                    gradeLevel,
                    preferredLanguage
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'Failed to update profile');
            }

            // Persist completion flag so it never prompts again
            if (typeof window !== 'undefined') {
                localStorage.setItem(`somabox_profile_completed_${userEmail}`, 'true');
            }
            // Pick up the new name in the header and menus.
            await refreshUser();
            if (preferredLanguage) {
                setLang(preferredLanguage);
            }

            setIsCompletedSuccess(true);
            showToast("Profile completed successfully! Welcome to SomaBox LMS.", "success");

            setTimeout(() => {
                setIsOpen(false);
            }, 1800);

        } catch (err) {
            console.error("Failed to complete profile:", err);
            showToast(`Error: ${err.message}`, "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || checkingStatus) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            {/* Modal Container */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="onboarding-modal-title"
                className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] transition-all transform animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Banner */}
                <div className="relative bg-gradient-to-r from-accent-dark via-teal-800 to-teal-900 px-6 sm:px-8 py-6 text-white overflow-hidden shrink-0">
                    <div className="absolute -top-12 -right-12 w-40 h-40 bg-teal-500/20 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-amber-500/20 rounded-full blur-xl pointer-events-none" />

                    <div className="relative z-10 flex items-start justify-between gap-4">
                        <div className="space-y-1.5">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-teal-200 text-xs font-bold tracking-wide uppercase">
                                <Sparkles className="w-3.5 h-3.5 text-teal-300" />
                                First-Time Onboarding
                            </div>
                            <h2 id="onboarding-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-white">
                                Complete Your Profile
                            </h2>
                            <p className="text-white/80 text-xs sm:text-sm font-medium">
                                Please take a moment to set up your learner information to unlock your full dashboard.
                            </p>
                        </div>
                        <div className="hidden sm:flex p-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm text-teal-300 shrink-0">
                            <ShieldCheck className="w-8 h-8" />
                        </div>
                    </div>

                    {/* Step Progress Tracker */}
                    <div className="mt-6 pt-4 border-t border-white/15 flex items-center justify-between gap-2">
                        {[
                            { num: 1, label: "Personal Details", icon: User },
                            { num: 2, label: "Location & Region", icon: MapPin },
                            { num: 3, label: "Academic Info", icon: GraduationCap }
                        ].map((item, idx) => {
                            const IconComponent = item.icon;
                            const isActive = step === item.num;
                            const isDone = step > item.num || isCompletedSuccess;

                            return (
                                <div key={item.num} className="flex items-center gap-2 flex-1 min-w-0">
                                    <div
                                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-black transition-all shrink-0 ${
                                            isDone
                                                ? "bg-teal-400 text-slate-900"
                                                : isActive
                                                ? "bg-white text-slate-900 ring-2 ring-teal-300 ring-offset-2 ring-offset-teal-900"
                                                : "bg-white/20 text-white/60"
                                        }`}
                                    >
                                        {isDone ? <CheckCircle2 className="w-4 h-4" /> : item.num}
                                    </div>
                                    <div className="hidden md:block truncate">
                                        <p className={`text-[11px] font-bold leading-tight ${isActive ? "text-white" : "text-white/60"}`}>
                                            Step {item.num}
                                        </p>
                                        <p className="text-[10px] text-white/70 truncate">{item.label}</p>
                                    </div>
                                    {idx < 2 && (
                                        <div className={`flex-1 h-0.5 mx-1 hidden sm:block ${step > item.num ? "bg-teal-400" : "bg-white/20"}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Form Body Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                    {isCompletedSuccess ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xl">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                                    You&apos;re All Set!
                                </h3>
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 max-w-sm">
                                    Your profile has been successfully configured. Launching your personalized SomaBox portal...
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold text-teal-600 dark:text-teal-400 pt-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Unlocking dashboard...
                            </div>
                        </div>
                    ) : (
                        <div>
                            {/* STEP 1: Personal Details */}
                            {step === 1 && (
                                <div className="space-y-5 animate-in fade-in-50 duration-200">
                                    <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                                        <h3 ref={stepHeadingRef} tabIndex={-1} className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 outline-none">
                                            <User className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                            Personal Information
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            Let us know how to address you and keep your account secure.
                                        </p>
                                    </div>

                                    {/* Full Name */}
                                    <div>
                                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            Full Name <span className="text-rose-500">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                placeholder="e.g. Mugisha Jean Claude"
                                                className={`w-full h-11 px-3.5 rounded-xl border ${
                                                    errors.fullName
                                                        ? "border-rose-500 bg-rose-50/30 dark:bg-rose-950/20"
                                                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60"
                                                } text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all`}
                                            />
                                        </div>
                                        {errors.fullName && (
                                            <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.fullName}</p>
                                        )}
                                    </div>

                                    {/* Phone Number */}
                                    <div>
                                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            Phone Number <span className="text-slate-600 normal-case font-medium">(optional)</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="+250 788 123 456"
                                                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                                            />
                                        </div>
                                    </div>

                                    {/* Gender Identity */}
                                    <div>
                                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            Gender Identity <span className="text-rose-500">*</span>
                                        </label>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                                            Used strictly for demographic equality and educational impact monitoring.
                                        </p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                            {[
                                                { value: "male", label: "Male" },
                                                { value: "female", label: "Female" },
                                                { value: "other", label: "Other / Non-Binary" }
                                            ].map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => setGender(opt.value)}
                                                    className={`py-3 px-3 rounded-xl border text-xs font-extrabold transition-all flex items-center justify-center gap-2 ${
                                                        gender === opt.value
                                                            ? "border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 shadow-sm ring-2 ring-teal-500/20"
                                                            : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    }`}
                                                >
                                                    {gender === opt.value && <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />}
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                        {errors.gender && (
                                            <p className="text-[11px] font-bold text-rose-500 mt-1.5">{errors.gender}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: Location & Demographics */}
                            {step === 2 && (
                                <div className="space-y-5 animate-in fade-in-50 duration-200">
                                    <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                                        <h3 ref={stepHeadingRef} tabIndex={-1} className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 outline-none">
                                            <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                            Geographic Location & Inclusion
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            Helps deliver localized curricula and accessibility support.
                                        </p>
                                    </div>

                                    {/* Province Selection */}
                                    <div>
                                        <label htmlFor="onboarding-province" className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            Province / Region <span className="text-rose-500">*</span>
                                        </label>
                                        <select
                                            id="onboarding-province"
                                            value={province}
                                            onChange={(e) => {
                                                setProvince(e.target.value);
                                                setDistrict('');
                                            }}
                                            className={`w-full h-11 px-3 rounded-xl border ${
                                                errors.province
                                                    ? "border-rose-500 bg-rose-50/30 dark:bg-rose-950/20"
                                                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60"
                                            } text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all`}
                                        >
                                            <option value="">-- Select Province / Region --</option>
                                            {Object.keys(RWANDA_LOCATIONS).map((prov) => (
                                                <option key={prov} value={prov}>{prov}</option>
                                            ))}
                                        </select>
                                        {errors.province && (
                                            <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.province}</p>
                                        )}
                                    </div>

                                    {/* District Selection */}
                                    <div>
                                        <label htmlFor="onboarding-district" className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            District <span className="text-rose-500">*</span>
                                        </label>
                                        {!province && (
                                            <p id="district-hint" className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                                                Select a province above first — district options depend on it.
                                            </p>
                                        )}
                                        {province === "International / Other" ? (
                                            <input
                                                id="onboarding-district"
                                                type="text"
                                                value={customDistrict}
                                                onChange={(e) => setCustomDistrict(e.target.value)}
                                                placeholder="Enter your district or city"
                                                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                                            />
                                        ) : (
                                            <select
                                                id="onboarding-district"
                                                value={district}
                                                onChange={(e) => setDistrict(e.target.value)}
                                                disabled={!province}
                                                aria-describedby={!province ? "district-hint" : undefined}
                                                className={`w-full h-11 px-3 rounded-xl border ${
                                                    errors.district
                                                        ? "border-rose-500 bg-rose-50/30 dark:bg-rose-950/20"
                                                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60"
                                                } text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                <option value="">{province ? "-- Select District --" : "Select a province first"}</option>
                                                {province && RWANDA_LOCATIONS[province]?.map((dist) => (
                                                    <option key={dist} value={dist}>{dist}</option>
                                                ))}
                                            </select>
                                        )}
                                        {errors.district && (
                                            <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.district}</p>
                                        )}
                                    </div>

                                    {/* Rural / Urban Checkbox */}
                                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            id="ruralOnboarding"
                                            checked={isRural}
                                            onChange={(e) => setIsRural(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                        />
                                        <label htmlFor="ruralOnboarding" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                                            Located in Rural / Remote Community
                                            <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                                                Enables offline caching and low-bandwidth optimizations automatically.
                                            </span>
                                        </label>
                                    </div>

                                    {/* Inclusion & Disability Support */}
                                    <div>
                                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            Accessibility & Inclusion Support
                                        </label>
                                        <select
                                            value={disabilityStatus}
                                            onChange={(e) => setDisabilityStatus(e.target.value)}
                                            className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                                        >
                                            <option value="none">None / Standard Interface</option>
                                            <option value="visual">Visual Impairment (High Contrast / Screen Reader)</option>
                                            <option value="hearing">Hearing Impairment (Captions / Visual Cues)</option>
                                            <option value="mobility">Mobility / Motor Assistance</option>
                                            <option value="cognitive">Cognitive & Learning Assistance</option>
                                            <option value="other">Other Inclusion Need</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* STEP 3: Academic & Learning Profile */}
                            {step === 3 && (
                                <div className="space-y-5 animate-in fade-in-50 duration-200">
                                    <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                                        <h3 ref={stepHeadingRef} tabIndex={-1} className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 outline-none">
                                            <GraduationCap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                            Academic & Learning Profile
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            Tailor lesson materials and recommendations to your education level.
                                        </p>
                                    </div>

                                    {/* School / Institution Name */}
                                    <div>
                                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            School / Institution Name <span className="text-slate-600 normal-case font-medium">(optional)</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={schoolName}
                                                onChange={(e) => setSchoolName(e.target.value)}
                                                placeholder="e.g. GS Kigali, Remera Academy, etc."
                                                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                                            />
                                        </div>
                                    </div>

                                    {/* Grade / Study Level */}
                                    <div>
                                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            Current Grade / Study Level {currentRole === 'scholar' && <span className="text-rose-500">*</span>}
                                        </label>
                                        <select
                                            value={gradeLevel}
                                            onChange={(e) => setGradeLevel(e.target.value)}
                                            className={`w-full h-11 px-3 rounded-xl border ${
                                                errors.gradeLevel
                                                    ? "border-rose-500 bg-rose-50/30 dark:bg-rose-950/20"
                                                    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60"
                                            } text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all`}
                                        >
                                            <option value="">-- Select Your Level --</option>
                                            {GRADE_LEVELS.map((g) => (
                                                <option key={g.value} value={g.value}>{g.label}</option>
                                            ))}
                                        </select>
                                        {errors.gradeLevel && (
                                            <p className="text-[11px] font-bold text-rose-500 mt-1">{errors.gradeLevel}</p>
                                        )}
                                    </div>

                                    {/* Preferred Interface Language */}
                                    <div>
                                        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5">
                                            Preferred Language
                                        </label>
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
                                                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                        preferredLanguage === l.code
                                                            ? "border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 ring-2 ring-teal-500/20"
                                                            : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                                    }`}
                                                >
                                                    <Globe className="w-3.5 h-3.5 opacity-70" />
                                                    {l.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal Footer Controls */}
                {!isCompletedSuccess && (
                    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                        <div>
                            {step > 1 ? (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    disabled={loading}
                                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    Previous Step
                                </button>
                            ) : (
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    Mandatory Setup (Step 1 of 3)
                                </span>
                            )}
                        </div>

                        <div>
                            {step < 3 ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
                                    aria-disabled={step === 1 ? !isStep1Valid : !isStep2Valid}
                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent-dark hover:bg-teal-800 text-white text-xs font-black shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent-dark"
                                >
                                    Continue
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleFinalSubmit}
                                    disabled={loading || !isStep3Valid}
                                    aria-disabled={loading || !isStep3Valid}
                                    className="inline-flex items-center gap-2 px-7 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-black shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving Profile...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            Complete Profile & Launch
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
