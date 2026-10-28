"use client";

// Setting up a new box (it has no admin yet), or recovering admin access, with the one-time
// code the box prints in its console (or `pnpm setup:code`, run on the box).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { AuthError, AuthField, AuthFormHeader, AuthLayout, AuthPasswordField, AuthSubmit } from "@/components/auth/AuthPage";
import Loader from "@/components/ui/Loader";
import { renewMediaSession, setSessionToken } from "@/lib/session";
import { startRouteLoading } from "@/components/global/RouteLoader";
import { apiFetch, getErrorMessage } from "@/lib/api";

const MIN_PASSWORD = 8;

export default function SetupPage() {
    const { t } = useLanguage();
    const s = (key) => t(`shell.setup.${key}`);
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
    // "setup" (no admin yet), "recover" (a recovery code was issued), "done" (nothing to do).
    const [mode, setMode] = useState(null);
    const [form, setForm] = useState({ code: "", schoolName: "", fullName: "", email: "", password: "", confirm: "" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    useEffect(() => {
        apiFetch("/setup/status", { allowUnauthenticated: true })
            .then((status) => setMode(status.needsSetup ? "setup" : status.recovering ? "recover" : "done"))
            .catch(() => setMode("done"));
    }, [SERVER_URL]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (form.password.length < MIN_PASSWORD) return setError(s("passwordTooShort"));
        if (form.password !== form.confirm) return setError(t("shell.signup.passwordsDontMatch"));
        setLoading(true);
        try {
            let data;
            try {
                data = await apiFetch("/setup", {
                    method: "POST",
                    json: {
                        code: form.code,
                        schoolName: mode === "setup" ? form.schoolName.trim() : undefined,
                        fullName: form.fullName.trim(),
                        email: form.email.trim().toLowerCase(),
                        password: form.password,
                    },
                    allowUnauthenticated: true,
                });
            } catch (err) {
                if (err?.status === 429) setError(t("shell.login.tooManyAttempts"));
                else if (err?.code === "BAD_SETUP_CODE") setError(s("badCode"));
                else if (err?.code === "ALREADY_SET_UP") setMode("done");
                else setError(getErrorMessage(err, t));
                return;
            }
            setSessionToken(data.token);
            await renewMediaSession();
            startRouteLoading();
            window.location.href = "/manage/admin";
        } catch {
            setError(t("shell.common.somethingWrong"));
        } finally {
            setLoading(false);
        }
    };

    if (!mode) return <Loader />;

    return (
        <AuthLayout title={s("title")} subtitle={s("subtitle")}>
            {mode === "done" ? (
                <div className="w-full max-w-[400px] space-y-4 text-center" role="status">
                    <AuthFormHeader title={s("doneTitle")} subtitle={s("doneText")} />
                    <Link href="/" className="text-brand-fg font-extrabold hover:underline underline-offset-2">
                        {t("shell.signup.signIn")}
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-4">
                    <AuthFormHeader
                        title={mode === "setup" ? s("formTitle") : s("recoverTitle")}
                        subtitle={mode === "setup" ? s("formSubtitle") : s("recoverSubtitle")}
                    />

                    <AuthField
                        id="setup-code"
                        label={s("code")}
                        hint={s("codeHint")}
                        type="text"
                        placeholder="ABCD-2345"
                        autoComplete="one-time-code"
                        autoCapitalize="characters"
                        spellCheck={false}
                        required
                        value={form.code}
                        onChange={set("code")}
                        variant="code"
                    />

                    {mode === "setup" && (
                        <AuthField id="setup-school" label={s("schoolName")} hint={s("schoolNameHint")} type="text" required value={form.schoolName} onChange={set("schoolName")} />
                    )}

                    <AuthField id="setup-name" label={s("adminName")} type="text" autoComplete="name" required value={form.fullName} onChange={set("fullName")} />
                    <AuthField id="setup-email" label={s("adminEmail")} hint={mode === "recover" ? s("recoverEmailHint") : undefined} type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
                    <AuthPasswordField id="setup-password" label={s("password")} toggleLabel={t("shell.login.togglePassword")} autoComplete="new-password" required value={form.password} onChange={set("password")} />
                    <AuthPasswordField id="setup-confirm" label={t("shell.signup.confirmPassword")} toggleLabel={t("shell.signup.toggleConfirm")} autoComplete="new-password" required value={form.confirm} onChange={set("confirm")} />

                    <AuthError>{error}</AuthError>

                    <AuthSubmit loading={loading}>
                        {mode === "setup" ? s("submit") : s("recoverSubmit")}
                    </AuthSubmit>
                </form>
            )}
        </AuthLayout>
    );
}
