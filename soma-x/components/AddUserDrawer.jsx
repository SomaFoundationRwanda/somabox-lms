"use client";

import { useState, useEffect } from "react";
import {
    AlertCircle, CheckCircle2,
    GraduationCap, Loader2, ShieldCheck, User, UserPlus, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { useUsersChanged } from "@/lib/queries/users";
import { Field, PasswordInput, TextInput } from "@/components/form";

/* ── Role config ── */
const ROLES = [
    { value: "scholar", labelKey: "role.scholar", Icon: GraduationCap, color: "text-sky-600 bg-sky-50" },
    { value: "teacher", labelKey: "role.teacher", Icon: User,           color: "text-emerald-600 bg-emerald-50" },
    { value: "admin",   labelKey: "role.admin",   Icon: ShieldCheck,    color: "text-purple-600 bg-purple-50" },
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
    const [loading, setLoading]             = useState(false);
    const [error, setError]                 = useState(null);
    const [success, setSuccess]             = useState(null);
    // A new learner's sign-in code from the server (e.g. GSK-0012), shown until the admin closes.
    const [createdCode, setCreatedCode]     = useState("");
    const { t }                             = useLanguage();
    const usersChanged                      = useUsersChanged();

    // No gender, accessibility or location here: people answer their own profile at first
    // sign-in, and the server places everyone at the school's location (School page).

    /* Populate form when editing an existing user */
    useEffect(() => {
        if (user) {
            setEmail(user.email || "");
            setFullName(user.full_name || "");
            setSelectedRole(user.role || "teacher");
            setPassword("");
        } else {
            setEmail("");
            setFullName("");
            setSelectedRole("teacher");
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
            setError(t("admin.addUser.fillRequired"));
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError(t("admin.addUser.invalidEmail"));
            return;
        }

        setLoading(true);
        try {
            const path   = user ? `/users/${user.id}` : "/users";
            const method = user ? "PATCH" : "POST";
            const body   = { email };
            if (!restrictToLoginInfo) {
                body.fullName = fullName;
                body.role = selectedRole;
            }
            if (password) body.password = password;

            const data = await apiFetch(path, { method, json: body });
            // Every list showing accounts updates (the admin home's list included).
            usersChanged();

            const successMsg = t(user ? "admin.addUser.updated" : "admin.addUser.created");
            setSuccess(successMsg);
            showToast(successMsg, "success");
            if (!user) { setEmail(""); setFullName(""); setPassword(""); setSelectedRole("teacher"); }
            if (onSuccess) onSuccess();
            // Keep the drawer open for a new learner so the admin can note the code down.
            if (!user && data.user?.learner_code) setCreatedCode(data.user.learner_code);
            else setTimeout(handleClose, 1200);
        } catch (err) {
            const message = getErrorMessage(err, t);
            setError(message);
            showToast(fill(t("admin.addUser.actionFailed"), { error: message }), "error");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const roleConfig  = ROLES.find(r => r.value === selectedRole) || ROLES[1];
    const initials    = getInitials(fullName, email);
    const displayName = fullName.trim() || email || t("admin.addUser.newUser");

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

                    {/* Never taller than the screen: after a learner is added, the code and Done must stay reachable. */}
                    <div role="dialog" aria-modal="true" aria-labelledby="add-user-title" className="relative z-10 bg-white rounded-[8px] border border-slate-100 shadow-2xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">

                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[5px] bg-slate-100 flex items-center justify-center shrink-0">
                                    <UserPlus className="w-3.5 h-3.5 text-slate-600" />
                                </div>
                                <div>
                                    <h2 id="add-user-title" className="text-[14px] font-black text-slate-900 leading-tight">
                                        {user ? t("admin.addUser.editTitle") : t("admin.addUser.addTitle")}
                                    </h2>
                                </div>
                            </div>
                            {!loading && (
                                <button aria-label={t("admin.library.close")}
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
                                        style={{ backgroundColor: "var(--brand-primary)" }}
                                    >
                                        {initials}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-bold text-slate-800 truncate">{displayName}</p>
                                        <p className="text-[11px] text-slate-600 truncate">{email || "email@example.com"}</p>
                                    </div>
                                    <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${roleConfig.color}`}>
                                        <roleConfig.Icon className="w-3 h-3" />
                                        {t(roleConfig.labelKey)}
                                    </span>
                                </div>

                                {/* ── Role picker ── */}
                                {!restrictToLoginInfo && (
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                            {t("admin.users.colRole")}
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {ROLES.map(({ value, labelKey, Icon, color }) => (
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
                                                    {t(labelKey)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                 {/* ── Full name ── */}
                                {!restrictToLoginInfo && (
                                    <Field label={t("admin.addUser.fullName")}>
                                        <TextInput
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            placeholder={t("admin.addUser.fullNamePlaceholder")}
                                            disabled={loading}
                                        />
                                    </Field>
                                )}

                                {/* ── Email ── */}
                                <Field label={t("admin.addUser.email")}>
                                    <TextInput
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="user@example.com"
                                        disabled={loading}
                                    />
                                </Field>

                                {/* ── Password ── */}
                                <Field
                                    label={user ? t("admin.addUser.newPassword") : t("admin.addUser.tempPassword")}
                                    optional={user ? t("admin.addUser.keepCurrentParen") : undefined}
                                    hint={t("admin.addUser.tempPasswordHint")}
                                >
                                    {/* Named "Password" for assistive technology, whatever the visible label says. */}
                                    <PasswordInput
                                        aria-label={t("admin.addUser.password")}
                                        toggleLabel={t("admin.addUser.showPassword")}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder={user ? t("admin.addUser.keepCurrent") : "••••••••"}
                                        autoComplete="new-password"
                                        disabled={loading}
                                    />
                                </Field>

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
                                        {t("admin.common.cancel")}
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
                                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("admin.addUser.saving")}</>
                                            : user ? t("admin.addUser.update") : t("admin.addUser.addTitle")
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
