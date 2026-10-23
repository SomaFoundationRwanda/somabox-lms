"use client"
import { useEffect, useState } from "react";
import { useLanguage } from '@/context/LanguageContext';
import { Compass } from "lucide-react";
import { fill } from "@/lib/fill";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { AuthDivider, AuthError, AuthField, AuthFormHeader, AuthLayout, AuthPasswordField, AuthSubmit } from "@/components/auth/AuthPage";
import { useToast } from "@/context/ToastContext";
import { renewMediaSession, safeNext, setSessionToken, takeNext } from "@/lib/session";
import { startRouteLoading } from "@/components/global/RouteLoader";

const AuthComp = () => {
    const { t } = useLanguage();
    const { showToast } = useToast();
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [sharedDevice, setSharedDevice] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [loading, setLoading] = useState(false);
    // Where a guest was going when they were asked to sign in (?next=, or remembered).
    const [next, setNext] = useState("");
    // A new box has no admin yet: it's set up first, with the code shown on the box.
    useEffect(() => {
        fetch(`${SERVER_URL}/setup/status`)
            .then((res) => (res.ok ? res.json() : null))
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
            const response = await fetch(`${SERVER_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email.trim(), password: formData.password, sharedDevice }),
            });
            const data = await response.json();
            if (!response.ok) {
                const msg = response.status === 429
                    ? t('shell.login.tooManyAttempts')
                    : data.message || t('shell.login.invalidCredentials');
                throw new Error(msg);
            }

            const userRole = String(data.user?.role || 'scholar').toLowerCase();
            setSessionToken(data.token, { sharedDevice: data.sharedDevice === true });
            // The login response set the media cookie (this request used credentials:
            // "include"); renew it once more so videos and books work straight away.
            await renewMediaSession(SERVER_URL);

            // The backend blocks everything else until the password is changed.
            if (data.user?.must_change_password) {
                showToast(t('shell.login.mustChangePassword'), 'info');
                startRouteLoading();
                setTimeout(() => { window.location.href = '/account'; }, 600);
                return;
            }

            showToast(fill(t('shell.login.welcomeToast'), { name: data.user?.full_name || t('shell.login.userFallback') }), 'success');

            startRouteLoading();
            setTimeout(() => {
                if (safeNext(next)) window.location.href = safeNext(next);
                else if (userRole === 'teacher') window.location.href = '/manage/teacher';
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
                        <p className="text-accent-dark text-[13px] font-semibold mt-2">
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

                {/* Shared device: the sign-in ends when the browser closes */}
                <div className="flex items-start gap-2.5">
                    <Checkbox
                        id="auth-shared-device"
                        checked={sharedDevice}
                        onCheckedChange={(v) => setSharedDevice(v === true)}
                        className="mt-0.5"
                    />
                    <label htmlFor="auth-shared-device" className="text-[13px] text-slate-700 leading-snug cursor-pointer">
                        <span className="font-bold text-slate-800">{t("shell.login.sharedDevice")}</span>
                        <span className="block text-slate-600">{t("shell.login.sharedDeviceHelp")}</span>
                    </label>
                </div>

                <AuthError>{loginError}</AuthError>

                <AuthSubmit loading={loading}>
                    {loading ? t("shell.login.signingIn") : t("auth.authLogin") || "Login"}
                </AuthSubmit>

                <AuthDivider>{t("shell.login.or")}</AuthDivider>

                {/* Sign up */}
                <p className="text-center text-[14px] text-slate-700 font-medium">
                    {t("shell.login.noAccount")}{' '}
                    <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="text-accent-dark font-extrabold hover:underline underline-offset-2">
                        {t("shell.login.signUp")}
                    </Link>
                </p>

                {/* Explore as a guest */}
                <Link
                    href="/home"
                    className="w-full h-11 rounded-lg border-2 border-slate-300 hover:border-slate-400 text-[14px] font-bold text-slate-800 flex items-center justify-center gap-2 transition-colors"
                >
                    <Compass className="w-4 h-4" aria-hidden="true" />
                    {t("guest.exploreWithoutAccount")}
                </Link>
            </form>
        </AuthLayout>
    );
};

export default AuthComp;
