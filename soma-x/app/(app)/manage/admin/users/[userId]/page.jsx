"use client";

import { useEffect, useState, useContext } from "react";
import { useParams, useRouter } from "next/navigation";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import {
    ArrowLeft, Building2, Calendar, CheckCircle2, Globe2, GraduationCap,
    Mail, MapPin, Phone, User, Activity, BrainCircuit, Download
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { downloadFile } from "@/lib/download";
import PracticeLabel from "@/components/sol/PracticeLabel";
import Link from "next/link";
import { PageHeader, Section, List, ListRow, DataTable, EmptyState } from "@/components/layout";
import { fill } from "@/lib/fill";
import { LANGUAGE_NAMES } from "@/components/global/LanguageSwitcher";

function getInitials(name, email) {
    if (name?.trim()) return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (email?.[0] || "?").toUpperCase();
}

// A date in the UI language ("rw" falls back to English where Intl lacks Kinyarwanda); null if unusable.
function formatDate(raw, lang) {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    const opts = { month: "long", day: "numeric", year: "numeric" };
    try { return d.toLocaleDateString(lang === "rw" ? ["rw", "en-RW", "en"] : lang, opts); } catch { return d.toLocaleDateString("en", opts); }
}

const GENDERS = ["male", "female", "other", "non_binary"];

export default function UserProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { SERVER_URL, isDark } = useContext(DataContext);
    const { t, lang } = useLanguage();
    const { showToast } = useToast();
    const [downloading, setDownloading] = useState(false);
    
    const [user, setUser] = useState(null);
    const [classes, setClasses] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [spacedPractice, setSpacedPractice] = useState(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const dm = isDark;
    const userId = params.userId;

    useEffect(() => {
        async function fetchUserData() {
            try {
                setLoading(true);
                // 1. Fetch User Data
                const userRes = await fetch(`${SERVER_URL}/users/${userId}`);
                if (!userRes.ok) throw new Error(t("admin.user.fetchFailed"));
                const userData = await userRes.json();
                setUser(userData);

                // 2. If Scholar, fetch enrolled classes & analytics
                if (userData.role === "scholar") {
                    const emailParam = encodeURIComponent(userData.email);
                    
                    const [classesRes, analyticsRes, spacedRes] = await Promise.all([
                        fetch(`${SERVER_URL}/courses/mine?userEmail=${emailParam}`).catch(() => null),
                        fetch(`${SERVER_URL}/analytics/sol-outcomes?scholarEmail=${emailParam}`).catch(() => null),
                        fetch(`${SERVER_URL}/sol/spaced/pending?scholarEmail=${emailParam}`).catch(() => null)
                    ]);

                    if (classesRes && classesRes.ok) {
                        const classesData = await classesRes.json();
                        setClasses(Array.isArray(classesData) ? classesData : []);
                    }
                    
                    if (analyticsRes && analyticsRes.ok) {
                        const analyticsData = await analyticsRes.json();
                        setAnalytics(analyticsData);
                    }

                    if (spacedRes && spacedRes.ok) {
                        const spacedData = await spacedRes.json();
                        // The endpoint returns an array of pending reviews.
                        setSpacedPractice(Array.isArray(spacedData) ? spacedData : spacedData?.pendingReviews || []);
                    }
                }
                
                setError(null);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        
        if (userId) fetchUserData();
    }, [userId, SERVER_URL]); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="text-center py-12">
                <p className="text-rose-500 font-bold mb-4">{error || t("admin.user.notFound")}</p>
                <button onClick={() => router.push("/manage/admin")} className="px-4 py-2 bg-slate-200 rounded-lg text-sm font-semibold">
                    {t("admin.user.goBack")}
                </button>
            </div>
        );
    }

    const downloadData = async () => {
        setDownloading(true);
        try {
            const safe = String(user.email || `user-${userId}`).replace(/[^a-z0-9]+/gi, "-");
            await downloadFile(`${SERVER_URL}/analytics/users/${encodeURIComponent(userId)}/data`, `somabox-data-${safe}.json`);
            showToast(t("admin.user.dataDownloaded"), "success");
        } catch (err) {
            showToast(err.message || t("admin.user.downloadFailed"), "error");
        } finally {
            setDownloading(false);
        }
    };

    const isInactive = user.is_active === 0;
    const initials = getInitials(user.full_name, user.email);
    const notSpecified = t("admin.user.notSpecified");
    const joined = formatDate(user.created_at, lang) || notSpecified;

    const roleColors = {
        admin: { bg: "bg-purple-100 dark:bg-purple-950/60", text: "text-purple-700 dark:text-purple-300", border: "border-purple-300 dark:border-purple-800" },
        teacher: { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-800" },
        scholar: { bg: "bg-sky-100 dark:bg-sky-950/60", text: "text-sky-700 dark:text-sky-300", border: "border-sky-300 dark:border-sky-800" },
    };
    const roleStyle = roleColors[user.role] || roleColors.scholar;

    const Field = ({ label, icon: Icon, children, className = "" }) => (
        <div className="py-2.5 flex items-start justify-between gap-4">
            <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className={`text-sm font-semibold text-slate-900 dark:text-white text-right flex items-center gap-1.5 min-w-0 ${className}`}>
                {Icon ? <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : null}
                <span className="min-w-0 break-words">{children}</span>
            </dd>
        </div>
    );

    const courseColumns = [
        {
            key: "title",
            header: t("admin.courses.colCourse"),
            render: (course) => (
                <div className="min-w-0">
                    <Link href={`/course/${course.id}/home`} className="font-semibold text-slate-900 dark:text-white hover:text-[#0D9488] hover:underline">
                        {course.title}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{course.description || t("admin.user.noDescription")}</p>
                </div>
            ),
        },
        {
            key: "teacher",
            header: t("admin.courses.colTeacher"),
            hideOnMobile: true,
            render: (course) => <span className="text-xs text-slate-600 dark:text-slate-300">{course.created_by_teacher_email || "—"}</span>,
        },
        {
            key: "grade",
            header: t("admin.user.colGrade"),
            render: (course) => course.grade
                ? <span className="text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full whitespace-nowrap">{course.grade}</span>
                : <span className="text-xs text-slate-400">—</span>,
        },
        {
            key: "open",
            header: <span className="sr-only">{t("admin.library.open")}</span>,
            align: "right",
            render: (course) => (
                <Link href={`/course/${course.id}/home`} className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap">
                    {t("admin.library.open")}
                </Link>
            ),
        },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12 animate-in fade-in duration-300 pt-4 px-4 sm:px-6">
            <button
                onClick={() => router.push("/manage/admin?tab=users")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
                <ArrowLeft className="w-3.5 h-3.5" /> {t("admin.user.backToUsers")}
            </button>

            {/* Header */}
            <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center text-white text-xl font-black shrink-0">
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <PageHeader
                        title={user.full_name || t("admin.user.unnamed")}
                        description={
                            <span className="inline-flex items-center gap-1.5 break-all">
                                <Mail className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                {user.email}
                            </span>
                        }
                        meta={
                            <>
                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
                                    {t(`role.${user.role}`) || user.role}
                                </span>
                                {user.learner_code && (
                                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                                        {t("school.learnerCode")}: <span className="font-mono font-black">{user.learner_code}</span>
                                    </span>
                                )}
                                {isInactive && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase">
                                        {t("admin.user.inactive")}
                                    </span>
                                )}
                            </>
                        }
                        actions={
                            <button
                                type="button"
                                onClick={downloadData}
                                disabled={downloading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                            >
                                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                {downloading ? t("admin.user.preparing") : t("admin.user.downloadData")}
                            </button>
                        }
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Demographics & Contact */}
                <div className="lg:col-span-1 space-y-8 min-w-0">
                    <Section title={<span className="flex items-center gap-2"><User className="w-4 h-4 text-teal-600" /> {t("admin.user.personal")}</span>}>
                        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                            <Field label={t("admin.user.phone")} icon={Phone}>{user.phone || notSpecified}</Field>
                            <Field label={t("admin.user.gender")} className="capitalize">
                                {user.gender && user.gender !== "prefer_not_to_say" ? (GENDERS.includes(user.gender) ? t(`admin.user.genders.${user.gender}`) : user.gender.replace("_", " ")) : notSpecified}
                            </Field>
                            <Field label={t("admin.user.preferredLanguage")} icon={Globe2}>
                                {user.preferred_language ? (LANGUAGE_NAMES[user.preferred_language] || user.preferred_language.toUpperCase()) : LANGUAGE_NAMES.en}
                            </Field>
                        </dl>
                    </Section>

                    <Section divided title={<span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-teal-600" /> {t("admin.user.academic")}</span>}>
                        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                            <Field label={t("admin.user.school")} icon={Building2}>{user.school_name || t("admin.user.notAssigned")}</Field>
                            <Field label={t("admin.user.gradeLevel")}>{user.grade_level || notSpecified}</Field>
                            <Field label={t("admin.user.provinceDistrict")} icon={MapPin}>
                                {user.region_province || t("admin.user.na")}, {user.region_district || t("admin.user.na")}
                            </Field>
                            <Field label={t("admin.user.locationType")}>{user.is_rural === 1 ? t("admin.user.rural") : t("admin.user.urban")}</Field>
                            <Field label={t("admin.user.disability")} className="capitalize">{user.disability_status || t("admin.user.none")}</Field>
                            <Field label={t("admin.user.joined")} icon={Calendar}>{joined}</Field>
                        </dl>
                    </Section>
                </div>

                {/* Right Column: Classes, Analytics */}
                <div className="lg:col-span-2 space-y-8 min-w-0">
                    {user.role === "scholar" && (
                        <>
                            {/* Outcome pulse tile (allowed card) */}
                            <div className="bg-gradient-to-br from-teal-900 to-slate-900 rounded-2xl border border-teal-800/40 p-5 text-white relative overflow-hidden">
                                <BrainCircuit className="absolute -right-4 -bottom-4 w-24 h-24 text-teal-800/30 opacity-50" />
                                <h3 className="text-xs font-black uppercase tracking-wider text-teal-400 flex items-center gap-2 relative z-10">
                                    <Activity className="w-4 h-4" /> {t("admin.user.practiceActivity")}
                                </h3>
                                <div className="relative z-10 mt-3">
                                    <p className="text-3xl font-black">{analytics?.activeTrackedOutcomes ?? "—"}</p>
                                    <p className="text-xs font-medium text-teal-200/70 mt-1">{t("admin.user.practiceTypes")}</p>
                                    <PracticeLabel className="mt-2 text-teal-100 border-teal-700 bg-teal-950/40" />
                                </div>
                            </div>

                            <Section title={t("admin.user.spacedStatus")} description={<PracticeLabel />}>
                                {spacedPractice?.length > 0 ? (
                                    <List label={t("admin.user.pendingReviews")}>
                                        {spacedPractice.map((sp, idx) => (
                                            <ListRow
                                                key={idx}
                                                title={sp.topic_title}
                                                subtitle={fill(t("admin.user.interval"), { days: sp.interval_days })}
                                                actions={
                                                    <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase">
                                                        {t("admin.user.pending")}
                                                    </span>
                                                }
                                            />
                                        ))}
                                    </List>
                                ) : (
                                    <EmptyState
                                        icon={<CheckCircle2 className="w-8 h-8" />}
                                        title={t("admin.user.caughtUp")}
                                        description={t("admin.user.noPending")}
                                    />
                                )}
                            </Section>

                            {/* Enrolled Classes */}
                            <Section title={t("admin.user.enrolled")} divided>
                                {classes.length > 0 ? (
                                    <DataTable caption={t("admin.user.enrolled")} columns={courseColumns} rows={classes} />
                                ) : (
                                    <EmptyState
                                        icon={<Building2 className="w-10 h-10" />}
                                        title={t("admin.user.notEnrolled")}
                                        description={t("admin.user.notEnrolledHelp")}
                                    />
                                )}
                            </Section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
