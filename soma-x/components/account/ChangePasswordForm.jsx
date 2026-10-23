"use client";

// Changing your own password: the Account page (learners, admins) and Teacher Settings. Changing
// it signs you out on your other devices; a required change (temporary password) then lifts.
import { useContext, useState } from "react";
import { Lock } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";

const MIN_LENGTH = 6;

export function PasswordField({ id, label, placeholder, value, onChange, darkAware = false }) {
    const { t } = useLanguage();
    const [show, setShow] = useState(false);
    const dark = darkAware ? " dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100" : "";
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className={`text-[11px] font-semibold text-slate-500${darkAware ? " dark:text-slate-400" : ""}`}>{label}</label>
            <div className="relative">
                <Lock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <input
                    id={id}
                    type={show ? "text" : "password"}
                    placeholder={placeholder}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className={`w-full h-10 pl-9 pr-14 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 transition-colors${dark}`}
                    required
                    autoComplete="off"
                />
                <button
                    type="button"
                    onClick={() => setShow(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-600 hover:text-slate-600"
                >
                    {show ? t("learner.account.hide") : t("learner.account.show")}
                </button>
            </div>
        </div>
    );
}

/** `onStatus({ type: "success" | "error", message })` reports the outcome. */
export default function ChangePasswordForm({ onStatus, accent = "var(--brand-primary)", darkAware = false }) {
    const { SERVER_URL, user, refreshUser } = useContext(DataContext);
    const { t } = useLanguage();
    const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [saving, setSaving] = useState(false);
    const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const { currentPassword, newPassword, confirmPassword } = form;
        if (!currentPassword || !newPassword || !confirmPassword) return onStatus({ type: "error", message: t("learner.account.pwAllRequired") });
        if (newPassword.length < MIN_LENGTH) return onStatus({ type: "error", message: t("learner.account.pwTooShort") });
        if (newPassword !== confirmPassword) return onStatus({ type: "error", message: t("learner.account.pwMismatch") });
        try {
            setSaving(true);
            onStatus({ type: "", message: "" });
            const res = await fetch(`${SERVER_URL}/users/profile/password`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || t("learner.account.pwFailed"));
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            onStatus({ type: "success", message: t("learner.account.pwUpdated") });
            if (user?.mustChangePassword) await refreshUser();
        } catch (err) {
            onStatus({ type: "error", message: err.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordField id="current-password" label={t("learner.account.currentPassword")} placeholder={t("learner.account.currentPasswordPh")}
                value={form.currentPassword} onChange={set("currentPassword")} darkAware={darkAware} />
            <PasswordField id="new-password" label={t("learner.account.newPassword")} placeholder={t("learner.account.newPasswordPh")}
                value={form.newPassword} onChange={set("newPassword")} darkAware={darkAware} />
            <PasswordField id="confirm-password" label={t("learner.account.confirmPassword")} placeholder={t("learner.account.confirmPasswordPh")}
                value={form.confirmPassword} onChange={set("confirmPassword")} darkAware={darkAware} />
            <button
                type="submit"
                disabled={saving}
                className="w-full h-10 rounded-xl text-[13px] font-bold text-white transition-opacity disabled:opacity-50 mt-1"
                style={{ backgroundColor: accent }}
            >
                {saving ? t("learner.account.updating") : t("learner.account.changePassword")}
            </button>
        </form>
    );
}
