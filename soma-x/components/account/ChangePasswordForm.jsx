"use client";

// Changing your own password: the Account page (learners, admins) and Teacher Settings. Changing
// it signs you out on your other devices; a required change (temporary password) then lifts.
import { useContext, useState } from "react";
import { Field, PasswordInput } from "@/components/form";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, getErrorMessage } from "@/lib/api";

const MIN_LENGTH = 6;

/** `onStatus({ type: "success" | "error", message })` reports the outcome. */
export default function ChangePasswordForm({ onStatus, accent = "var(--brand-primary)" }) {
    const { user, refreshUser } = useContext(DataContext);
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
            await apiFetch("/users/profile/password", { method: "PATCH", json: { currentPassword, newPassword } });
            setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            onStatus({ type: "success", message: t("learner.account.pwUpdated") });
            if (user?.mustChangePassword) await refreshUser();
        } catch (err) {
            onStatus({ type: "error", message: err?.body?.message || getErrorMessage(err, t) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Field id="current-password" label={t("learner.account.currentPassword")}>
                <PasswordInput placeholder={t("learner.account.currentPasswordPh")} value={form.currentPassword} onChange={(e) => set("currentPassword")(e.target.value)} required autoComplete="current-password" />
            </Field>
            <Field id="new-password" label={t("learner.account.newPassword")}>
                <PasswordInput placeholder={t("learner.account.newPasswordPh")} value={form.newPassword} onChange={(e) => set("newPassword")(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Field id="confirm-password" label={t("learner.account.confirmPassword")}>
                <PasswordInput placeholder={t("learner.account.confirmPasswordPh")} value={form.confirmPassword} onChange={(e) => set("confirmPassword")(e.target.value)} required autoComplete="new-password" />
            </Field>
            <button
                type="submit"
                disabled={saving}
                className="w-full h-10 rounded-xl text-small font-bold text-white transition-opacity disabled:opacity-50 mt-1"
                style={{ backgroundColor: accent }}
            >
                {saving ? t("learner.account.updating") : t("learner.account.changePassword")}
            </button>
        </form>
    );
}
