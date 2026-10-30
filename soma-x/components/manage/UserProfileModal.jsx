"use client";

import { useContext } from "react";
import {
    Building2, Calendar, CheckCircle2, Eye, Globe2, GraduationCap, KeyRound,
    Mail, MapPin, Megaphone, Phone, ShieldCheck, User, UserCheck, UserX, X
} from "lucide-react";
import DataContext from "@/context/DataContext";
import { LANGUAGE_NAMES } from "@/components/global/LanguageSwitcher";
import { useLanguage } from "@/context/LanguageContext";
import { shownEmail } from "@/lib/session";
import { accessLabel, genderLabel } from "@/lib/profileOptions";

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


export default function UserProfileModal({ user, isOpen, onClose, onEdit, onSendNotif }) {
    const { isDark } = useContext(DataContext);
    const { t, lang } = useLanguage();

    if (!isOpen || !user) return null;

    const dm = isDark;
    const isInactive = user.is_active === 0;
    const initials = getInitials(user.full_name, user.email);
    const joined = formatDate(user.created_at, lang) || t("admin.user.notSpecified");

    const roleColors = {
        admin: { bg: "bg-info-soft", text: "text-info-fg", border: "border-info/30" },
        teacher: { bg: "bg-success-soft", text: "text-success-fg", border: "border-success/30" },
        scholar: { bg: "bg-info-soft", text: "text-info-fg", border: "border-info/30" },
    };

    const roleStyle = roleColors[user.role] || roleColors.scholar;

    return (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-scrim backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-surface-raised border-2 border-line-strong rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                
                {/* Header Banner */}
                <div className="relative px-6 pt-6 pb-5 dark bg-gradient-to-r from-surface-sunken via-brand-strong to-surface-sunken text-fg shrink-0">
                    <button aria-label={t("admin.library.close")}
                        onClick={onClose}
                        className="absolute top-4 right-4 text-fg-muted hover:text-fg p-1.5 rounded-xl hover:bg-surface-hover transition-colors"
                    >
                        <X size={18} />
                    </button>

                    <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-brand border-2 border-white/20 flex items-center justify-center text-on-brand text-section font-extrabold shadow-xl shrink-0">
                            {initials}
                        </div>

                        <div className="min-w-0 flex-1 pr-6 space-y-1">
                            <div className="flex items-center flex-wrap gap-2">
                                <h2 className="text-section font-extrabold tracking-tight truncate">
                                    {user.full_name || t("admin.user.unnamed")}
                                </h2>
                                <span className={`px-2.5 py-0.5 rounded-full text-caption font-extrabold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
                                    {t(`role.${user.role}`) || user.role}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-caption font-extrabold flex items-center gap-1 ${
                                    isInactive 
                                        ? "bg-surface-raised text-fg-muted border border-line" 
                                        : "bg-success/20 text-success-fg border border-success/30"
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isInactive ? "bg-line-strong" : "bg-success"}`} />
                                    {isInactive ? t("admin.profile.inactiveAccount") : t("admin.profile.activeAccount")}
                                </span>
                            </div>

                            <p className="text-caption text-fg-subtle font-medium truncate flex items-center gap-1.5">
                                <Mail size={13} className="text-brand-fg shrink-0" />
                                {shownEmail(user)}
                            </p>
                            {user.learner_code && (
                                <p className="text-caption text-fg-muted font-medium mt-1">
                                    {t("school.learnerCode")}: <span className="font-mono font-extrabold">{user.learner_code}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1 text-fg">
                    
                    {/* Grid Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Section 1: Contact & Personal Details */}
                        <div className="bg-surface-sunken border border-line rounded-2xl p-4 space-y-3">
                            <h3 className="text-caption font-extrabold text-brand-fg flex items-center gap-1.5">
                                <User size={14} /> {t("admin.user.personal")}
                            </h3>

                            <div className="space-y-2 text-caption">
                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.user.phone")}</span>
                                    <span className="font-semibold text-fg flex items-center gap-1.5 mt-0.5">
                                        <Phone size={12} className="text-fg-muted" />
                                        {user.phone || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.user.gender")}</span>
                                    <span className="font-semibold capitalize text-fg mt-0.5 block">
                                        {genderLabel(t, user.gender)}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.user.preferredLanguage")}</span>
                                    <span className="font-semibold text-fg flex items-center gap-1.5 mt-0.5">
                                        <Globe2 size={12} className="text-fg-muted" />
                                        {user.preferred_language ? (LANGUAGE_NAMES[user.preferred_language] || user.preferred_language.toUpperCase()) : LANGUAGE_NAMES.en}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: School & Academic Info */}
                        <div className="bg-surface-sunken border border-line rounded-2xl p-4 space-y-3">
                            <h3 className="text-caption font-extrabold text-brand-fg flex items-center gap-1.5">
                                <GraduationCap size={14} /> {t("admin.profile.schoolAcademic")}
                            </h3>

                            <div className="space-y-2 text-caption">
                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.user.school")}</span>
                                    <span className="font-semibold text-fg flex items-center gap-1.5 mt-0.5">
                                        <Building2 size={12} className="text-fg-muted" />
                                        {user.school_name || t("admin.user.notAssigned")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.user.gradeLevel")}</span>
                                    <span className="font-semibold text-fg mt-0.5 block">
                                        {user.grade_level || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.profile.joinedPlatform")}</span>
                                    <span className="font-semibold text-fg flex items-center gap-1.5 mt-0.5">
                                        <Calendar size={12} className="text-fg-muted" />
                                        {joined}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Geographic & Demographic Details */}
                        <div className="bg-surface-sunken border border-line rounded-2xl p-4 space-y-3 md:col-span-2">
                            <h3 className="text-caption font-extrabold text-brand-fg flex items-center gap-1.5">
                                <MapPin size={14} /> {t("admin.profile.geo")}
                            </h3>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-caption">
                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.profile.province")}</span>
                                    <span className="font-semibold text-fg mt-0.5 block">
                                        {user.region_province || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.addUser.district")}</span>
                                    <span className="font-semibold text-fg mt-0.5 block">
                                        {user.region_district || t("admin.user.notSpecified")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.user.locationType")}</span>
                                    <span className="font-semibold text-fg mt-0.5 block">
                                        {user.is_rural === 1 ? t("admin.user.rural") : t("admin.user.urban")}
                                    </span>
                                </div>

                                <div>
                                    <span className="text-caption font-bold text-fg-muted block">{t("admin.user.disability")}</span>
                                    <span className="font-semibold text-fg mt-0.5 block capitalize">
                                        {accessLabel(t, user.disability_status)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 bg-surface-sunken border-t border-line flex items-center justify-between gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 h-10 rounded-xl bg-line hover:bg-line-strong text-caption font-bold text-fg transition-colors"
                    >
                        {t("admin.profile.close")}
                    </button>

                    <div className="flex items-center gap-2">
                        {onSendNotif && (
                            <button
                                onClick={() => { onClose(); onSendNotif(user.email); }}
                                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-brand hover:bg-brand/90 text-on-brand text-caption font-bold shadow-md transition-colors"
                            >
                                <Megaphone size={14} /> {t("admin.profile.sendNotification")}
                            </button>
                        )}
                        {onEdit && (
                            <button
                                onClick={() => { onClose(); onEdit(user); }}
                                className="flex items-center gap-1.5 px-4 h-10 rounded-xl bg-fg hover:bg-fg/90 text-surface text-caption font-extrabold shadow-md transition-colors"
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
