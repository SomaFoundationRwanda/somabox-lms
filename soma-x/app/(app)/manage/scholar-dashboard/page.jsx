"use client"
import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CalendarDays, Compass, GraduationCap, LayoutGrid, Layers, Shuffle, Sparkles, Users } from "lucide-react";
import DataContext from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import OnboardingTour, { TourLaunchButton } from "@/components/ui/OnboardingTour";
import SpacedPracticeWidget from "@/components/sol/SpacedPracticeWidget";
import DiagnosticQuizModal from "@/components/sol/DiagnosticQuizModal";
import ProfileCompletionBanner from "@/components/notifications/ProfileCompletionBanner";
import AssignmentBell from "@/components/notifications/AssignmentBell";
import { getDiagnosticStatus } from "@/lib/sol-service";
import { SOL_QUIZ_ENABLED } from "@/lib/featureFlags";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { startRouteLoading } from "@/components/global/RouteLoader";
import Loader from "@/components/ui/Loader";
import UpcomingByDate from "@/components/learner/UpcomingByDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

// The learner's choice of "cards" or "date" for My courses, kept on this device.
const VIEW_KEY = "somabox.learnerDashboard.view";

const ScholarDashboard = () => {
    const { authenticated, role, SERVER_URL, user } = useContext(DataContext);
    const router = useRouter();
    const { t } = useLanguage();

    const currentRole = useMemo(() => (role || ""), [role]);

    const [scholarEmail, setScholarEmail] = useState("");
    const [showDiagnostic, setShowDiagnostic] = useState(false);

    useEffect(() => {
        setScholarEmail(user?.email || "");
    }, [user]);

    // The learner's dashboard, kept until their courses change (live updates) or they join one.
    const queryClient = useQueryClient();
    const dashboard = useQuery({
        queryKey: queryKeys.dashboard,
        queryFn: () => apiFetch("/users/me/dashboard"),
        enabled: authenticated && currentRole === "scholar" && !!scholarEmail,
    });
    const enrolledCourses = dashboard.data?.enrolled_courses || [];
    const publicCourses = dashboard.data?.public_courses || [];
    const loading = dashboard.isFetching && !dashboard.data;
    const [joiningId, setJoiningId] = useState(null);
    const [joinError, setJoinError] = useState("");
    const [coursesView, setCoursesView] = useState("cards");
    useEffect(() => {
        try { if (window.localStorage.getItem(VIEW_KEY) === "date") setCoursesView("date"); } catch { /* storage unavailable */ }
    }, []);
    const chooseView = (view) => {
        setCoursesView(view);
        try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* storage unavailable */ }
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authenticated, currentRole, SERVER_URL, scholarEmail]);

    const joinCourse = async (courseId) => {
        setJoiningId(courseId);
        setJoinError("");
        try {
            await apiFetch(`/courses/${courseId}/join`, { method: "POST", json: {} });
            queryClient.invalidateQueries({ queryKey: queryKeys.courses });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
            startRouteLoading();
            router.push(`/course/${courseId}/home`);
        } catch (err) {
            setJoinError(err?.body?.message || (err?.status === 0 ? getErrorMessage(err, t) : t("learner.discover.joinFailed")));
            setJoiningId(null);
        }
    };

    useEffect(() => {
        if (authenticated && currentRole && currentRole !== "scholar") {
            startRouteLoading();
            router.replace("/");
        }
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
                    className="dark relative rounded-[5px] overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 bg-surface-raised"
                >
                    <div className="absolute inset-0 opacity-[0.04] text-white"
                        style={{ backgroundImage: "radial-gradient(circle, currentColor 1.5px, transparent 1.5px)", backgroundSize: "24px 24px" }} />
                    <div className="absolute -bottom-16 -left-10 w-56 h-56 rounded-full blur-3xl pointer-events-none bg-brand-strong/30" />

                    <div className="relative z-10">
                        <h2 className="text-item sm:text-section font-extrabold text-white leading-tight tracking-tight">
                            {t("learner.dashboard.offlineTitle")}
                        </h2>
                        <p className="text-white/40 text-caption leading-relaxed mt-1">
                            {t("learner.dashboard.offlineBody")}
                        </p>
                    </div>

                    <Link href="/library" className="relative z-10 shrink-0">
                        <button
                            className="px-4 h-9 rounded-[5px] text-caption font-bold bg-brand-strong text-on-brand-strong hover:brightness-110 transition-all"
                        >
                            {t("learner.dashboard.browseLibrary")}
                        </button>
                    </Link>
                </div>

                {/* ── Recent lessons + Quick access ── */}
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-2 sm:gap-3">

                    <div className="space-y-2 sm:space-y-3">
                        {joinError ? (
                            <div className="rounded-[5px] border border-danger/30 bg-danger-soft p-3 text-caption text-danger-fg">{joinError}</div>
                        ) : null}

                        {loading ? (
                            <Loader variant="page" size={56} className="min-h-[30vh]" />
                        ) : showTrueEmptyState ? (
                            /* True empty state — only when zero enrollments AND zero public courses */
                            <div
                                className="dark relative rounded-2xl overflow-hidden p-6 sm:p-8 border border-white/10 shadow-md"
                                style={{
                                    background: "linear-gradient(135deg, color-mix(in srgb, var(--brand-deep) 18%, black) 0%, color-mix(in srgb, var(--brand-deep) 32%, black) 45%, color-mix(in srgb, var(--brand-deep) 36%, black) 75%, color-mix(in srgb, var(--brand-deep) 24%, black) 100%)",
                                }}
                            >
                                <div className="absolute inset-0 opacity-20 pointer-events-none text-white/15" style={{
                                    backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                                    backgroundSize: "20px 20px"
                                }} />
                                <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full blur-3xl pointer-events-none"
                                    style={{ backgroundColor: "color-mix(in srgb, var(--brand-secondary) 25%, transparent)" }} />

                                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                    <div className="space-y-3 max-w-2xl">
                                        <h2 className="text-title sm:text-display font-extrabold text-white tracking-tight leading-tight flex items-center gap-2">
                                            <span>{t("learner.dashboard.settledTitle")}</span>
                                            <Sparkles className="w-6 h-6 text-brand-fg shrink-0" />
                                        </h2>
                                        <p className="text-fg-subtle text-caption sm:text-ui leading-relaxed">
                                            {t("learner.dashboard.settledBody")}
                                        </p>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
                                        <Link href="/library" className="w-full sm:w-auto">
                                            <Button className="w-full sm:w-auto h-11 px-6 rounded-xl bg-brand hover:bg-brand/90 text-on-brand font-extrabold text-caption sm:text-ui flex items-center justify-center gap-2 shadow-lg shadow-black/40 transition-all">
                                                <BookOpen className="w-4 h-4" />
                                                {t("learner.dashboard.browseLibrary")}
                                                <ArrowRight className="w-4 h-4" />
                                            </Button>
                                        </Link>
                                        <Link href="/manage/scholar-dashboard/interleaved-review" className="w-full sm:w-auto">
                                            <Button variant="outline" className="w-full sm:w-auto h-11 px-5 rounded-xl border-white/20 hover:bg-white/10 font-bold text-caption sm:text-ui flex items-center justify-center gap-2 backdrop-blur-sm">
                                                <Shuffle className="w-4 h-4 text-brand-fg" />
                                                {t("learner.dashboard.tryPractice")}
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* My Courses */}
                                {hasEnrolled ? (
                                    <div className="bg-surface rounded-[5px] p-3 sm:p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-small sm:text-ui font-bold text-fg">{t("learner.dashboard.myCourses")}</p>
                                            <div className="flex items-center gap-3">
                                                <div role="group" aria-label={t("learner.dashboard.view.label")} className="inline-flex rounded-[5px] border border-line p-0.5">
                                                    {[
                                                        { id: "cards", icon: LayoutGrid, label: t("learner.dashboard.view.cards") },
                                                        { id: "date", icon: CalendarDays, label: t("learner.dashboard.view.byDate") },
                                                    ].map(({ id, icon: Icon, label }) => (
                                                        <button
                                                            key={id}
                                                            type="button"
                                                            onClick={() => chooseView(id)}
                                                            aria-pressed={coursesView === id}
                                                            className={`inline-flex items-center gap-1 text-caption font-semibold px-2 py-1 rounded-[4px] transition-colors ${coursesView === id ? "bg-brand-strong text-on-brand-strong" : "text-fg-muted hover:bg-surface-hover"}`}
                                                        >
                                                            <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <Link href="/manage/scholar-dashboard/courses"
                                                    className="text-caption font-semibold text-brand-fg hover:underline underline-offset-2">
                                                    {t("learner.dashboard.viewAll")}
                                                </Link>
                                            </div>
                                        </div>
                                        {coursesView === "date" ? (
                                            <UpcomingByDate />
                                        ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {enrolledCourses.map((course) => (
                                                <div key={course.id} className="rounded-[5px] border border-line overflow-hidden flex flex-col">
                                                    {course.coverImageUrl ? (
                                                        <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-24 object-cover" />
                                                    ) : (
                                                        <div className="w-full h-24 bg-surface-sunken flex items-center justify-center">
                                                            <BookOpen className="w-5 h-5 text-fg-subtle" />
                                                        </div>
                                                    )}
                                                    <div className="p-3 flex flex-col gap-2 flex-1">
                                                        <p className="text-caption font-bold text-fg truncate">{course.title}</p>
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between text-caption text-fg-subtle">
                                                                <span>{t("learner.dashboard.progress")}</span>
                                                                <span className="font-semibold text-fg-muted">{course.progress == null ? t("learner.dashboard.noGradedWork") : `${course.progress}%`}</span>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-surface-sunken rounded-full overflow-hidden">
                                                                <div className="h-full rounded-full bg-brand-strong transition-all duration-700" style={{ width: `${course.progress ?? 0}%` }} />
                                                            </div>
                                                        </div>
                                                        <Link href={`/course/${course.id}/home`} className="mt-auto">
                                                            <Button className="w-full h-8 text-caption font-semibold rounded-[5px]">
                                                                {t("learner.dashboard.continue")}
                                                            </Button>
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        )}
                                    </div>
                                ) : null}

                                {/* Explore Public Courses */}
                                {hasPublic ? (
                                    <div className="bg-surface rounded-[5px] p-3 sm:p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Compass className="w-4 h-4 text-fg-subtle" />
                                            <p className="text-small sm:text-ui font-bold text-fg">{t("learner.dashboard.publicCourses")}</p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {publicCourses.map((course) => (
                                                <div key={course.id} className="rounded-[5px] border border-line overflow-hidden flex flex-col">
                                                    {course.coverImageUrl ? (
                                                        <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-24 object-cover" />
                                                    ) : (
                                                        <div className="w-full h-24 bg-surface-sunken flex items-center justify-center">
                                                            <Compass className="w-5 h-5 text-fg-subtle" />
                                                        </div>
                                                    )}
                                                    <div className="p-3 flex flex-col gap-1.5 flex-1">
                                                        <p className="text-caption font-bold text-fg truncate">{course.title}</p>
                                                        {course.grade ? (
                                                            <span className="text-caption font-semibold text-fg-subtle bg-surface-sunken rounded-full px-2 py-0.5 w-fit">{course.grade}</span>
                                                        ) : null}
                                                        {course.description ? (
                                                            <p className="text-caption text-fg-muted line-clamp-2">{course.description}</p>
                                                        ) : null}
                                                        <div className="flex items-center gap-1 text-caption text-fg-subtle">
                                                            <Users className="w-3 h-3" />
                                                            <span>{fill(t(course.studentCount === 1 ? "learner.discover.oneEnrolled" : "learner.discover.nEnrolled"), { n: course.studentCount })}</span>
                                                        </div>
                                                        <Button
                                                            onClick={() => joinCourse(course.id)}
                                                            disabled={joiningId === course.id}
                                                            className="w-full h-8 text-caption font-semibold rounded-[5px] mt-auto disabled:opacity-50"
                                                        >
                                                            {joiningId === course.id ? t("learner.discover.joining") : t("learner.discover.join")}
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
                    <div className="bg-surface rounded-[5px] p-3 sm:p-4">
                        <p className="text-small sm:text-ui font-bold text-fg mb-3">{t("learner.dashboard.quickAccess")}</p>

                        <div className="grid grid-cols-2 xl:grid-cols-1 gap-1.5 xl:gap-0.5">
                            {[
                                { id: "courses", label: t("learner.dashboard.myCourses"), sub: hasEnrolled ? fill(t("learner.dashboard.nJoined"), { n: enrolledCourses.length }) : t("learner.dashboard.notEnrolled"), icon: BookOpen, href: "/manage/scholar-dashboard/courses", color: "text-info-fg bg-info-soft" },
                                { id: "assignments", label: t("shell.assignments.title"), sub: t("learner.dashboard.viewWork"), icon: GraduationCap, href: "/manage/scholar-dashboard/courses", color: "text-warning-fg bg-warning-soft" },
                                { id: "discover", label: t("shell.nav.discoverCourses"), sub: t("learner.dashboard.discoverSub"), icon: Compass, href: "/discover-courses", color: "text-brand-fg bg-brand-soft" },
                                { id: "review", label: t("learner.dashboard.interleaved"), sub: t("learner.dashboard.interleavedSub"), icon: Shuffle, href: "/manage/scholar-dashboard/interleaved-review", color: "text-info-fg bg-info-soft" },
                                { id: "library", label: t("nav.library") || "Library", sub: t("learner.dashboard.librarySub"), icon: Layers, href: "/library", color: "text-success-fg bg-success-soft" },
                            ].map(({ id, label, sub, icon: Icon, href, color }) => (
                                <Link key={id} href={href}>
                                    <div className="flex items-center gap-2.5 p-2 sm:p-2.5 rounded-[5px] hover:bg-surface-hover transition-colors group cursor-pointer">
                                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-[5px] flex items-center justify-center shrink-0 ${color}`}>
                                            <Icon className="w-[13px] h-[13px] sm:w-[15px] sm:h-[15px]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-caption sm:text-caption font-semibold text-fg group-hover:text-brand-fg transition-colors truncate">{label}</p>
                                            <p className="text-caption text-fg-muted truncate">{sub}</p>
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
