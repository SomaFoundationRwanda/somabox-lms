"use client";

import { BadgeCheck, Eye, EyeOff } from "lucide-react";
import LanguageSwitcher from "@/components/global/LanguageSwitcher";
import { useLanguage } from '@/context/LanguageContext';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthPanelLogo } from "@/components/global/SchoolLogo";
import { useToast } from "@/context/ToastContext";
import { renewMediaSession, safeNext, setSessionToken, takeNext } from "@/lib/session";
import { fill } from "@/lib/fill";
import { startRouteLoading } from "@/components/global/RouteLoader";

export default function SignupPage() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '', name: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      const response = await fetch(`${SERVER_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, fullName: formData.name, password: formData.password }),
      });

      const data = await response.json();
      if (!response.ok) {
        const msg = data.message || t('shell.signup.createFailed');
        setError(msg);
        showToast(fill(t('shell.signup.failedToast'), { message: msg }), 'error');
        return;
      }

      setSessionToken(data.token);
      // Registration set the media cookie (credentials: "include"); renew it once more so
      // files open straight away.
      await renewMediaSession(SERVER_URL);
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
    <div className="min-h-screen w-full flex flex-col md:flex-row">

      {/* ── Left branding panel ── */}
      <div className="relative md:w-[45%] bg-accent-dark flex flex-col items-center justify-center py-8 md:py-0 px-8 md:px-10 overflow-hidden">

        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />

        {/* Decorative blobs */}
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-0 w-48 h-48 bg-white/[0.04] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center gap-4 md:gap-6 max-w-sm w-full">

          {/* Logo */}
          <AuthPanelLogo />

          {/* Headline */}
          <div className="space-y-1.5 md:space-y-2">
            <h1 className="text-white font-bold text-xl md:text-3xl leading-tight tracking-tight whitespace-nowrap">
              {t("shell.signup.title")}
            </h1>
            <p className="text-white/70 text-sm md:text-base font-medium leading-relaxed max-w-xs mx-auto">
              {t("shell.signup.subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-8 md:py-14 relative">

        {/* Language selector */}
        <div className="absolute top-6 right-6 z-10">
          <LanguageSwitcher compact />
        </div>

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
        /* Form */
        <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-4">

          {/* Form header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              {t("shell.signup.formTitle")}
            </h2>
            <p className="text-slate-600 text-[14px] font-medium mt-1">
              {t("shell.signup.formSubtitle")}
            </p>
          </div>

          {/* Full name */}
          <div className="space-y-1.5">
            <label htmlFor="signup-name" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              {t("shell.signup.fullName")}
            </label>
            <input
              type="text"
              id="signup-name"
              placeholder={t("shell.signup.namePlaceholder")}
              required
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="signup-email" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              {t("shell.signup.email")}
            </label>
            <input
              type="email"
              id="signup-email"
              placeholder={t("shell.signup.emailPlaceholder")}
              required
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="signup-password" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              {t("shell.login.password")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="signup-password"
                placeholder="••••••••"
                required
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 pr-11 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                aria-label={t("shell.login.togglePassword")}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

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
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label htmlFor="signup-confirm" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              {t("shell.signup.confirmPassword")}
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="signup-confirm"
                placeholder="••••••••"
                required
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 pr-11 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                aria-label={t("shell.signup.toggleConfirm")}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Inline error */}
          {error && (
            <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-rose-600 shrink-0" />
              <p className="text-rose-700 text-[13px] font-bold leading-snug">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="pt-1">
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-[15px] font-bold rounded-lg bg-accent-dark hover:bg-black text-white shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("shell.signup.creating") : t("shell.signup.create")}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-slate-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[12px] text-slate-600 font-bold uppercase tracking-wider">{t("shell.login.or")}</span>
            </div>
          </div>

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
      </div>
    </div>
  );
}
