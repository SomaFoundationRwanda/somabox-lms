"use client";

// The light app shell for guests on the explore pages: brand, Explore links and Sign up /
// Log in. Nothing here calls a signed-in API (no notifications, profile, AI or assignments).
import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BookMarked, Compass, Globe, Info, LogIn, UserPlus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { authLinks } from "@/components/guest/GuestGate";
import LanguageSwitcher from "@/components/global/LanguageSwitcher";
import { rememberNext } from "@/lib/session";

const EXPLORE_LINKS = [
    { to: "/home", key: "guest.navExplore", Icon: Compass },
    { to: "/library", key: "guest.navLibrary", Icon: BookMarked },
    { to: "/discover-courses", key: "guest.navCourses", Icon: Globe },
];

function useAuthLinks() {
    const pathname = usePathname();
    // Back to the page they're on after signing in (the browse page itself is fine).
    return authLinks(pathname);
}

const isActive = (pathname, to) =>
    to === "/home"
        ? pathname === "/home" || !["/library", "/discover-courses"].some((p) => pathname.startsWith(p))
        : pathname === to || pathname.startsWith(`${to}/`);

export function GuestNav() {
    const { t } = useLanguage();
    const pathname = usePathname();
    const links = useAuthLinks();

    // The content column's left margin follows the sidebar width (see (app)/layout.jsx).
    useEffect(() => {
        document.documentElement.style.setProperty("--sidebar-width", "180px");
    }, []);

    return (
        <>
            <nav aria-label={t("guest.navLabel")} className="fixed hidden md:flex flex-col h-screen w-[180px] z-50 bg-white dark:bg-[#080B0F]">
                <div className="flex justify-center px-4 py-5">
                    <Link href="/home" aria-label="SomaBox">
                        <Image src="/schoolLogo/somabox.png" alt="SomaBox" width={160} height={55} className="w-auto h-12 object-contain" priority />
                    </Link>
                </div>
                <div className="flex-1 px-3 py-5 space-y-1">
                    {EXPLORE_LINKS.map(({ to, key, Icon }) => {
                        const on = isActive(pathname, to);
                        return (
                            <Link
                                key={to}
                                href={to}
                                aria-current={on ? "page" : undefined}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-full text-[13px] font-semibold transition-colors ${on ? "bg-[#203A3A] text-white" : "text-[#393F30] dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"}`}
                            >
                                <Icon size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                                <span className="truncate">{t(key)}</span>
                            </Link>
                        );
                    })}
                </div>
                <div className="px-4 pt-5 pb-6 space-y-2 border-t border-slate-100 dark:border-white/10">
                    <a href={links.signup} onClick={() => rememberNext(pathname)} className="flex items-center justify-center gap-2 h-10 rounded-full bg-[#203A3A] hover:bg-black text-white text-[13px] font-bold transition-colors">
                        <UserPlus size={15} aria-hidden="true" /> {t("guest.signUp")}
                    </a>
                    <a href={links.login} onClick={() => rememberNext(pathname)} className="flex items-center justify-center gap-2 h-10 rounded-full border border-slate-300 dark:border-white/20 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 text-[13px] font-bold transition-colors">
                        <LogIn size={15} aria-hidden="true" /> {t("guest.logIn")}
                    </a>
                </div>
            </nav>

            {/* Mobile bottom bar */}
            <nav aria-label={t("guest.navLabel")} className="fixed md:hidden z-[998] bottom-0 w-full rounded-t-[8px] bg-white dark:bg-[#080B0F] border-t border-slate-100 dark:border-white/10">
                <div className="flex items-center justify-around px-2 h-[4.2rem] pb-[env(safe-area-inset-bottom)]">
                    {EXPLORE_LINKS.map(({ to, key, Icon }) => {
                        const on = isActive(pathname, to);
                        return (
                            <Link key={to} href={to} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-1 px-2 ${on ? "text-[#203A3A] dark:text-teal-400" : "text-slate-600 dark:text-slate-400"}`}>
                                <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
                                <span className="text-[11px] font-semibold truncate max-w-[72px] text-center leading-tight">{t(key)}</span>
                            </Link>
                        );
                    })}
                    <a href={links.signup} onClick={() => rememberNext(pathname)} className="flex flex-col items-center gap-1 px-2 text-[#203A3A] dark:text-teal-400">
                        <UserPlus size={19} strokeWidth={1.75} aria-hidden="true" />
                        <span className="text-[11px] font-bold leading-tight">{t("guest.signUp")}</span>
                    </a>
                </div>
            </nav>
        </>
    );
}

export function GuestHeader() {
    const { t } = useLanguage();
    const pathname = usePathname();
    const links = useAuthLinks();

    return (
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-[#080B0F]">
            <div className="min-w-0 flex items-center gap-3">
                <Image src="/schoolLogo/somabox-logo-dark.webp" alt="" width={32} height={32} className="w-8 h-8 object-contain md:hidden" />
                <div className="min-w-0">
                    <h1 className="text-[16px] sm:text-[18px] md:text-[20px] font-black leading-tight tracking-tight truncate text-slate-900 dark:text-slate-100">
                        {t("guest.headerTitle")}
                    </h1>
                    <p className="text-[11px] mt-0.5 hidden sm:block text-slate-500 dark:text-slate-400">{t("guest.headerSubtitle")}</p>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <LanguageSwitcher compact />
                <a href={links.login} onClick={() => rememberNext(pathname)} className="hidden sm:flex items-center h-9 px-4 rounded-full border border-slate-300 dark:border-white/20 text-[13px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    {t("guest.logIn")}
                </a>
                <a href={links.signup} onClick={() => rememberNext(pathname)} className="flex items-center h-9 px-4 rounded-full bg-[#203A3A] hover:bg-black text-white text-[13px] font-bold transition-colors">
                    {t("guest.signUp")}
                </a>
            </div>
        </header>
    );
}

export function GuestBanner() {
    const { t } = useLanguage();
    const pathname = usePathname();
    const links = useAuthLinks();
    return (
        <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border-y border-amber-200 dark:border-amber-500/20 text-[13px] text-amber-900 dark:text-amber-200">
            <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">{t("guest.banner")}</span>
            <a href={links.signup} onClick={() => rememberNext(pathname)} className="font-bold underline underline-offset-2 hover:no-underline">
                {t("guest.signUp")}
            </a>
        </div>
    );
}
