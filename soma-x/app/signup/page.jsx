"use client";

import { BadgeCheck } from "lucide-react";
import { useLanguage } from '@/context/LanguageContext';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthDivider, AuthError, AuthField, AuthFormHeader, AuthLayout, AuthPasswordField, AuthSubmit } from "@/components/auth/AuthPage";
import { useToast } from "@/context/ToastContext";
import { renewMediaSession, safeNext, setSessionToken, takeNext } from "@/lib/session";
import { fill } from "@/lib/fill";
import { startRouteLoading } from "@/components/global/RouteLoader";
import { apiFetch } from "@/lib/api";

export default function SignupPage() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '', name: '' });
  const [error, setError] = useState('');
  // The learner code the server gave the new account (e.g. GSK-0012), shown before moving on.
  const [learnerCode, setLearnerCode] = useState('');
  // Where a guest was going when they were asked to sign up (?next=, or remembered).
  const [next, setNext] = useState('');
  useEffect(() => {
    const target = takeNext();
    setNext(target);
    if (target) window.history.replaceState(null, '', `/signup?next=${encodeURIComponent(target)}`);
  }, []);

  // Child-friendly password strength calculator
  const calculateStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: 'bg-slate-200' };
    if (pwd.length < 6) return { score: 1, label: t('shell.signup.strengthShort'), color: 'bg-rose-500', text: 'text-rose-500' };
    
    let points = 1;
    if (pwd.length >= 8) points++;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) points++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) points++;

    if (points <= 2) return { score: 2, label: t('shell.signup.strengthFair'), color: 'bg-amber-500', text: 'text-amber-600' };
    if (points === 3) return { score: 3, label: t('shell.signup.strengthGood'), color: 'bg-teal-500', text: 'text-teal-600' };
    return { score: 4, label: t('shell.signup.strengthStrong'), color: 'bg-emerald-500', text: 'text-emerald-600' };
  };

  const strength = calculateStrength(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password.length < 6) {
      const msg = t("shell.signup.passwordTooShort");
      setError(msg);
      showToast(msg, "error");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      const msg = t("shell.signup.passwordsDontMatch");
      setError(msg);
      showToast(msg, "error");
      return;
    }

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
    const normalizedEmail = formData.email.trim().toLowerCase();

    try {
      setLoading(true);
      // Self-registration always creates a learner account and returns a session.
      let data;
      try {
        data = await apiFetch("/auth/register", {
          method: "POST",
          json: { email: normalizedEmail, fullName: formData.name, password: formData.password },
          allowUnauthenticated: true,
        });
      } catch (err) {
        if (err?.status === 0) throw err;
        const msg = err?.body?.message || t('shell.signup.createFailed');
        setError(msg);
        showToast(fill(t('shell.signup.failedToast'), { message: msg }), 'error');
        return;
      }

      setSessionToken(data.token);
      // Registration set the media cookie (credentials: "include"); renew it once more so
      // files open straight away.
      await renewMediaSession();
      // Learners get a code they can sign in with instead of their email: show it and let
      // them note it down before going on.
      if (data.user?.learner_code) {
        setLearnerCode(data.user.learner_code);
        return;
      }
      showToast(t('shell.signup.createdToast'), 'success');
      // New accounts always meet the mandatory profile step first: it opens on every
      // signed-in page (and on /frame) until gender, location and grade are filled in, and
      // then they're where they wanted to be.
      startRouteLoading();
      setTimeout(() => {
        window.location.href = safeNext(next) || '/manage/scholar-dashboard';
      }, 1000);
    } catch (err) {
      console.error('Signup error:', err);
      const msg = t('shell.signup.errorDuringSignup');
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("shell.signup.title")} subtitle={t("shell.signup.subtitle")}>
        {learnerCode ? (
          <div className="w-full max-w-[400px] space-y-5 text-center" role="status" aria-live="polite">
            <BadgeCheck className="w-12 h-12 mx-auto text-emerald-600" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t("school.signup.createdTitle")}</h2>
            <div className="rounded-2xl border-2 border-teal-600 bg-teal-50 px-4 py-5">
              <p className="text-[12px] font-bold uppercase tracking-wider text-teal-800">{t("school.learnerCode")}</p>
              <p className="mt-1 text-3xl font-black tracking-wider text-slate-900 font-mono break-all">{learnerCode}</p>
            </div>
            <p className="text-[15px] font-medium text-slate-700">{fill(t("school.signup.codeMessage"), { code: learnerCode })}</p>
            <p className="text-[13px] text-slate-600">{t("school.signup.writeItDown")}</p>
            <Button
              type="button"
              autoFocus
              onClick={() => { window.location.href = safeNext(next) || '/manage/scholar-dashboard'; }}
              className="w-full h-11 text-[15px] font-bold rounded-lg bg-accent-dark hover:bg-black text-white shadow-md"
            >
              {t("school.signup.continue")}
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-4">
          <AuthFormHeader title={t("shell.signup.formTitle")} subtitle={t("shell.signup.formSubtitle")} />

          <AuthField
            id="signup-name"
            label={t("shell.signup.fullName")}
            type="text"
            placeholder={t("shell.signup.namePlaceholder")}
            autoComplete="name"
            required
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <AuthField
            id="signup-email"
            label={t("shell.signup.email")}
            type="email"
            placeholder={t("shell.signup.emailPlaceholder")}
            autoComplete="email"
            required
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <AuthPasswordField
            id="signup-password"
            label={t("shell.login.password")}
            toggleLabel={t("shell.login.togglePassword")}
            autoComplete="new-password"
            required
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          >
            {/* Child-friendly Password Strength Meter */}
            {formData.password && (
              <div className="pt-1.5 space-y-1">
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                        step <= strength.score ? strength.color : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                {strength.label && (
                  <p className={`text-[12px] font-extrabold ${strength.text}`}>
                    {t("shell.signup.strength")} {strength.label}
                  </p>
                )}
              </div>
            )}
          </AuthPasswordField>

          <AuthPasswordField
            id="signup-confirm"
            label={t("shell.signup.confirmPassword")}
            toggleLabel={t("shell.signup.toggleConfirm")}
            autoComplete="new-password"
            required
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          />

          <AuthError>{error}</AuthError>

          <AuthSubmit loading={loading}>
            {loading ? t("shell.signup.creating") : t("shell.signup.create")}
          </AuthSubmit>

          <AuthDivider>{t("shell.login.or")}</AuthDivider>

          {/* Sign in */}
          <p className="text-center text-[14px] text-slate-700 font-medium">
            {t("shell.signup.haveAccount")}{' '}
            <Link href={next ? `/?next=${encodeURIComponent(next)}` : "/"} className="text-accent-dark font-extrabold hover:underline underline-offset-2">
              {t("shell.signup.signIn")}
            </Link>
          </p>
          {next ? (
            <p className="text-center text-[13px] text-slate-600 font-medium">{t("guest.gateWhy")}</p>
          ) : (
            <Link href="/home" className="block text-center text-[13px] text-slate-600 font-semibold hover:underline underline-offset-2">
              {t("guest.exploreWithoutAccount")}
            </Link>
          )}
        </form>
        )}
    </AuthLayout>
  );
}
