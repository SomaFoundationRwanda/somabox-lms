"use client";

import { useContext, useEffect, useState } from "react";
import {
    BookOpen, CheckCircle2, GraduationCap,
    Download, Hash, KeyRound, Lock, Mail, MapPin, Pencil, Save, School, ShieldAlert, User, X
} from "lucide-react";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { downloadFile } from "@/lib/download";

// "Download my data": everything the box holds about the signed-in person, as a JSON file.
function DownloadMyData({ SERVER_URL }) {
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);
    const download = async () => {
        setBusy(true);
        try {
            await downloadFile(`${SERVER_URL}/analytics/my-data`, `somabox-my-data-${new Date().toISOString().slice(0, 10)}.json`);
            showToast("Your data was downloaded", "success");
        } catch (err) {
            showToast(err.message || "Download failed", "error");
        } finally {
            setBusy(false);
        }
    };
    return (
        <section aria-labelledby="my-data-title" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <div className="min-w-0">
                <h2 id="my-data-title" className="text-[13px] font-bold text-slate-800">Your data</h2>
                <p className="text-[11px] text-slate-600 max-w-xl">Download a file with everything this box holds about you: your profile, courses, work, results, and usage logs.</p>
            </div>
            <button
                type="button"
                onClick={download}
                disabled={busy || !SERVER_URL}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
                <Download size={13} aria-hidden="true" /> {busy ? "Preparing…" : "Download my data"}
            </button>
        </section>
    );
}


const AVATAR_GRADIENTS = [
    ["#7c3aed", "#6d28d9"],
    ["#2563eb", "#4f46e5"],
    ["#0d9488", "#059669"],
    ["#d97706", "#ea580c"],
    ["#203A3A", "#0D9488"], // app's own teal accent, replacing the former red/rose entry
];

function getAvatarColors(name) {
    if (!name) return AVATAR_GRADIENTS[2];
    return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
}

function getInitials(name) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function PasswordField({ id, label, placeholder, value, onChange }) {
    const [show, setShow] = useState(false);
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-[11px] font-semibold text-slate-500">{label}</label>
            <div className="relative">
                <Lock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <input
                    id={id}
                    type={show ? "text" : "password"}
                    placeholder={placeholder}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="w-full h-10 pl-9 pr-14 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 transition-colors"
                    required
                    autoComplete="off"
                />
                <button
                    type="button"
                    onClick={() => setShow(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-600 hover:text-slate-600"
                >
                    {show ? "Hide" : "Show"}
                </button>
            </div>
        </div>
    );
}

export default function AccountPage() {
    const { authenticated, SERVER_URL, isDark, user, refreshUser } = useContext(DataContext);
    const ACCENT = isDark ? "#0D9488" : "#203A3A";
    const pageBg = isDark ? "#080B0F" : "#F0F2F5";
    const heroFade = isDark ? "#080B0F" : "#F0F2F5";

    const { showToast } = useToast();
    const { t } = useLanguage();
    const currentEmail = user?.email || "";
    const currentRole = user?.role || "";
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [savingPassword,  setSavingPassword]  = useState(false);
    const [savingDemographics, setSavingDemographics] = useState(false);
    const [editDemographics, setEditDemographics] = useState(false);
    const [activeTab, setActiveTab] = useState("profile");
    // Set by the server (e.g. the default admin, or after an admin password reset).
    const mustChangePassword = !!user?.mustChangePassword;

    useEffect(() => {
        if (mustChangePassword) setActiveTab("security");
    }, [mustChangePassword]);
    const [status, setStatus] = useState({ type: "", message: "" });

    const [profileView, setProfileView] = useState({ email: "", fullName: "" });
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "", newPassword: "", confirmPassword: "",
    });
    const [demoForm, setDemoForm] = useState({
        gender: "prefer_not_to_say",
        regionProvince: "",
        regionDistrict: "",
        isRural: false,
        disabilityStatus: "none"
    });

    useEffect(() => {
        const load = async () => {
            if (!SERVER_URL || !currentEmail || !currentRole || !authenticated) {
                setLoadingProfile(false); return;
            }
            try {
                setLoadingProfile(true);
                const res  = await fetch(`${SERVER_URL}/users/profile/view`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || "Failed to load profile");
                setProfileView({
                    email: data.email || "",
                    fullName: data.full_name || "",
                    learnerCode: data.learner_code || "",
                    schoolName: data.school?.name || data.school_name || "",
                    gender: data.gender || "prefer_not_to_say",
                    province: data.region_province || "Not Specified",
                    district: data.region_district || "Not Specified",
                    isRural: data.is_rural === 1,
                    disability: data.disability_status || "none"
                });
                setDemoForm({
                    gender: data.gender || "prefer_not_to_say",
                    regionProvince: data.region_province && data.region_province !== 'Not Specified' ? data.region_province : "",
                    regionDistrict: data.region_district && data.region_district !== 'Not Specified' ? data.region_district : "",
                    isRural: data.is_rural === 1,
                    disabilityStatus: data.disability_status || "none"
                });
            } catch (err) {
                setStatus({ type: "error", message: err.message });
            } finally {
                setLoadingProfile(false);
            }
        };
        load();
    }, [SERVER_URL, currentEmail, currentRole, authenticated]);

    const handleDemographicsSave = async (e) => {
        e.preventDefault();
        try {
            setSavingDemographics(true);
            setStatus({ type: "", message: "" });
            const res = await fetch(`${SERVER_URL}/users/profile/update`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    gender: demoForm.gender,
                    regionProvince: demoForm.regionProvince || "Not Specified",
                    regionDistrict: demoForm.regionDistrict || "Not Specified",
                    isRural: demoForm.isRural,
                    disabilityStatus: demoForm.disabilityStatus
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to update profile");
            
            const updatedProvince = demoForm.regionProvince || "Not Specified";
            const updatedDistrict = demoForm.regionDistrict || "Not Specified";

            setProfileView(prev => ({
                ...prev,
                gender: demoForm.gender,
                province: updatedProvince,
                district: updatedDistrict,
                isRural: demoForm.isRural,
                disability: demoForm.disabilityStatus
            }));

            if (typeof window !== 'undefined' && currentEmail) {
                localStorage.setItem(`somabox_profile_completed_${currentEmail}`, 'true');
            }

            showToast("Profile & Demographic information updated successfully!", "success");
            setStatus({ type: "success", message: "Profile & demographic details updated successfully." });
            setEditDemographics(false);
        } catch (err) {
            showToast(err.message || "Failed to update profile", "error");
            setStatus({ type: "error", message: err.message });
        } finally {
            setSavingDemographics(false);
        }
    };

    const handlePasswordSave = async (e) => {
        e.preventDefault();
        const { currentPassword, newPassword, confirmPassword } = passwordForm;
        if (!currentPassword || !newPassword || !confirmPassword) {
            setStatus({ type: "error", message: "All password fields are required." }); return;
        }
        if (newPassword.length < 6) {
            setStatus({ type: "error", message: "New password must be at least 6 characters." }); return;
        }
        if (newPassword !== confirmPassword) {
            setStatus({ type: "error", message: "Passwords do not match." }); return;
        }
        try {
            setSavingPassword(true);
            setStatus({ type: "", message: "" });
            const res  = await fetch(`${SERVER_URL}/users/profile/password`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to update password");
            setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setStatus({ type: "success", message: "Password updated successfully." });
            if (mustChangePassword) await refreshUser();
        } catch (err) {
            setStatus({ type: "error", message: err.message });
        } finally {
            setSavingPassword(false);
        }
    };

    const [c1, c2]   = getAvatarColors(profileView.fullName);
    const initials   = getInitials(profileView.fullName);
    const roleLabel  = currentRole ? currentRole.charAt(0).toUpperCase() + currentRole.slice(1) : "";

    return (
        <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: pageBg }}>

            {/* ── Cinematic hero header ── */}
            <div
                className="relative overflow-hidden pl-12"
                style={{ background: "linear-gradient(135deg, #071919 0%, #0d2b2b 40%, #152e2e 70%, #0a2020 100%)" }}
            >
                {/* Dot-grid texture */}
                <div className="absolute inset-0 opacity-40" style={{
                    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                }} />

                {/* Glowing blur orbs */}
                <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full blur-3xl" style={{ background: "rgba(20,184,166,0.12)" }} />
                <div className="absolute -bottom-16 left-1/3 w-64 h-64 rounded-full blur-3xl" style={{ background: "rgba(52,211,153,0.08)" }} />
                <div className="absolute top-10 left-1/2 w-48 h-48 rounded-full blur-3xl" style={{ background: "rgba(99,102,241,0.08)" }} />

                {/* Content */}
                <div className="relative px-5 md:px-8 py-10 md:py-14">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">

                        {/* Avatar with glow */}
                        {loadingProfile ? (
                            <div className="w-20 h-20 rounded-3xl bg-white/10 animate-pulse shrink-0" />
                        ) : (
                            <div className="relative shrink-0">
                                {/* Glow halo */}
                                <div className="absolute inset-0 rounded-3xl blur-xl opacity-60 scale-110"
                                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
                                <div
                                    className="relative w-20 h-20 md:w-24 md:h-24 rounded-3xl flex items-center justify-center shadow-2xl"
                                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                                >
                                    <span className="text-[28px] md:text-[32px] font-black text-white tracking-tight">
                                        {initials}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Name block */}
                        <div className="flex-1 min-w-0">
                            {loadingProfile ? (
                                <div className="space-y-2 animate-pulse">
                                    <div className="h-8 w-48 bg-white/10 rounded-xl" />
                                    <div className="h-4 w-36 bg-white/10 rounded-xl" />
                                </div>
                            ) : (
                                <>
                                    <p className="text-[26px] md:text-[30px] font-black text-white tracking-tight leading-tight mb-1">
                                        {profileView.fullName || "—"}
                                    </p>
                                    <p className="text-[13px] text-white/40 mb-4">{profileView.email}</p>
                                    {profileView.learnerCode && (
                                        <p className="mb-4 text-[13px] text-white/80">
                                            {t("school.learnerCode")}:{" "}
                                            <span className="font-mono font-black text-white tracking-wider">{profileView.learnerCode}</span>
                                            <span className="block text-[12px] text-white/60 mt-0.5">{t("school.account.codeHint")}</span>
                                        </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold text-white/90 border border-white/15 bg-white/10 backdrop-blur-sm">
                                            <GraduationCap size={11} />
                                            {roleLabel}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                            Active
                                        </span>
                                        {profileView.isRural && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold text-teal-300 border border-teal-500/30 bg-teal-500/10 backdrop-blur-sm">
                                                Rural Learner Profile
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Stat chips — desktop only */}
                        <div className="hidden lg:flex flex-col items-end gap-3 shrink-0">
                            {[
                                { icon: <BookOpen size={13} />, label: "Lessons", color: "text-violet-300", border: "border-violet-500/30", bg: "bg-violet-500/10" },
                                { icon: <CheckCircle2 size={13} />, label: "Classes", color: "text-teal-300", border: "border-teal-500/30", bg: "bg-teal-500/10" },
                            ].map(({ icon, label, color, border, bg }) => (
                                <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${border} ${bg} backdrop-blur-sm`}>
                                    <span className={color}>{icon}</span>
                                    <span className={`text-[11px] font-semibold ${color}`}>{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom fade */}
                <div className="absolute bottom-0 left-0 right-0 h-8"
                    style={{ background: `linear-gradient(to top, ${heroFade}, transparent)` }} />
            </div>

            {/* ── Page body ── */}
            <div className="px-4 sm:px-6 pt-4">

                {mustChangePassword && (
                    <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border text-[12px] font-medium bg-amber-50 border-amber-200 text-amber-800">
                        <ShieldAlert size={14} className="shrink-0" />
                        This account is still using a default password. Set a new password to continue.
                    </div>
                )}

                {/* Status */}
                {status.message && (
                    <div className={`mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border text-[12px] font-medium ${
                        status.type === "success"
                            ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                            : "bg-red-50 border-red-100 text-red-600"
                    }`}>
                        {status.type === "success"
                            ? <CheckCircle2 size={14} className="shrink-0" />
                            : <ShieldAlert size={14} className="shrink-0" />
                        }
                        {status.message}
                    </div>
                )}

                {/* Tab bar */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-1 flex gap-1 mb-4">
                    {[
                        { id: "profile",  label: "Profile",  icon: <User size={13} /> },
                        { id: "security", label: "Security", icon: <KeyRound size={13} /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => { setActiveTab(tab.id); setStatus({ type: "", message: "" }); }}
                            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold transition-all duration-150 ${
                                activeTab === tab.id
                                    ? "text-white shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                            }`}
                            style={activeTab === tab.id ? { backgroundColor: ACCENT } : {}}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Profile tab ── */}
                {activeTab === "profile" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

                        {/* Personal info card */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c1}20` }}>
                                        <User size={13} style={{ color: c1 }} />
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-bold text-slate-800">Personal Info & Demographics</p>
                                        <p className="text-[10px] text-slate-600">V2.1 Inclusivity & Regional profile</p>
                                    </div>
                                </div>
                                {!loadingProfile && (
                                    <button
                                        type="button"
                                        onClick={() => setEditDemographics(!editDemographics)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 transition-colors"
                                    >
                                        {editDemographics ? <X size={12} /> : <Pencil size={12} />}
                                        {editDemographics ? "Cancel" : "Edit Profile"}
                                    </button>
                                )}
                            </div>

                            {loadingProfile ? (
                                <div className="p-5 space-y-4 animate-pulse">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="flex justify-between">
                                            <div className="h-3 bg-slate-100 rounded w-20" />
                                            <div className="h-3 bg-slate-100 rounded w-32" />
                                        </div>
                                    ))}
                                </div>
                            ) : editDemographics ? (
                                <form onSubmit={handleDemographicsSave} className="p-5 space-y-4">
                                    {/* Gender */}
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Gender</label>
                                        <select aria-label="Gender"
                                            value={demoForm.gender}
                                            onChange={e => setDemoForm({ ...demoForm, gender: e.target.value })}
                                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white outline-none focus:border-accent-dark"
                                        >
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="non_binary">Non-Binary</option>
                                            <option value="prefer_not_to_say">Prefer Not To Say</option>
                                        </select>
                                    </div>

                                    {/* Province */}
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Province / State</label>
                                        <input aria-label="Province / State"
                                            type="text"
                                            placeholder="e.g. Kigali, Northern Province, Eastern Province"
                                            value={demoForm.regionProvince}
                                            onChange={e => setDemoForm({ ...demoForm, regionProvince: e.target.value })}
                                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white outline-none focus:border-accent-dark"
                                        />
                                    </div>

                                    {/* District */}
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">District / Region</label>
                                        <input aria-label="District / Region"
                                            type="text"
                                            placeholder="e.g. Gasabo, Nyarugenge, Musanze, Huye"
                                            value={demoForm.regionDistrict}
                                            onChange={e => setDemoForm({ ...demoForm, regionDistrict: e.target.value })}
                                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white outline-none focus:border-accent-dark"
                                        />
                                    </div>

                                    {/* Is Rural checkbox */}
                                    <div className="flex items-center gap-2 pt-1">
                                        <input
                                            type="checkbox"
                                            id="account-is-rural"
                                            checked={demoForm.isRural}
                                            onChange={e => setDemoForm({ ...demoForm, isRural: e.target.checked })}
                                            className="w-4 h-4 rounded text-accent-dark focus:ring-accent-dark border-slate-300 cursor-pointer"
                                        />
                                        <label htmlFor="account-is-rural" className="text-xs font-semibold text-slate-700 cursor-pointer select-none">
                                            Located in a rural / remote learning area
                                        </label>
                                    </div>

                                    {/* Disability status */}
                                    <div className="space-y-1 pt-1">
                                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Accessibility Options</label>
                                        <select aria-label="Accessibility Options"
                                            value={demoForm.disabilityStatus}
                                            onChange={e => setDemoForm({ ...demoForm, disabilityStatus: e.target.value })}
                                            className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white outline-none focus:border-accent-dark"
                                        >
                                            <option value="none">None / Standard</option>
                                            <option value="visual">Visual Impairment</option>
                                            <option value="hearing">Hearing Impairment</option>
                                            <option value="mobility">Mobility Impairment</option>
                                            <option value="cognitive">Cognitive Adaptation</option>
                                            <option value="other">Other Need</option>
                                        </select>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={savingDemographics}
                                        className="w-full h-10 rounded-xl bg-accent-dark text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-md hover:bg-black transition-colors disabled:opacity-50 mt-2"
                                    >
                                        <Save size={13} />
                                        {savingDemographics ? "Saving Profile…" : "Save Demographic Info"}
                                    </button>
                                </form>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {[
                                        { icon: <User size={13} className="text-slate-600" />,         label: "Full name",          value: profileView.fullName },
                                        { icon: <Mail size={13} className="text-slate-600" />,         label: "Email",              value: profileView.email },
                                        ...(profileView.learnerCode ? [{ icon: <Hash size={13} className="text-slate-600" />, label: t("school.learnerCode"), value: profileView.learnerCode }] : []),
                                        ...(profileView.schoolName ? [{ icon: <School size={13} className="text-slate-600" />, label: t("school.schoolWord"), value: profileView.schoolName }] : []),
                                        { icon: <GraduationCap size={13} className="text-slate-600" />, label: "Role",              value: roleLabel },
                                        { icon: <User size={13} className="text-slate-600" />,         label: "Gender",             value: profileView.gender ? profileView.gender.replace('_', ' ').toUpperCase() : "Prefer Not To Say" },
                                        { icon: <MapPin size={13} className="text-slate-600" />,      label: "Region / Location",  value: `${profileView.province} (${profileView.district})${profileView.isRural ? " - Rural" : " - Urban"}` },
                                        { icon: <User size={13} className="text-slate-600" />,         label: "Accessibility Status", value: profileView.disability ? profileView.disability.toUpperCase() : "NONE" },
                                    ].map(({ icon, label, value }) => (
                                        <div key={label} className="flex items-center justify-between px-5 py-3.5">
                                            <div className="flex items-center gap-2 text-slate-500">
                                                {icon}
                                                <span className="text-[12px] font-medium">{label}</span>
                                            </div>
                                            <span className="text-[12px] font-semibold text-slate-800">{value || "—"}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Access card */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                                    <BookOpen size={13} className="text-amber-500" />
                                </div>
                                <p className="text-[13px] font-bold text-slate-800">Platform Access</p>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {[
                                    { label: "Account type", value: "Scholar (Student)" },
                                    { label: "Platform",     value: "SOMABOX" },
                                    { label: "Access level", value: "Classes, Lessons & Library" },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex items-center justify-between px-5 py-3.5">
                                        <span className="text-[12px] font-medium text-slate-500">{label}</span>
                                        <span className="text-[12px] font-semibold text-slate-800">{value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="px-5 py-4 border-t border-slate-100">
                                <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                                    <BookOpen size={12} className="text-blue-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-blue-600 leading-relaxed">
                                        To update your name or email, contact your teacher or school administrator.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Security tab ── */}
                {activeTab === "security" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                        <form onSubmit={handlePasswordSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
                                    <KeyRound size={13} className="text-teal-500" />
                                </div>
                                <div>
                                    <p className="text-[13px] font-bold text-slate-800">Change Password</p>
                                    <p className="text-[10px] text-slate-600">Minimum 6 characters</p>
                                </div>
                            </div>
                            <div className="p-5 space-y-4">
                                <PasswordField
                                    id="current-password"
                                    label="Current password"
                                    placeholder="Enter current password"
                                    value={passwordForm.currentPassword}
                                    onChange={v => setPasswordForm(p => ({ ...p, currentPassword: v }))}
                                />
                                <PasswordField
                                    id="new-password"
                                    label="New password"
                                    placeholder="Enter new password"
                                    value={passwordForm.newPassword}
                                    onChange={v => setPasswordForm(p => ({ ...p, newPassword: v }))}
                                />
                                <PasswordField
                                    id="confirm-password"
                                    label="Confirm new password"
                                    placeholder="Re-enter new password"
                                    value={passwordForm.confirmPassword}
                                    onChange={v => setPasswordForm(p => ({ ...p, confirmPassword: v }))}
                                />
                                <button
                                    type="submit"
                                    disabled={savingPassword}
                                    className="w-full h-10 rounded-xl text-[13px] font-bold text-white transition-opacity disabled:opacity-50 mt-1"
                                    style={{ backgroundColor: ACCENT }}
                                >
                                    {savingPassword ? "Updating…" : "Change Password"}
                                </button>
                            </div>
                        </form>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-3">Tips</p>
                            <div className="space-y-2.5">
                                {[
                                    "Use at least 6 characters",
                                    "Mix letters, numbers and symbols",
                                    "Avoid using your name or email",
                                    "Never share your password",
                                ].map((tip, i) => (
                                    <div key={i} className="flex items-center gap-2.5">
                                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                                        <p className="text-[12px] text-slate-600">{tip}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <DownloadMyData SERVER_URL={SERVER_URL} />
            </div>
        </div>
    );
}
