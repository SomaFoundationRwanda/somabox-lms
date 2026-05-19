"use client"
import DataContext from "@/context/DataContext";
import { useContext, useState } from "react";
import { useLanguage } from '@/context/LanguageContext';
import { BookOpen, ChevronDown, Globe, GraduationCap, ShieldCheck, Users, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";

const AuthComp = () => {
    const { t, setLang, lang } = useLanguage();
    const [showLangMenu, setShowLangMenu] = useState(false);
    const languages = ["en", "fr", "rw", "sw", "es"];

    const { shiftString } = useContext(DataContext);
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    const [formData, setFormData] = useState({ username: '', password: '', role: 'scholar' });
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
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            if (!response.ok) {
                const msg = data.message || 'Invalid credentials. Please try again.';
                const friendly = msg === 'Invalid role'
                    ? `Wrong role selected. Make sure you pick "${formData.role.charAt(0).toUpperCase() + formData.role.slice(1)}" — your account's actual role may differ.`
                    : msg;
                throw new Error(friendly);
            }

            localStorage.setItem('al', shiftString(formData.username));
            localStorage.setItem('un', shiftString(data.user.full_name || ''));
            localStorage.setItem('gh', shiftString(formData.role));

            if (formData.role === 'teacher') window.location.href = '/manage/teacher';
            else if (formData.role === 'admin') window.location.href = '/manage/admin';
            else window.location.href = '/manage/scholar-dashboard';
        } catch (err) {
            setLoginError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const roles = [
        { value: 'scholar', label: t("auth.authScholar") || 'Scholar', Icon: GraduationCap },
        { value: 'teacher', label: t("auth.authTeacher") || 'Teacher', Icon: BookOpen      },
        { value: 'admin',   label: t("auth.authAdmin")   || 'Admin',   Icon: ShieldCheck   },
    ];

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

                <div className="relative z-10 flex flex-col items-center text-center gap-4 md:gap-8 max-w-sm w-full">

                    {/* Floating logo card */}
                    <div className="bg-white rounded-2xl md:rounded-3xl p-3 md:p-5 shadow-2xl shadow-black/40 ring-1 ring-white/20">
                        <Image
                            src="/schoolLogo/somabox-logo-dark.webp"
                            alt="SFR Logo"
                            width={96}
                            height={96}
                            className="w-12 h-12 md:w-20 md:h-20 object-contain"
                            priority
                        />
                    </div>

                    {/* Headline */}
                    <div className="space-y-2 md:space-y-3">
                        <h1 className="text-white font-black text-2xl md:text-[3.25rem] leading-tight tracking-tight">
                            {t("auth.authTitle")}
                        </h1>
                        <p className="text-white/65 text-sm md:text-lg font-medium leading-relaxed max-w-xs mx-auto">
                            {t("auth.authSubtitle")}
                        </p>
                    </div>

                    {/* Feature pills — hidden on mobile to save space */}
                    <div className="hidden md:flex flex-wrap justify-center gap-2">
                        {[
                            { icon: Users,    label: "12,450+ Scholars" },
                            { icon: Wifi,     label: "Offline Ready"    },
                            { icon: BookOpen, label: "5 Languages"      },
                        ].map(({ icon: Icon, label }) => (
                            <div
                                key={label}
                                className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 backdrop-blur-sm"
                            >
                                <Icon className="w-3.5 h-3.5 text-white/80 shrink-0" />
                                <span className="text-white/90 text-xs font-semibold">{label}</span>
                            </div>
                        ))}
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
                    <div className="mb-7">
                        <h2 className="text-[26px] font-black text-slate-900 tracking-tight leading-tight">
                            Welcome Back!
                        </h2>
                        <p className="text-slate-400 text-[13px] mt-1">
                            Please enter your credentials to continue
                        </p>
                    </div>

                    {/* Email */}
                    <div className="space-y-1.5">
                        <label htmlFor="auth-email" className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
                            Email
                        </label>
                        <input
                            type="email"
                            id="auth-email"
                            placeholder="you@example.com"
                            required
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            className="w-full h-11 rounded-lg bg-slate-50 border border-slate-200 px-3.5 text-[14px] text-slate-900 font-medium placeholder:text-slate-300 outline-none focus:border-slate-400 focus:bg-white transition-colors"
                        />
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <label htmlFor="auth-password" className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
                            Password
                        </label>
                        <input
                            type="password"
                            id="auth-password"
                            placeholder="••••••••"
                            required
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="w-full h-11 rounded-lg bg-slate-50 border border-slate-200 px-3.5 text-[14px] text-slate-900 font-medium placeholder:text-slate-300 outline-none focus:border-slate-400 focus:bg-white transition-colors"
                        />
                    </div>

                    {/* Role segmented control */}
                    <div className="space-y-1.5 pt-1">
                        <label className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
                            Sign in as
                        </label>
                        <div className="flex gap-2">
                            {roles.map(({ value, label, Icon }) => {
                                const active = formData.role === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: value })}
                                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border text-[11px] font-bold transition-colors duration-150 cursor-pointer ${
                                            active
                                                ? 'bg-accent-dark text-white border-accent-dark'
                                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                                        }`}
                                    >
                                        <Icon size={15} strokeWidth={2} />
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Inline error */}
                    {loginError && (
                        <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
                            <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-red-400 shrink-0" />
                            <p className="text-red-600 text-[12px] font-medium leading-snug">{loginError}</p>
                        </div>
                    )}

                    {/* Submit */}
                    <div className="pt-1">
                        <Button
                            type="submit"
                            width="full"
                            disabled={loading}
                            className="w-full h-11 text-[14px] font-bold rounded-lg bg-accent-dark hover:bg-black text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Signing in…" : t("auth.authLogin") || "Login"}
                        </Button>
                    </div>

                    {/* Divider */}
                    <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-200" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-white px-3 text-[11px] text-slate-300 font-medium">or</span>
                        </div>
                    </div>

                    {/* Sign up */}
                    <p className="text-center text-[13px] text-slate-400">
                        Don&apos;t have an account?{' '}
                        <Link href="/signup" className="text-accent-dark font-bold hover:underline underline-offset-2">
                            Sign Up
                        </Link>
                    </p>
                </form>
            </div>
        </div>
    );
};

export default AuthComp;
