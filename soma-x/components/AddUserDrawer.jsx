"use client";

import { useState, useEffect } from "react";
import {
    AlertCircle, CheckCircle2, Eye, EyeOff,
    GraduationCap, Loader2, ShieldCheck, User, UserPlus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

/* ── Role config ── */
const ROLES = [
    { value: "scholar", label: "Scholar", Icon: GraduationCap, color: "text-sky-600 bg-sky-50" },
    { value: "teacher", label: "Teacher", Icon: User,           color: "text-emerald-600 bg-emerald-50" },
    { value: "admin",   label: "Admin",   Icon: ShieldCheck,    color: "text-purple-600 bg-purple-50" },
];

function getInitials(name, email) {
    if (name?.trim()) {
        return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    }
    return (email?.[0] || "?").toUpperCase();
}

export function AddUserDrawer({ user, trigger, onSuccess, restrictToLoginInfo = false }) {
    const { showToast }                     = useToast();
    const [open, setOpen]                   = useState(false);
    const [email, setEmail]                 = useState("");
    const [password, setPassword]           = useState("");
    const [fullName, setFullName]           = useState("");
    const [selectedRole, setSelectedRole]   = useState("teacher");
    const [showPassword, setShowPassword]   = useState(false);
    const [loading, setLoading]             = useState(false);
    const [error, setError]                 = useState(null);
    const [success, setSuccess]             = useState(null);
    // A new learner's sign-in code from the server (e.g. GSK-0012), shown until the admin closes.
    const [createdCode, setCreatedCode]     = useState("");
    const { t }                             = useLanguage();

    const [gender, setGender]               = useState("prefer_not_to_say");
    const [regionProvince, setRegionProvince] = useState("Not Specified");
    const [regionDistrict, setRegionDistrict] = useState("Not Specified");
    const [isRural, setIsRural]             = useState(false);
    const [disabilityStatus, setDisabilityStatus] = useState("none");

    /* Populate form when editing an existing user */
    useEffect(() => {
        if (user) {
            setEmail(user.email || "");
            setFullName(user.full_name || "");
            setSelectedRole(user.role || "teacher");
            setGender(user.gender || "prefer_not_to_say");
            setRegionProvince(user.region_province || "Not Specified");
            setRegionDistrict(user.region_district || "Not Specified");
            setIsRural(user.is_rural === 1);
            setDisabilityStatus(user.disability_status || "none");
            setPassword("");
        } else {
            setEmail("");
            setFullName("");
            setSelectedRole("teacher");
            setGender("prefer_not_to_say");
            setRegionProvince("Not Specified");
            setRegionDistrict("Not Specified");
            setIsRural(false);
            setDisabilityStatus("none");
            setPassword("");
        }
        setError(null);
        setSuccess(null);
        setCreatedCode("");
    }, [user, open]);

    const handleClose = () => {
        if (loading) return;
        setOpen(false);
        setError(null);
        setSuccess(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        const requiresFullProfile = !restrictToLoginInfo;
        if (!email || (requiresFullProfile && !fullName) || (!user && !password) || (requiresFullProfile && !selectedRole)) {
            setError("Please fill in all required fields.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError("Please enter a valid email address.");
            return;
        }

        setLoading(true);
        try {
            const url    = user
                ? `${process.env.NEXT_PUBLIC_SERVER_URL}/users/${user.id}`
                : `${process.env.NEXT_PUBLIC_SERVER_URL}/users`;
            const method = user ? "PATCH" : "POST";
            const body   = { email };
            if (!restrictToLoginInfo) {
                body.fullName = fullName;
                body.role = selectedRole;
                body.gender = gender;
                body.regionProvince = regionProvince;
                body.regionDistrict = regionDistrict;
                body.isRural = isRural;
                body.disabilityStatus = disabilityStatus;
            }
            if (password) body.password = password;

            const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || `Failed to ${user ? "update" : "add"} user`);

            const successMsg = `User ${user ? "updated" : "created"} successfully!`;
            setSuccess(successMsg);
            showToast(successMsg, "success");
            if (!user) { setEmail(""); setFullName(""); setPassword(""); setSelectedRole("teacher"); }
            if (onSuccess) onSuccess();
            // Keep the drawer open for a new learner so the admin can note the code down.
            if (!user && data.user?.learner_code) setCreatedCode(data.user.learner_code);
            else setTimeout(handleClose, 1200);
        } catch (err) {
            setError(err.message);
            showToast(`Action failed: ${err.message}`, "error");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const roleConfig  = ROLES.find(r => r.value === selectedRole) || ROLES[1];
    const initials    = getInitials(fullName, email);
    const displayName = fullName.trim() || email || "New User";

    return (
        <>
            {/* Trigger wrapper */}
            <span onClick={() => setOpen(true)} className="contents">{trigger}</span>

            {/* Modal */}
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
                        onClick={handleClose}
                    />

                    <div className="relative z-10 bg-white rounded-[8px] border border-slate-100 shadow-2xl w-full max-w-md">

                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[5px] bg-slate-100 flex items-center justify-center shrink-0">
                                    <UserPlus className="w-3.5 h-3.5 text-slate-600" />
                                </div>
                                <div>
                                    <h2 className="text-[14px] font-black text-slate-900 leading-tight">
                                        {user ? "Edit User" : "Add User"}
                                    </h2>
                                </div>
                            </div>
                            {!loading && (
                                <button aria-label="Close"
                                    onClick={handleClose}
                                    className="w-7 h-7 flex items-center justify-center rounded-[5px] text-slate-600 hover:bg-slate-100 transition-colors"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="px-5 py-5 space-y-5">

                                {/* ── Live preview card ── */}
                                <div className="flex items-center gap-3 p-3 rounded-[5px] bg-slate-50 border border-slate-100">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-[13px] font-black"
                                        style={{ backgroundColor: "#203B3B" }}
                                    >
                                        {initials}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-bold text-slate-800 truncate">{displayName}</p>
                                        <p className="text-[11px] text-slate-600 truncate">{email || "email@example.com"}</p>
                                    </div>
                                    <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${roleConfig.color}`}>
                                        <roleConfig.Icon className="w-3 h-3" />
                                        {roleConfig.label}
                                    </span>
                                </div>

                                {/* ── Role picker ── */}
                                {!restrictToLoginInfo && (
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                            Role
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {ROLES.map(({ value, label, Icon, color }) => (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    onClick={() => setSelectedRole(value)}
                                                    disabled={loading}
                                                    className={`flex flex-col items-center gap-1.5 py-3 rounded-[5px] border text-[11px] font-bold transition-all ${
                                                        selectedRole === value
                                                            ? "border-accent-dark bg-accent-dark text-white shadow-sm"
                                                            : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white"
                                                    }`}
                                                >
                                                    <div className={`w-7 h-7 rounded-[5px] flex items-center justify-center ${
                                                        selectedRole === value ? "bg-white/20" : color
                                                    }`}>
                                                        <Icon className="w-3.5 h-3.5" />
                                                    </div>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                 {/* ── Full name ── */}
                                {!restrictToLoginInfo && (
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                            Full Name
                                        </label>
                                        <input aria-label="Full Name"
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder="e.g. Amara Ndiaye"
                                            disabled={loading}
                                            className="w-full h-10 px-3 rounded-[5px] border border-slate-200 bg-slate-50 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all disabled:opacity-50"
                                        />
                                    </div>
                                )}

                                {/* ── Demographic & Inclusivity Fields ── */}
                                {!restrictToLoginInfo && (
                                    <div className="space-y-3 pt-2 border-t border-slate-100">
                                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block">
                                            Demographic & Inclusivity Settings (V2.1)
                                        </label>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 block mb-1">Gender</label>
                                                <select aria-label="Gender"
                                                    value={gender}
                                                    onChange={(e) => setGender(e.target.value)}
                                                    disabled={loading}
                                                    className="w-full h-9 px-2 rounded-[5px] border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                                                >
                                                    <option value="prefer_not_to_say">Prefer Not To Say</option>
                                                    <option value="female">Female</option>
                                                    <option value="male">Male</option>
                                                    <option value="non_binary">Non-binary</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 block mb-1">Accessibility / Disability</label>
                                                <select aria-label="Accessibility / Disability"
                                                    value={disabilityStatus}
                                                    onChange={(e) => setDisabilityStatus(e.target.value)}
                                                    disabled={loading}
                                                    className="w-full h-9 px-2 rounded-[5px] border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                                                >
                                                    <option value="none">None</option>
                                                    <option value="visual">Visual Impairment</option>
                                                    <option value="hearing">Hearing Impairment</option>
                                                    <option value="mobility">Mobility Impairment</option>
                                                    <option value="cognitive">Cognitive / Learning</option>
                                                    <option value="other">Other</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 block mb-1">Province</label>
                                                <input aria-label="Province"
                                                    type="text"
                                                    value={regionProvince}
                                                    onChange={(e) => setRegionProvince(e.target.value)}
                                                    placeholder="e.g. Kigali / Northern"
                                                    disabled={loading}
                                                    className="w-full h-9 px-2.5 rounded-[5px] border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-500 block mb-1">District</label>
                                                <input aria-label="District"
                                                    type="text"
                                                    value={regionDistrict}
                                                    onChange={(e) => setRegionDistrict(e.target.value)}
                                                    placeholder="e.g. Gasabo / Musanze"
                                                    disabled={loading}
                                                    className="w-full h-9 px-2.5 rounded-[5px] border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="checkbox"
                                                id="isRuralCheck"
                                                checked={isRural}
                                                onChange={(e) => setIsRural(e.target.checked)}
                                                disabled={loading}
                                                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                            />
                                            <label htmlFor="isRuralCheck" className="text-xs font-bold text-slate-700 cursor-pointer">
                                                Located in Rural / Remote Region (M&E Equity Tracking)
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* ── Email ── */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                        Email
                                    </label>
                                    <input aria-label="Email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="user@example.com"
                                        disabled={loading}
                                        className="w-full h-10 px-3 rounded-[5px] border border-slate-200 bg-slate-50 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all disabled:opacity-50"
                                    />
                                </div>

                                {/* ── Password ── */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                        {user ? "New Password" : "Password"}
                                        {user && <span className="normal-case font-medium text-slate-600 ml-1">(leave blank to keep current)</span>}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            aria-label="Password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder={user ? "Leave blank to keep current" : "••••••••"}
                                            disabled={loading}
                                            className="w-full h-10 px-3 pr-10 rounded-[5px] border border-slate-200 bg-slate-50 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all disabled:opacity-50"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(s => !s)}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            aria-pressed={showPassword}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-600 transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showPassword
                                                ? <EyeOff className="w-4 h-4" />
                                                : <Eye     className="w-4 h-4" />
                                            }
                                        </button>
                                    </div>
                                </div>

                                {/* ── Feedback ── */}
                                {error && (
                                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-[5px] border bg-red-50 border-red-200 text-red-700 text-[12px] font-medium">
                                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                {success && (
                                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-[5px] border bg-green-50 border-green-200 text-green-700 text-[12px] font-medium">
                                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>{success}</span>
                                    </div>
                                )}
                                {createdCode && (
                                    <div role="status" className="px-3 py-3 rounded-[5px] border-2 border-teal-600 bg-teal-50 text-slate-800">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800">{t("school.learnerCode")}</p>
                                        <p className="text-xl font-black font-mono tracking-wider text-slate-900 break-all">{createdCode}</p>
                                        <p className="text-[12px] mt-1">{fill(t("school.users.createdCode"), { code: createdCode })}</p>
                                    </div>
                                )}
                                {createdCode && (
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="w-full h-9 rounded-[5px] bg-slate-900 text-white text-[12px] font-semibold hover:bg-black"
                                    >
                                        {t("school.done")}
                                    </button>
                                )}
                            </div>

                            {/* ── Footer ── */}
                            {!success && (
                                <div className="flex gap-2 px-5 pb-5">
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        disabled={loading}
                                        className="flex-1 h-9 rounded-[5px] border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                                    >
                                        Cancel
                                    </button>
                                    <Button
                                        type="submit"
                                        disabled={
                                            loading ||
                                            !email ||
                                            (!restrictToLoginInfo && !fullName) ||
                                            (!user && !password) ||
                                            (!restrictToLoginInfo && !selectedRole)
                                        }
                                        className="flex-1 h-9 rounded-[5px] text-[12px] font-semibold gap-1.5"
                                    >
                                        {loading
                                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                                            : user ? "Update User" : "Add User"
                                        }
                                    </Button>
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
