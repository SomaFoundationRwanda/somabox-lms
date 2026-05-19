"use client"
import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BookOpen, CheckCircle2, GraduationCap, Layers, Search } from "lucide-react";
import DataContext from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import OnboardingTour, { TourLaunchButton } from "@/components/ui/OnboardingTour";
import { EmptyState } from "@/components/ui/empty-state";

const ScholarDashboard = () => {
    const { authenticated, role, unshiftString, SERVER_URL, isDark } = useContext(DataContext);
    const router = useRouter();
    const ACCENT = isDark ? "#0D9488" : "#203A3A";

    const currentRole = useMemo(() => (role ? unshiftString(role) : ""), [role, unshiftString]);

    const [displayName, setDisplayName] = useState("");
    const [scholarEmail, setScholarEmail] = useState("");

    useEffect(() => {
        setDisplayName(unshiftString(localStorage.getItem("un") || ""));
        const stored = localStorage.getItem("al");
        setScholarEmail(stored ? unshiftString(stored) : "");
    }, [unshiftString]);

    const [classes, setClasses] = useState([]);
    const [lessons, setLessons] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!authenticated || currentRole !== "scholar" || !SERVER_URL || !scholarEmail) return;
        const load = async () => {
            setLoading(true);
            try {
                const [cRes, lRes] = await Promise.all([
                    fetch(`${SERVER_URL}/classes/mine?scholarEmail=${encodeURIComponent(scholarEmail)}`),
                    fetch(`${SERVER_URL}/classes/lessons/mine?scholarEmail=${encodeURIComponent(scholarEmail)}`),
                ]);
                if (cRes.ok) setClasses(await cRes.json());
                if (lRes.ok) setLessons(await lRes.json());
            } catch { /* silent */ }
            finally { setLoading(false); }
        };
        load();
    }, [authenticated, currentRole, SERVER_URL, scholarEmail]);

    const inProgress = lessons.filter(l => l?.progress?.status === "in_progress").length;
    const completed  = lessons.filter(l => l?.progress?.status === "completed").length;
    const notStarted = lessons.length - inProgress - completed;
    const pct        = lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0;

    const firstName = displayName ? displayName.split(" ")[0] : "Scholar";
    const initials  = displayName
        ? displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
        : "S";

    useEffect(() => {
        if (authenticated && currentRole && currentRole !== "scholar") router.replace("/");
    }, [authenticated, currentRole, router]);

    if (!authenticated || currentRole !== "scholar") return null;

    return (
        <div className="min-h-screen pb-24 md:pb-8">

            {/* Onboarding tour — auto-shows on first visit */}
            <OnboardingTour />

            {/* ── Top bar ── */}
            <div className="flex items-center justify-between pl-12 pr-4 md:px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10 rounded-b-[5px]">
                <div className="min-w-0">
                    <h1 className="text-[16px] sm:text-[18px] md:text-[20px] font-black text-slate-900 leading-tight tracking-tight truncate">
                        Welcome On SOMABOX, {firstName} !
                    </h1>
                    <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">Let&apos;s learn something new today!</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <TourLaunchButton className="hidden sm:flex mr-1" />
                    <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
                        <Search className="w-[15px] h-[15px]" />
                    </button>
                    <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors">
                        <Bell className="w-[15px] h-[15px]" />
                    </button>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ml-0.5" style={{ backgroundColor: ACCENT }}>
                        <span className="text-[11px] font-black text-white tracking-wide">{initials}</span>
                    </div>
                </div>
            </div>

            {/* ── Dashboard grid ── */}
            <div className="pt-[10px] space-y-3">

                {/* ── Stat cards + promo ── */}
                <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_280px] gap-2 sm:gap-3">

                    {/* Classes card */}
                    <div className="bg-white rounded-[5px] p-3 sm:p-4 flex flex-col gap-3">
                        <div>
                            <p className="text-[13px] sm:text-[14px] font-bold text-slate-800">My Classes</p>
                            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                                {loading ? "Loading…" : `${classes.length} ${classes.length === 1 ? "class" : "classes"} enrolled`}
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500">
                                <span>Active</span>
                                <span className="font-semibold text-slate-700">{loading ? "–" : `${classes.length} joined`}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: classes.length > 0 ? "100%" : "0%", backgroundColor: ACCENT }}
                                />
                            </div>
                        </div>
                        <Link href="/manage/scholar-dashboard/classes" className="mt-auto">
                            <Button variant="outline" className="w-full h-8 sm:h-9 text-[11px] sm:text-[12px] font-semibold rounded-[5px] border-slate-200 text-slate-700 hover:bg-slate-50">
                                View classes
                            </Button>
                        </Link>
                    </div>

                    {/* Lessons card */}
                    <div className="bg-white rounded-[5px] p-3 sm:p-4 flex flex-col gap-2">
                        <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Lesson Progress</p>
                        <div className="flex-1 flex flex-col justify-center gap-2 py-1">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-[36px] sm:text-[44px] font-black leading-none" style={{ color: ACCENT }}>
                                    {loading ? "–" : inProgress}
                                </span>
                                <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium pb-1">in progress</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-[11px]">
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    <span className="text-slate-500"><span className="font-bold text-slate-700">{loading ? "–" : completed}</span> done</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                    <span className="text-slate-500"><span className="font-bold text-slate-700">{loading ? "–" : notStarted}</span> new</span>
                                </div>
                            </div>
                        </div>
                        <Link href="/manage/scholar-dashboard/lessons" className="mt-auto">
                            <Button variant="outline" className="w-full h-8 sm:h-9 text-[11px] sm:text-[12px] font-semibold rounded-[5px] border-slate-200 text-slate-700 hover:bg-slate-50">
                                View lessons
                            </Button>
                        </Link>
                    </div>

                    {/* Completion card — hidden on smallest mobile, shown from sm up */}
                    <div className="hidden sm:flex bg-white rounded-[5px] p-3 sm:p-4 flex-col gap-2">
                        <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Completion Rate</p>
                        <div className="flex-1 flex flex-col justify-center gap-2 py-1">
                            <div>
                                <span className={`text-[36px] sm:text-[44px] font-black leading-none ${
                                    pct >= 70 ? "text-green-500" : pct >= 30 ? "text-orange-500" : "text-slate-800"
                                }`}>
                                    {loading ? "–" : `${pct}%`}
                                </span>
                                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">
                                    {loading ? "Loading…" : `${completed} of ${lessons.length} done`}
                                </p>
                            </div>
                            {!loading && (
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-700 ${
                                            pct >= 70 ? "bg-green-500" : pct >= 30 ? "bg-orange-400" : "bg-slate-300"
                                        }`}
                                        style={{ width: `${Math.max(pct, 2)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                        <Link href="/library" className="mt-auto">
                            <Button variant="outline" className="w-full h-8 sm:h-9 text-[11px] sm:text-[12px] font-semibold rounded-[5px] border-slate-200 text-slate-700 hover:bg-slate-50">
                                Browse library
                            </Button>
                        </Link>
                    </div>

                    {/* Promo banner — full-width on mobile, normal on xl */}
                    <div
                        className="col-span-2 sm:col-span-2 xl:col-span-1 relative rounded-[5px] overflow-hidden flex flex-col justify-between p-4 sm:p-5 min-h-[160px] sm:min-h-[200px]"
                        style={{ backgroundColor: "#111827" }}
                    >
                        <div className="absolute inset-0 opacity-[0.04]"
                            style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }} />
                        <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full blur-3xl pointer-events-none"
                            style={{ backgroundColor: "rgba(32,59,59,0.5)" }} />

                        <div className="relative z-10">
                            <h2 className="text-[18px] sm:text-[20px] font-black text-white leading-tight tracking-tight">
                                Be the Reason They Keep Learning
                            </h2>
                            <p className="text-white/40 text-[11px] leading-relaxed mt-2">
                                Keeping 12,450 scholars learning offline — even when the internet is not there.
                            </p>
                        </div>

                        <div className="relative z-10 mt-4">
                            <Link href="/library">
                                <button
                                    className="px-4 h-8 sm:h-9 rounded-[5px] text-[12px] font-bold text-white transition-all"
                                    style={{ backgroundColor: ACCENT }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "#2d5050"}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = ACCENT}
                                >
                                    Browse the Library
                                </button>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* ── Recent lessons + Quick access ── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-2 sm:gap-3">

                    {/* Recent lessons */}
                    <div className="bg-white rounded-[5px] p-3 sm:p-4">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <p className="text-[13px] sm:text-[14px] font-bold text-slate-900">Recent Lessons</p>
                            <Link href="/manage/scholar-dashboard/lessons"
                                className="text-[11px] font-semibold hover:underline underline-offset-2"
                                style={{ color: ACCENT }}>
                                View all
                            </Link>
                        </div>

                        {loading ? (
                            <div className="space-y-2">
                                {[1,2,3].map(i => (
                                    <div key={i} className="h-9 bg-slate-100 rounded-[5px] animate-pulse" />
                                ))}
                            </div>
                        ) : lessons.length === 0 ? (
                            <div className="w-full flex justify-center py-6">
                                <EmptyState message="No lessons yet. Join a class to see your lessons here." />
                            </div>
                        ) : (
                            <>
                                {/* Table header — hide "Class" on mobile */}
                                <div className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 pb-2 mb-1 ${isDark ? "" : "border-b border-slate-100"}`}>
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Lesson</span>
                                    <span className="hidden sm:block text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Class</span>
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Status</span>
                                </div>
                                <div className={isDark ? "" : "divide-y divide-slate-50"}>
                                    {lessons.slice(0, 6).map((lesson) => {
                                        const status = lesson?.progress?.status || "not_started";
                                        return (
                                            <Link
                                                key={lesson.id}
                                                href={`/manage/scholar-dashboard/lessons/${lesson.id}`}
                                                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 items-center py-2.5 sm:py-3 hover:bg-slate-50 -mx-2 px-2 rounded-[5px] transition-colors group"
                                            >
                                                <p className="text-[11px] sm:text-[12px] font-semibold text-slate-800 group-hover:text-[#203A3A] transition-colors truncate">
                                                    {lesson.title}
                                                </p>
                                                <p className="hidden sm:block text-[11px] text-slate-400 whitespace-nowrap">{lesson.className}</p>
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                                                    status === "completed"   ? "bg-green-50 text-green-600" :
                                                    status === "in_progress" ? "text-white" :
                                                    "bg-slate-100 text-slate-400"
                                                }`}
                                                style={status === "in_progress" ? { backgroundColor: ACCENT } : {}}>
                                                    {status === "completed" ? "Done" : status === "in_progress" ? "In progress" : "Not started"}
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Quick access — 2-col grid on mobile, list on xl */}
                    <div className="bg-white rounded-[5px] p-3 sm:p-4">
                        <p className="text-[13px] sm:text-[14px] font-bold text-slate-900 mb-3">Quick Access</p>

                        <div className="grid grid-cols-2 xl:grid-cols-1 gap-1.5 xl:gap-0.5">
                            {[
                                { label: "My Classes", sub: `${classes.length} joined`,    icon: BookOpen,      href: "/manage/scholar-dashboard/classes",                  color: "text-blue-600 bg-blue-50" },
                                { label: "My Lessons", sub: `${inProgress} in progress`,   icon: GraduationCap, href: "/manage/scholar-dashboard/lessons",                  color: "text-amber-600 bg-amber-50" },
                                { label: "Library",    sub: "Browse materials",             icon: Layers,        href: "/library",                                           color: "text-violet-600 bg-violet-50" },
                                { label: "Completed",  sub: `${completed} lessons done`,   icon: CheckCircle2,  href: "/manage/scholar-dashboard/lessons?status=completed", color: "text-green-600 bg-green-50" },
                            ].map(({ label, sub, icon: Icon, href, color }) => (
                                <Link key={label} href={href}>
                                    <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-[5px] hover:bg-slate-50 transition-colors group cursor-pointer">
                                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[5px] flex items-center justify-center shrink-0 ${color}`}>
                                            <Icon className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] sm:text-[12px] font-semibold text-slate-800 group-hover:text-[#203A3A] transition-colors truncate">{label}</p>
                                            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">{loading ? "–" : sub}</p>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScholarDashboard;
