"use client"
import { useState } from "react";
import { useLanguage } from '@/context/LanguageContext';
import { ChevronDown, Eye, EyeOff, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/context/ToastContext";
import { setSessionToken } from "@/lib/session";

const AuthComp = () => {
    const { t, setLang, lang } = useLanguage();
    const { showToast } = useToast();
    const [showLangMenu, setShowLangMenu] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const languages = ["en", "fr", "rw", "sw", "es"];
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [loginError, setLoginError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoading(true);
        try {
            const response = await fetch(`${SERVER_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email, password: formData.password }),
            });
            const data = await response.json();
            if (!response.ok) {
                const msg = data.message || 'Invalid credentials. Please try again.';
                throw new Error(msg);
            }

            const userRole = String(data.user?.role || 'scholar').toLowerCase();
            setSessionToken(data.token);

            // The backend blocks everything else until the password is changed.
            if (data.user?.must_change_password) {
                showToast('Please set a new password before continuing.', 'info');
                setTimeout(() => { window.location.href = '/account'; }, 600);
                return;
            }

            showToast(`Welcome back, ${data.user?.full_name || 'User'}! Login successful.`, 'success');

            setTimeout(() => {
                if (userRole === 'teacher') window.location.href = '/manage/teacher';
                else if (userRole === 'admin') window.location.href = '/manage/admin';
                else window.location.href = '/manage/scholar-dashboard';
            }, 600);
        } catch (err) {
            const errMsg = err.message || 'Something went wrong. Please try again.';
            setLoginError(errMsg);
            showToast(`Login failed: ${errMsg}`, 'error');
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
                            {t("auth.authTitle") || "Welcome Back"}
                        </h1>
                        <p className="text-white/70 text-sm md:text-base font-medium leading-relaxed max-w-xs mx-auto">
                            {t("auth.authSubtitle") || "Login to manage your account"}
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
                                        className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${
                                            lang === l
                                                ? 'bg-slate-100 text-accent-dark'
                                                : 'text-slate-700 hover:bg-slate-50'
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
                            Welcome Back!
                        </h2>
                        <p className="text-slate-600 text-[14px] font-medium mt-1">
                            Login to manage your account
                        </p>
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                        <label htmlFor="auth-email" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
                            Email
                        </label>
                        <input
                            type="email"
                            id="auth-email"
                            placeholder="you@example.com"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors"
                        />
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <label htmlFor="auth-password" className="block text-[12px] font-bold text-slate-800 uppercase tracking-wider">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                id="auth-password"
                                placeholder="••••••••"
                                required
                                value={formData.password}
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
                    </div>

                    {/* Inline error */}
                    {loginError && (
                        <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
                            <div className="w-2 h-2 mt-1.5 rounded-full bg-rose-600 shrink-0" />
                            <p className="text-rose-700 text-[13px] font-bold leading-snug">{loginError}</p>
                        </div>
                    )}

                    {/* Submit */}
                    <div className="pt-1">
                        <Button
                            type="submit"
                            width="full"
                            disabled={loading}
                            aria-busy={loading}
                            className="w-full h-11 text-[15px] font-bold rounded-lg bg-accent-dark hover:bg-black text-white shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {loading ? "Signing in…" : t("auth.authLogin") || "Login"}
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

                    {/* Sign up */}
                    <p className="text-center text-[14px] text-slate-700 font-medium">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="text-accent-dark font-extrabold hover:underline underline-offset-2">
                            Sign Up
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
};

export default AuthComp;
