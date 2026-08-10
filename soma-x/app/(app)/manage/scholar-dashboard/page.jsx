"use client"
import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, BookOpen, CheckCircle2, Clock, Compass, GraduationCap, Layers, Search, Shuffle, Sparkles } from "lucide-react";
import DataContext from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import OnboardingTour, { TourLaunchButton } from "@/components/ui/OnboardingTour";
import { EmptyState } from "@/components/ui/empty-state";
import SpacedPracticeWidget from "@/components/sol/SpacedPracticeWidget";
import DiagnosticQuizModal from "@/components/sol/DiagnosticQuizModal";
import ProfileCompletionBanner from "@/components/notifications/ProfileCompletionBanner";
import NotificationBellDrawer from "@/components/notifications/NotificationBellDrawer";
import { getDiagnosticStatus } from "@/lib/sol-service";

import ProfileCard from "@/components/ui/ProfileCard";

const ScholarDashboard = () => {
    const { authenticated, role, unshiftString, SERVER_URL, isDark } = useContext(DataContext);
    const router = useRouter();
    const ACCENT = isDark ? "#0D9488" : "#203A3A";

    const currentRole = useMemo(() => (role ? unshiftString(role) : ""), [role, unshiftString]);

    const [displayName, setDisplayName] = useState("");
    const [scholarEmail, setScholarEmail] = useState("");
    const [showDiagnostic, setShowDiagnostic] = useState(false);

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
                const diag = await getDiagnosticStatus(SERVER_URL, scholarEmail);
                if (!diag.isCompleted) setShowDiagnostic(true);
                const coursesRes = await fetch(`${SERVER_URL}/courses/mine?userEmail=${encodeURIComponent(scholarEmail)}`);
                const courses = coursesRes.ok ? await coursesRes.json() : [];
                setClasses(courses);

                const perCourseAssignments = await Promise.all(
                    courses.map(async (course) => {
                        const res = await fetch(`${SERVER_URL}/courses/${course.id}/assignments?userEmail=${encodeURIComponent(scholarEmail)}`);
                        if (!res.ok) return [];
                        const items = await res.json();
                        return items.map((item) => ({ ...item, className: course.title, courseId: course.id }));
                    })
                );
                setLessons(perCourseAssignments.flat());
            } catch { /* silent */ }
            finally { setLoading(false); }
        };
        load();
    }, [authenticated, currentRole, SERVER_URL, scholarEmail]);

    const completed = lessons.filter(l => l?.grade != null || l?.myScore != null).length;
    const notStarted = lessons.length - completed;
    const inProgress = notStarted;
    const pct = lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0;

    const firstName = displayName ? displayName.split(" ")[0] : "Scholar";
    const initials = displayName
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
                    <p className="text-[11px] text-slate-600 mt-0.5 hidden sm:block">Let&apos;s learn something new today!</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <TourLaunchButton className="hidden sm:flex mr-1" />
                    <NotificationBellDrawer />
                    <ProfileCard />
                </div>
            </div>

            {/* Diagnostic Baseline Assessment Modal */}
            <DiagnosticQuizModal
                isOpen={showDiagnostic}
                onClose={() => setShowDiagnostic(false)}
                serverUrl={SERVER_URL}
                scholarEmail={scholarEmail}
            />

            {/* ── Dashboard grid ── */}
            <div className="pt-[10px] space-y-3">
                <ProfileCompletionBanner />

                {/* Spaced Practice Scheduler Widget */}
                <SpacedPracticeWidget serverUrl={SERVER_URL} scholarEmail={scholarEmail} />

                {/* ── Conditional Dashboard Top Block ── */}
                {!loading && classes.length === 0 ? (
                    /* First-Time 0-Class Welcoming Hero Card */
                    <div
                        className="relative rounded-2xl overflow-hidden p-6 sm:p-8 border shadow-md my-2"
                        style={{
                            background: "linear-gradient(135deg, #071919 0%, #0d2b2b 45%, #152e2e 75%, #0a2020 100%)",
                            borderColor: "rgba(255,255,255,0.12)"
                        }}
                    >
                        {/* Background Dot Texture */}
                        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
                            backgroundSize: "20px 20px"
                        }} />

                        {/* Ambient Glow Orb */}
                        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full blur-3xl pointer-events-none"
                            style={{ backgroundColor: "rgba(13,148,136,0.25)" }} />

                        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <div className="space-y-3 max-w-2xl">
                                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight flex items-center gap-2">
                                    <span>You&apos;re All Settled In!</span>
                                    <Sparkles className="w-6 h-6 text-teal-400 shrink-0" />
                                </h2>
                                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
                                    Your account is active and ready to go. Your teacher will add you to your course soon — this is standard procedure, so no action is needed on your part! In the meantime, feel free to explore independent learning materials in the open Library.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
                                <Link href="/library" className="w-full sm:w-auto">
                                    <Button className="w-full sm:w-auto h-11 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-teal-950/40 transition-all">
                                        <BookOpen className="w-4 h-4" />
                                        Browse the Library
                                        <ArrowRight className="w-4 h-4" />
                                    </Button>
                                </Link>
                                <Link href="/manage/scholar-dashboard/interleaved-review" className="w-full sm:w-auto">
                                    <Button variant="outline" className="w-full sm:w-auto h-11 px-5 rounded-xl border-white/20 hover:bg-white/10 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 backdrop-blur-sm">
                                        <Shuffle className="w-4 h-4 text-teal-400" />
                                        Try Practice Topics
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Active Class Stat Cards + Promo Banner */
                    <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_280px] gap-2 sm:gap-3">

                        {/* Courses card */}
                        <div className="bg-white rounded-[5px] p-3 sm:p-4 flex flex-col gap-3">
                            <div>
                                <p className="text-[13px] sm:text-[14px] font-bold text-slate-800">My Courses</p>
                                <p className="text-[10px] sm:text-[11px] text-slate-600 mt-0.5">
                                    {loading ? "Loading…" : `${classes.length} ${classes.length === 1 ? "course" : "courses"} enrolled`}
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
                            <Link href="/manage/scholar-dashboard/courses" className="mt-auto">
                                <Button variant="outline" className="w-full h-8 sm:h-9 text-[11px] sm:text-[12px] font-semibold rounded-[5px] border-slate-200 text-slate-700 hover:bg-slate-50">
                                    View classes
                                </Button>
                            </Link>
                        </div>

                        {/* Lessons card */}
                        <div className="bg-white rounded-[5px] p-3 sm:p-4 flex flex-col gap-2">
                            <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium">Lesson Progress</p>
                            <div className="flex-1 flex flex-col justify-center gap-2 py-1">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-[36px] sm:text-[44px] font-black leading-none" style={{ color: ACCENT }}>
                                        {loading ? "–" : inProgress}
                                    </span>
                                    <span className="text-[10px] sm:text-[11px] text-slate-600 font-medium pb-1">in progress</span>
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
                            <Link href="/manage/scholar-dashboard/courses" className="mt-auto">
                                <Button variant="outline" className="w-full h-8 sm:h-9 text-[11px] sm:text-[12px] font-semibold rounded-[5px] border-slate-200 text-slate-700 hover:bg-slate-50">
                                    View lessons
                                </Button>
                            </Link>
                        </div>

                        {/* Completion card */}
                        <div className="hidden sm:flex bg-white rounded-[5px] p-3 sm:p-4 flex-col gap-2">
                            <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium">Completion Rate</p>
                            <div className="flex-1 flex flex-col justify-center gap-2 py-1">
                                <div>
                                    <span className={`text-[36px] sm:text-[44px] font-black leading-none ${pct >= 70 ? "text-green-500" : pct >= 30 ? "text-orange-500" : "text-slate-800"
                                        }`}>
                                        {loading ? "–" : `${pct}%`}
                                    </span>
                                    <p className="text-[10px] sm:text-[11px] text-slate-600 mt-1">
                                        {loading ? "Loading…" : `${completed} of ${lessons.length} done`}
                                    </p>
                                </div>
                                {!loading && (
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 ${pct >= 70 ? "bg-green-500" : pct >= 30 ? "bg-orange-400" : "bg-slate-300"
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

                        {/* Promo banner */}
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
                )}

                {/* ── Recent lessons + Quick access ── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-2 sm:gap-3">

                    {/* Recent lessons */}
                    <div className="bg-white rounded-[5px] p-3 sm:p-4">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <p className="text-[13px] sm:text-[14px] font-bold text-slate-900">Recent Lessons</p>
                            <Link href="/manage/scholar-dashboard/courses"
                                className="text-[11px] font-semibold hover:underline underline-offset-2"
                                style={{ color: ACCENT }}>
                                View all
                            </Link>
                        </div>

                        {loading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-9 bg-slate-100 rounded-[5px] animate-pulse" />
                                ))}
                            </div>
                        ) : lessons.length === 0 ? (
                            <div className="w-full flex justify-center py-6">
                                <EmptyState message="Your teacher will enroll you in your first course soon. In the meantime, browse the Library to explore topics!" />
                            </div>
                        ) : (
                            <>
                                {/* Table header */}
                                <div className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 pb-2 mb-1 ${isDark ? "" : "border-b border-slate-100"}`}>
                                    <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Assignment</span>
                                    <span className="hidden sm:block text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Course</span>
                                    <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Status</span>
                                </div>
                                <div className={isDark ? "" : "divide-y divide-slate-50"}>
                                    {lessons.slice(0, 6).map((lesson) => {
                                        const isDone = lesson?.grade != null || lesson?.myScore != null;
                                        const status = isDone ? "completed" : "not_started";
                                        const sectionKey = lesson.kind === "quiz" ? "quizzes" : lesson.kind === "discussion" ? "discussions" : "assignments";
                                        return (
                                            <Link
                                                key={`${lesson.kind}-${lesson.id}`}
                                                href={`/course/${lesson.courseId}/${sectionKey}/${lesson.id}`}
                                                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] gap-3 sm:gap-4 items-center py-2.5 sm:py-3 hover:bg-slate-50 -mx-2 px-2 rounded-[5px] transition-colors group"
                                            >
                                                <p className="text-[11px] sm:text-[12px] font-semibold text-slate-800 group-hover:text-[#203A3A] transition-colors truncate">
                                                    {lesson.title}
                                                </p>
                                                <p className="hidden sm:block text-[11px] text-slate-600 whitespace-nowrap">{lesson.className}</p>
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${status === "completed" ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-600"}`}>
                                                    {status === "completed" ? "Done" : "Not started"}
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
                            {(classes.length === 0 ? [
                                { label: "Library", sub: "Browse materials & books", icon: Layers, href: "/library", color: "text-violet-600 bg-violet-50" },
                                { label: "Interleaved Review", sub: "Independent practice", icon: Shuffle, href: "/manage/scholar-dashboard/interleaved-review", color: "text-teal-600 bg-teal-50" },
                                { label: "My Courses", sub: "Waiting for teacher", icon: BookOpen, href: "/manage/scholar-dashboard/courses", color: "text-blue-600 bg-blue-50" },
                                { label: "Assignments", sub: "0 outstanding", icon: GraduationCap, href: "/manage/scholar-dashboard/courses", color: "text-amber-600 bg-amber-50" },
                                { label: "Completed", sub: "0 completed", icon: CheckCircle2, href: "/manage/scholar-dashboard/courses", color: "text-green-600 bg-green-50" },
                            ] : [
                                { label: "My Courses", sub: `${classes.length} joined`, icon: BookOpen, href: "/manage/scholar-dashboard/courses", color: "text-blue-600 bg-blue-50" },
                                { label: "Assignments", sub: `${inProgress} outstanding`, icon: GraduationCap, href: "/manage/scholar-dashboard/courses", color: "text-amber-600 bg-amber-50" },
                                { label: "Interleaved Review", sub: "Mixed topic practice", icon: Shuffle, href: "/manage/scholar-dashboard/interleaved-review", color: "text-teal-600 bg-teal-50" },
                                { label: "Library", sub: "Browse materials", icon: Layers, href: "/library", color: "text-violet-600 bg-violet-50" },
                                { label: "Completed", sub: `${completed} assignments done`, icon: CheckCircle2, href: "/manage/scholar-dashboard/courses", color: "text-green-600 bg-green-50" },
                            ]).map(({ label, sub, icon: Icon, href, color }) => (
                                <Link key={label} href={href}>
                                    <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-[5px] hover:bg-slate-50 transition-colors group cursor-pointer">
                                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[5px] flex items-center justify-center shrink-0 ${color}`}>
                                            <Icon className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] sm:text-[12px] font-semibold text-slate-800 group-hover:text-[#203A3A] transition-colors truncate">{label}</p>
                                            <p className="text-[9px] sm:text-[10px] text-slate-600 truncate">{loading ? "–" : sub}</p>
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
