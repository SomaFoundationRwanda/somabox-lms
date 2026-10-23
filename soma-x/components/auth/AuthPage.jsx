"use client";

// The sign-in, sign-up and box setup pages: the school's branding panel, the form panel, and
// the fields they share.
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import LanguageSwitcher from "@/components/global/LanguageSwitcher";
import { AuthPanelLogo } from "@/components/global/SchoolLogo";
import { Button } from "@/components/ui/button";

const INPUT = "w-full h-11 rounded-lg bg-white border-2 border-slate-300 hover:border-slate-400 focus:border-accent-dark px-3.5 text-[14px] text-slate-900 font-semibold placeholder:text-slate-500 shadow-sm outline-none transition-colors";
const LABEL = "block text-[12px] font-bold text-slate-800 uppercase tracking-wider";

export function AuthLayout({ title, subtitle, children }) {
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
                    <AuthPanelLogo />
                    <div className="space-y-1.5 md:space-y-2">
                        <h1 className="text-white font-bold text-xl md:text-3xl leading-tight tracking-tight whitespace-nowrap">
                            {title}
                        </h1>
                        <p className="text-white/70 text-sm md:text-base font-medium leading-relaxed max-w-xs mx-auto">
                            {subtitle}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Right form panel ── */}
            <div className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-8 md:py-14 relative">
                <div className="absolute top-6 right-6 z-10">
                    <LanguageSwitcher compact />
                </div>
                {children}
            </div>
        </div>
    );
}

export function AuthFormHeader({ title, subtitle, children }) {
    return (
        <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">{title}</h2>
            <p className="text-slate-600 text-[14px] font-medium mt-1">{subtitle}</p>
            {children}
        </div>
    );
}

export function AuthField({ id, label, hint, className = "", ...input }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className={LABEL}>{label}</label>
            <input id={id} className={`${INPUT} ${className}`} {...input} />
            {hint && <p className="text-[12px] text-slate-600 font-medium">{hint}</p>}
        </div>
    );
}

export function AuthPasswordField({ id, label, toggleLabel, children, ...input }) {
    const [shown, setShown] = useState(false);
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className={LABEL}>{label}</label>
            <div className="relative">
                <input id={id} type={shown ? "text" : "password"} placeholder="••••••••" className={`${INPUT} pr-11`} {...input} />
                <button
                    type="button"
                    onClick={() => setShown(!shown)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    aria-label={toggleLabel}
                >
                    {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
            {children}
        </div>
    );
}

export function AuthError({ children }) {
    if (!children) return null;
    return (
        <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
            <div className="w-2 h-2 mt-1.5 rounded-full bg-rose-600 shrink-0" />
            <p className="text-rose-700 text-[13px] font-bold leading-snug">{children}</p>
        </div>
    );
}

export function AuthSubmit({ loading, children, ...props }) {
    return (
        <div className="pt-1">
            <Button
                type="submit"
                width="full"
                disabled={loading}
                aria-busy={loading}
                className="w-full h-11 text-[15px] font-bold rounded-lg bg-accent-dark hover:bg-black text-white shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                {...props}
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {children}
            </Button>
        </div>
    );
}

export function AuthDivider({ children }) {
    return (
        <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-slate-300" />
            </div>
            <div className="relative flex justify-center">
                <span className="bg-white px-3 text-[12px] text-slate-600 font-bold uppercase tracking-wider">{children}</span>
            </div>
        </div>
    );
}
