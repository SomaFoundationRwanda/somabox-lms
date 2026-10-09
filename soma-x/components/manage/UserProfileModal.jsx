"use client";

import { useContext } from "react";
import {
    Building2, Calendar, CheckCircle2, Eye, Globe2, GraduationCap, KeyRound,
    Mail, MapPin, Megaphone, Phone, ShieldCheck, User, UserCheck, UserX, X
} from "lucide-react";
import DataContext from "@/context/DataContext";
import { LANGUAGE_NAMES } from "@/components/global/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";

function getInitials(name, email) {
    if (name?.trim()) return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (email?.[0] || "?").toUpperCase();
}

// A date in the UI language ("rw" falls back to English where Intl lacks Kinyarwanda); null if unusable.
function formatDate(raw, lang) {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    const opts = { month: "long", day: "numeric", year: "numeric" };
    try { return d.toLocaleDateString(lang === "rw" ? ["rw", "en-RW", "en"] : lang, opts); } catch { return d.toLocaleDateString("en", opts); }
}

const GENDERS = ["male", "female", "other", "non_binary"];

export default function UserProfileModal({ user, isOpen, onClose, onEdit, onSendNotif }) {
    const { isDark } = useContext(DataContext);
    const { t, lang } = useLanguage();

    if (!isOpen || !user) return null;

    const dm = isDark;
    const isInactive = user.is_active === 0;
    const initials = getInitials(user.full_name, user.email);
    const joined = formatDate(user.created_at, lang) || t("admin.user.notSpecified");

    const roleColors = {
        admin: { bg: "bg-purple-100 dark:bg-purple-950/60", text: "text-purple-700 dark:text-purple-300", border: "border-purple-300 dark:border-purple-800" },
        teacher: { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-800" },
        scholar: { bg: "bg-sky-100 dark:bg-sky-950/60", text: "text-sky-700 dark:text-sky-300", border: "border-sky-300 dark:border-sky-800" },
    };

    const roleStyle = roleColors[user.role] || roleColors.scholar;

    return (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#0E1117] border-2 border-slate-300 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                
                {/* Header Banner */}
                <div className="relative px-6 pt-6 pb-5 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white shrink-0">
                    <button aria-label={t("admin.library.close")}
                        onClick={onClose}
                        className="absolute top-4 right-4 text-slate-600 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                        <X size={18} />
                    </button>

                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-teal-600 border-2 border-white/20 flex items-center justify-center text-white text-xl font-black shadow-xl shrink-0">
                            {initials}
                        </div>

                        <div className="min-w-0 flex-1 pr-6 space-y-1">
                            <div className="flex items-center flex-wrap gap-2">
                                <h2 className="text-lg font-black tracking-tight truncate">
                                    {user.full_name || t("admin.user.unnamed")}
                                </h2>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
                                    {t(`role.${user.role}`) || user.role}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                                    isInactive 
                                        ? "bg-slate-800 text-slate-600 border border-slate-700" 
                                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isInactive ? "bg-slate-400" : "bg-emerald-400"}`} />
                                    {isInactive ? t("admin.profile.inactiveAccount") : t("admin.profile.activeAccount")}
                                </span>
                            </div>

                            <p className="text-xs text-slate-500 font-medium truncate flex items-center gap-1.5">
                                <Mail size={13} className="text-teal-400 shrink-0" />
                                {user.email}
                            </p>
                            {user.learner_code && (
                                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1">
                                    {t("school.learnerCode")}: <span className="font-mono font-black">{user.learner_code}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-800 dark:text-slate-200">
                    
                    {/* Grid Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Section 1: Contact & Personal Details */}
                        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                                <User size={14} /> {t("admin.user.personal")}
                            </h3>

                            <div className="space-y-2 text-xs">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.user.phone")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                                        <Phone size={12} className="text-slate-600" />
                                        {user.phone || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.user.gender")}</span>
                                    <span className="font-semibold capitalize text-slate-900 dark:text-white mt-0.5 block">
                                        {user.gender && user.gender !== "prefer_not_to_say" ? (GENDERS.includes(user.gender) ? t(`admin.user.genders.${user.gender}`) : user.gender.replace("_", " ")) : t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.user.preferredLanguage")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                                        <Globe2 size={12} className="text-slate-600" />
                                        {user.preferred_language ? (LANGUAGE_NAMES[user.preferred_language] || user.preferred_language.toUpperCase()) : LANGUAGE_NAMES.en}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: School & Academic Info */}
                        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                                <GraduationCap size={14} /> {t("admin.profile.schoolAcademic")}
                            </h3>

                            <div className="space-y-2 text-xs">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.user.school")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                                        <Building2 size={12} className="text-slate-600" />
                                        {user.school_name || t("admin.user.notAssigned")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.user.gradeLevel")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                                        {user.grade_level || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.profile.joinedPlatform")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                                        <Calendar size={12} className="text-slate-600" />
                                        {joined}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Geographic & Demographic Details */}
                        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 md:col-span-2">
                            <h3 className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                                <MapPin size={14} /> {t("admin.profile.geo")}
                            </h3>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.profile.province")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                                        {user.region_province || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.addUser.district")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                                        {user.region_district || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.user.locationType")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block">
                                        {user.is_rural === 1 ? t("admin.user.rural") : t("admin.user.urban")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-[10px] font-bold text-slate-600 uppercase block">{t("admin.user.disability")}</span>
                                    <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block capitalize">
                                        {user.disability_status || t("admin.user.none")}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-white transition-colors"
                    >
                        {t("admin.profile.close")}
                    </button>

                    <div className="flex items-center gap-2">
                        {onSendNotif && (
                            <button
                                onClick={() => { onClose(); onSendNotif(user.email); }}
                                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] text-white text-xs font-bold shadow-md transition-colors"
                            >
                                <Megaphone size={14} /> {t("admin.profile.sendNotification")}
                            </button>
                        )}
                        {onEdit && (
                            <button
                                onClick={() => { onClose(); onEdit(user); }}
                                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 text-white dark:text-slate-900 text-xs font-black shadow-md transition-colors"
                            >
                                {t("admin.users.editProfile")}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
