"use client";

import { ChevronDown, Eye, EyeOff, Globe } from "lucide-react";
import { useLanguage } from '@/context/LanguageContext';
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useContext } from "react";
import Image from "next/image";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";

export default function SignupPage() {
  const { t, setLang, lang } = useLanguage();
  const { showToast } = useToast();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '', name: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const languages = ["en", "fr", "rw", "sw", "es"];
  const { shiftString } = useContext(DataContext);

  // Child-friendly password strength calculator
  const calculateStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: 'bg-slate-200' };
    if (pwd.length < 6) return { score: 1, label: 'Too short (6+ characters needed)', color: 'bg-rose-500', text: 'text-rose-500' };
    
    let points = 1;
    if (pwd.length >= 8) points++;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) points++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) points++;

    if (points <= 2) return { score: 2, label: 'Fair (Add numbers or symbols)', color: 'bg-amber-500', text: 'text-amber-600' };
    if (points === 3) return { score: 3, label: 'Good password!', color: 'bg-teal-500', text: 'text-teal-600' };
    return { score: 4, label: 'Awesome strong password!', color: 'bg-emerald-500', text: 'text-emerald-600' };
  };

  const strength = calculateStrength(formData.password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password.length < 6) {
      const msg = "Password must be at least 6 characters long";
      setError(msg);
      showToast(msg, "error");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      const msg = "Passwords don't match";
      setError(msg);
      showToast(msg, "error");
      return;
    }

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
    const normalizedEmail = formData.email.trim().toLowerCase();

    try {
      setLoading(true);
      const response = await fetch(`${SERVER_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, fullName: formData.name, password: formData.password, role: 'scholar' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const msg = errorData.message || 'Failed to create account';
        setError(msg);
        showToast(`Signup failed: ${msg}`, 'error');
        return;
      }

      localStorage.setItem('al', shiftString(normalizedEmail));
      localStorage.setItem('un', shiftString(formData.name));
      localStorage.setItem('gh', shiftString('scholar'));
      showToast('Account created successfully! Redirecting to your dashboard...', 'success');
      setTimeout(() => {
        window.location.href = '/manage/scholar-dashboard';
      }, 1000);
    } catch (err) {
      console.error('Signup error:', err);
      const msg = 'An error occurred during signup';
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
          <Image
            src="/schoolLogo/somabox.png"
            alt="SomaBox"
            width={160}
            height={55}
            className="w-auto h-14 md:h-20 object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
            priority
          />

          {/* Headline */}
          <div className="space-y-1.5 md:space-y-2">
            <h1 className="text-white font-bold text-xl md:text-3xl leading-tight tracking-tight whitespace-nowrap">
              Create Account
            </h1>
            <p className="text-white/70 text-sm md:text-base font-medium leading-relaxed max-w-xs mx-auto">
              Join the SomaBox learning community
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-8 md:py-14 relative">

        {/* Language selector */}
        <div className="absolute top-6 right-6 z-10">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors"
            >
              <Globe className="w-4 h-4" />
              {lang.toUpperCase()}
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>

            {showLangMenu && (
              <div className="absolute top-11 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden min-w-[100px]">
                {languages.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => { setLang(l); setShowLangMenu(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${lang === l ? 'bg-slate-100 text-accent-dark' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-4">

          {/* Form header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
              Get Started
            </h2>
            <p className="text-slate-600 text-[14px] font-medium mt-1">
              Create your account to begin learning
            </p>
          </div>

          {/* Full name */}
          <div className="space-y-1.5">
            <label htmlFor="signup-name" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              Full Name
            </label>
            <input
              type="text"
              id="signup-name"
              placeholder="Jane Doe"
              required
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="signup-email" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              id="signup-email"
              placeholder="you@example.com"
              required
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="signup-password" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              Password
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
                aria-label="Toggle password visibility"
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
                    Strength: {strength.label}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <label htmlFor="signup-confirm" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
              Confirm Password
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
                aria-label="Toggle confirm password visibility"
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
              {loading ? "Creating account…" : "Create Account"}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-slate-300" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-[12px] text-slate-600 font-bold uppercase tracking-wider">or</span>
            </div>
          </div>

          {/* Sign in */}
          <p className="text-center text-[14px] text-slate-700 font-medium">
            Already have an account?{' '}
            <Link href="/" className="text-accent-dark font-extrabold hover:underline underline-offset-2">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
