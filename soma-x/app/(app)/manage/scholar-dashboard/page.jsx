"use client"
import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Compass, GraduationCap, Layers, Shuffle, Sparkles, Users } from "lucide-react";
import DataContext from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import OnboardingTour, { TourLaunchButton } from "@/components/ui/OnboardingTour";
import SpacedPracticeWidget from "@/components/sol/SpacedPracticeWidget";
import DiagnosticQuizModal from "@/components/sol/DiagnosticQuizModal";
import ProfileCompletionBanner from "@/components/notifications/ProfileCompletionBanner";
import AssignmentBell from "@/components/notifications/AssignmentBell";
import { getDiagnosticStatus } from "@/lib/sol-service";
import { SOL_QUIZ_ENABLED } from "@/lib/featureFlags";

const ScholarDashboard = () => {
    const { authenticated, role, SERVER_URL, isDark, user } = useContext(DataContext);
    const router = useRouter();
    const ACCENT = isDark ? "#0D9488" : "#203A3A";

    const currentRole = useMemo(() => (role || ""), [role]);

    const [scholarEmail, setScholarEmail] = useState("");
    const [showDiagnostic, setShowDiagnostic] = useState(false);

    useEffect(() => {
        setScholarEmail(user?.email || "");
    }, [user]);

    const [enrolledCourses, setEnrolledCourses] = useState([]);
    const [publicCourses, setPublicCourses] = useState([]);
    const [loading, setLoading] = useState(false);
    const [joiningId, setJoiningId] = useState(null);
    const [joinError, setJoinError] = useState("");

    const loadDashboard = async () => {
        if (!SERVER_URL || !scholarEmail) return;
        setLoading(true);
        try {
            const res = await fetch(`${SERVER_URL}/users/me/dashboard`);
            if (res.ok) {
                const data = await res.json();
                setEnrolledCourses(data.enrolled_courses || []);
                setPublicCourses(data.public_courses || []);
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    };

    useEffect(() => {
        if (!authenticated || currentRole !== "scholar" || !SERVER_URL || !scholarEmail) return;
        (async () => {
            if (SOL_QUIZ_ENABLED) {
                try {
                    const diag = await getDiagnosticStatus(SERVER_URL);
                    if (!diag.isCompleted) setShowDiagnostic(true);
                } catch { /* silent */ }
            }
        })();
        loadDashboard();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authenticated, currentRole, SERVER_URL, scholarEmail]);

    const joinCourse = async (courseId) => {
        setJoiningId(courseId);
        setJoinError("");
        try {
            const res = await fetch(`${SERVER_URL}/courses/${courseId}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (!res.ok) throw new Error((await res.json()).message || "Failed to join");
            router.push(`/course/${courseId}/home`);
        } catch (err) {
            setJoinError(err.message || "Failed to join course");
            setJoiningId(null);
        }
    };

    useEffect(() => {
        if (authenticated && currentRole && currentRole !== "scholar") router.replace("/");
    }, [authenticated, currentRole, router]);

    if (!authenticated || currentRole !== "scholar") return null;

    const hasEnrolled = enrolledCourses.length > 0;
    const hasPublic = publicCourses.length > 0;
    const showTrueEmptyState = !loading && !hasEnrolled && !hasPublic;

    return (
        <div className="min-h-screen pb-24 md:pb-8">

            {/* Onboarding tour — auto-shows on first visit */}
            <OnboardingTour />

            {/* ── Page-specific header actions (shared header now lives in the app shell layout) ── */}
            <div className="flex items-center justify-end gap-2 pt-3">
                <TourLaunchButton className="hidden sm:flex mr-1" />
                <AssignmentBell />
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

                {/* Library promo banner — always shown, has a real action */}
                <div
                    className="relative rounded-[5px] overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5"
                    style={{ backgroundColor: "#111827" }}
                >
                    <div className="absolute inset-0 opacity-[0.04]"
                        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }} />
                    <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full blur-3xl pointer-events-none"
                        style={{ backgroundColor: "rgba(32,59,59,0.5)" }} />

                    <div className="relative z-10">
                        <h2 className="text-[16px] sm:text-[18px] font-black text-white leading-tight tracking-tight">
                            Keep Learning, Even Offline
                        </h2>
                        <p className="text-white/40 text-[11px] leading-relaxed mt-1">
                            Browse books and materials in your Library anytime — no internet connection needed.
                        </p>
                    </div>

                    <Link href="/library" className="relative z-10 shrink-0">
                        <button
                            className="px-4 h-9 rounded-[5px] text-[12px] font-bold text-white transition-all"
                            style={{ backgroundColor: ACCENT }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#2d5050"}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = ACCENT}
                        >
                            Browse the Library
                        </button>
                    </Link>
                </div>

                {/* ── Recent lessons + Quick access ── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-2 sm:gap-3">

                    <div className="space-y-2 sm:space-y-3">
                        {joinError ? (
                            <div className="rounded-[5px] border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{joinError}</div>
                        ) : null}

                        {loading ? (
                            <div className="bg-white rounded-[5px] p-3 sm:p-4 space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-16 bg-slate-100 rounded-[5px] animate-pulse" />
                                ))}
                            </div>
                        ) : showTrueEmptyState ? (
                            /* True empty state — only when zero enrollments AND zero public courses */
                            <div
                                className="relative rounded-2xl overflow-hidden p-6 sm:p-8 border shadow-md"
                                style={{
                                    background: "linear-gradient(135deg, #071919 0%, #0d2b2b 45%, #152e2e 75%, #0a2020 100%)",
                                    borderColor: "rgba(255,255,255,0.12)"
                                }}
                            >
                                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
                                    backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
                                    backgroundSize: "20px 20px"
                                }} />
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
                            <>
                                {/* My Courses */}
                                {hasEnrolled ? (
                                    <div className="bg-white rounded-[5px] p-3 sm:p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[13px] sm:text-[14px] font-bold text-slate-900">My Courses</p>
                                            <Link href="/manage/scholar-dashboard/courses"
                                                className="text-[11px] font-semibold hover:underline underline-offset-2"
                                                style={{ color: ACCENT }}>
                                                View all
                                            </Link>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {enrolledCourses.map((course) => (
                                                <div key={course.id} className="rounded-[5px] border border-slate-200 overflow-hidden flex flex-col">
                                                    {course.coverImageUrl ? (
                                                        <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-24 object-cover" />
                                                    ) : (
                                                        <div className="w-full h-24 bg-slate-100 flex items-center justify-center">
                                                            <BookOpen className="w-5 h-5 text-slate-300" />
                                                        </div>
                                                    )}
                                                    <div className="p-3 flex flex-col gap-2 flex-1">
                                                        <p className="text-[12px] font-bold text-slate-900 truncate">{course.title}</p>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                                                                <span>Progress</span>
                                                                <span className="font-semibold text-slate-700">{course.progress == null ? "No graded work yet" : `${course.progress}%`}</span>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${course.progress ?? 0}%`, backgroundColor: ACCENT }} />
                                                            </div>
                                                        </div>
                                                        <Link href={`/course/${course.id}/home`} className="mt-auto">
                                                            <Button className="w-full h-8 text-[11px] font-semibold rounded-[5px]" style={{ backgroundColor: ACCENT }}>
                                                                Continue
                                                            </Button>
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {/* Explore Public Courses */}
                                {hasPublic ? (
                                    <div className="bg-white rounded-[5px] p-3 sm:p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Compass className="w-4 h-4 text-slate-500" />
                                            <p className="text-[13px] sm:text-[14px] font-bold text-slate-900">Explore Public Courses</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {publicCourses.map((course) => (
                                                <div key={course.id} className="rounded-[5px] border border-slate-200 overflow-hidden flex flex-col">
                                                    {course.coverImageUrl ? (
                                                        <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-24 object-cover" />
                                                    ) : (
                                                        <div className="w-full h-24 bg-slate-100 flex items-center justify-center">
                                                            <Compass className="w-5 h-5 text-slate-300" />
                                                        </div>
                                                    )}
                                                    <div className="p-3 flex flex-col gap-1.5 flex-1">
                                                        <p className="text-[12px] font-bold text-slate-900 truncate">{course.title}</p>
                                                        {course.grade ? (
                                                            <span className="text-[11px] font-semibold uppercase text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 w-fit">{course.grade}</span>
                                                        ) : null}
                                                        {course.description ? (
                                                            <p className="text-[11px] text-slate-600 line-clamp-2">{course.description}</p>
                                                        ) : null}
                                                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                                            <Users className="w-3 h-3" />
                                                            <span>{course.studentCount} enrolled</span>
                                                        </div>
                                                        <Button
                                                            onClick={() => joinCourse(course.id)}
                                                            disabled={joiningId === course.id}
                                                            className="w-full h-8 text-[11px] font-semibold rounded-[5px] mt-auto disabled:opacity-50"
                                                            style={{ backgroundColor: ACCENT }}
                                                        >
                                                            {joiningId === course.id ? "Joining..." : "Join Course"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        )}
                    </div>

                    {/* Quick access — 2-col grid on mobile, list on xl */}
                    <div className="bg-white rounded-[5px] p-3 sm:p-4">
                        <p className="text-[13px] sm:text-[14px] font-bold text-slate-900 mb-3">Quick Access</p>

                        <div className="grid grid-cols-2 xl:grid-cols-1 gap-1.5 xl:gap-0.5">
                            {[
                                { label: "My Courses", sub: hasEnrolled ? `${enrolledCourses.length} joined` : "Not enrolled yet", icon: BookOpen, href: "/manage/scholar-dashboard/courses", color: "text-blue-600 bg-blue-50" },
                                { label: "Assignments", sub: "View your work", icon: GraduationCap, href: "/manage/scholar-dashboard/courses", color: "text-amber-600 bg-amber-50" },
                                { label: "Discover Courses", sub: "Browse & join public courses", icon: Compass, href: "/discover-courses", color: "text-teal-600 bg-teal-50" },
                                { label: "Interleaved Review", sub: "Independent practice", icon: Shuffle, href: "/manage/scholar-dashboard/interleaved-review", color: "text-violet-600 bg-violet-50" },
                                { label: "Library", sub: "Browse materials & books", icon: Layers, href: "/library", color: "text-green-600 bg-green-50" },
                            ].map(({ label, sub, icon: Icon, href, color }) => (
                                <Link key={label} href={href}>
                                    <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-[5px] hover:bg-slate-50 transition-colors group cursor-pointer">
                                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[5px] flex items-center justify-center shrink-0 ${color}`}>
                                            <Icon className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] sm:text-[12px] font-semibold text-slate-800 group-hover:text-[#203A3A] transition-colors truncate">{label}</p>
                                            <p className="text-[11px] text-slate-600 truncate">{sub}</p>
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
