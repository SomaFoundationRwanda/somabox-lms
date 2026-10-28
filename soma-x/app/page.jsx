"use client"
import { useEffect, useState } from "react";
import { useLanguage } from '@/context/LanguageContext';
import { Compass } from "lucide-react";
import { fill } from "@/lib/fill";
import Link from "next/link";
import { AuthDivider, AuthError, AuthField, AuthFormHeader, AuthLayout, AuthPasswordField, AuthSubmit } from "@/components/auth/AuthPage";
import { useToast } from "@/context/ToastContext";
import { accountPage, renewMediaSession, safeNext, setSessionToken, takeNext } from "@/lib/session";
import { startRouteLoading } from "@/components/global/RouteLoader";
import { apiFetch, getErrorMessage } from "@/lib/api";

const AuthComp = () => {
    const { t } = useLanguage();
    const { showToast } = useToast();
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loginError, setLoginError] = useState('');
    const [loading, setLoading] = useState(false);
    // Where a guest was going when they were asked to sign in (?next=, or remembered).
    const [next, setNext] = useState("");
    // A new box has no admin yet: it's set up first, with the code shown on the box.
    useEffect(() => {
        apiFetch("/setup/status", { allowUnauthenticated: true })
            .then((status) => { if (status?.needsSetup) window.location.replace("/setup"); })
            .catch(() => {});
    }, [SERVER_URL]);

    useEffect(() => {
        const target = takeNext();
        setNext(target);
        if (target) {
            // Keep it in the address bar so a reload, or the sign-up link, still knows it.
            window.history.replaceState(null, "", `/?next=${encodeURIComponent(target)}`);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoading(true);
        try {
            const data = await apiFetch("/auth/login", {
                method: "POST",
                json: { email: formData.email.trim(), password: formData.password },
                allowUnauthenticated: true,
            }).catch((err) => {
                const msg = err?.status === 429
                    ? t('shell.login.tooManyAttempts')
                    : err?.status === 0 ? getErrorMessage(err, t) : err?.body?.message || t('shell.login.invalidCredentials');
                throw new Error(msg);
            });

            const userRole = String(data.user?.role || 'scholar').toLowerCase();
            setSessionToken(data.token);
            // The login response set the media cookie (this request used credentials:
            // "include"); renew it once more so videos and books work straight away.
            await renewMediaSession();

            // The backend blocks everything else until the password is changed.
            if (data.user?.must_change_password) {
                showToast(t('shell.login.mustChangePassword'), 'info');
                startRouteLoading();
                setTimeout(() => { window.location.href = accountPage(userRole); }, 600);
                return;
            }

            showToast(fill(t('shell.login.welcomeToast'), { name: data.user?.full_name || t('shell.login.userFallback') }), 'success');

            startRouteLoading();
            setTimeout(() => {
                if (safeNext(next)) window.location.href = safeNext(next);
                else if (userRole === 'teacher') window.location.href = '/teacher/dashboard';
                else if (userRole === 'admin') window.location.href = '/manage/admin';
                else window.location.href = '/manage/scholar-dashboard';
            }, 600);
        } catch (err) {
            const errMsg = err.message || t('shell.common.somethingWrong');
            setLoginError(errMsg);
            showToast(fill(t('shell.login.failedToast'), { message: errMsg }), 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout title={t("auth.authTitle") || "Welcome Back"} subtitle={t("auth.authSubtitle") || "Login to manage your account"}>
            <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-4">
                <AuthFormHeader title={t("shell.login.formTitle")} subtitle={t("shell.login.formSubtitle")}>
                    {next ? (
                        <p className="text-brand-fg text-small font-semibold mt-2">
                            {t("guest.continueHint")}
                        </p>
                    ) : null}
                </AuthFormHeader>

                {/* Email or learner code (learners can sign in with GSK-0012 instead of an email) */}
                <AuthField
                    id="auth-email"
                    label={t("school.login.label")}
                    type="text"
                    placeholder={t("school.login.placeholder")}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />

                <AuthPasswordField
                    id="auth-password"
                    label={t("shell.login.password")}
                    toggleLabel={t("shell.login.togglePassword")}
                    autoComplete="current-password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />

                {/* Every device may be shared: the sign-in always ends on its own. */}
                <p className="text-caption text-fg-subtle">{t("shell.login.autoSignOut")}</p>

                <AuthError>{loginError}</AuthError>

                <AuthSubmit loading={loading}>
                    {loading ? t("shell.login.signingIn") : t("auth.authLogin") || "Login"}
                </AuthSubmit>

                <AuthDivider>{t("shell.login.or")}</AuthDivider>

                {/* Sign up */}
                <p className="text-center text-ui text-fg-muted font-medium">
                    {t("shell.login.noAccount")}{' '}
                    <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="text-brand-fg font-extrabold hover:underline underline-offset-2">
                        {t("shell.login.signUp")}
                    </Link>
                </p>

                {/* Explore as a guest */}
                <Link
                    href="/home"
                    className="w-full h-11 rounded-lg border-2 border-line-strong hover:border-line-strong text-ui font-bold text-fg flex items-center justify-center gap-2 transition-colors"
                >
                    <Compass className="w-4 h-4" aria-hidden="true" />
                    {t("guest.exploreWithoutAccount")}
                </Link>
            </form>
        </AuthLayout>
    );
};

export default AuthComp;
