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

function getInitials(name, email) {
    if (name?.trim()) return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (email?.[0] || "?").toUpperCase();
}

function formatDate(raw) {
    if (!raw) return "Not specified";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "Not specified";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function UserProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { SERVER_URL, isDark } = useContext(DataContext);
    const { t } = useLanguage();
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
                if (!userRes.ok) throw new Error("Failed to fetch user details");
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
    }, [userId, SERVER_URL]);

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
                <p className="text-rose-500 font-bold mb-4">{error || "User not found"}</p>
                <button onClick={() => router.push("/manage/admin")} className="px-4 py-2 bg-slate-200 rounded-lg text-sm font-semibold">
                    Go Back
                </button>
            </div>
        );
    }

    const downloadData = async () => {
        setDownloading(true);
        try {
            const safe = String(user.email || `user-${userId}`).replace(/[^a-z0-9]+/gi, "-");
            await downloadFile(`${SERVER_URL}/analytics/users/${encodeURIComponent(userId)}/data`, `somabox-data-${safe}.json`);
            showToast("Data downloaded", "success");
        } catch (err) {
            showToast(err.message || "Download failed", "error");
        } finally {
            setDownloading(false);
        }
    };

    const isInactive = user.is_active === 0;
    const initials = getInitials(user.full_name, user.email);
    const joined = formatDate(user.created_at);

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
            header: "Course",
            render: (course) => (
                <div className="min-w-0">
                    <Link href={`/course/${course.id}/home`} className="font-semibold text-slate-900 dark:text-white hover:text-[#0D9488] hover:underline">
                        {course.title}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{course.description || "No description"}</p>
                </div>
            ),
        },
        {
            key: "teacher",
            header: "Teacher",
            hideOnMobile: true,
            render: (course) => <span className="text-xs text-slate-600 dark:text-slate-300">{course.created_by_teacher_email || "—"}</span>,
        },
        {
            key: "grade",
            header: "Grade",
            render: (course) => course.grade
                ? <span className="text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full whitespace-nowrap">{course.grade}</span>
                : <span className="text-xs text-slate-400">—</span>,
        },
        {
            key: "open",
            header: <span className="sr-only">Open</span>,
            align: "right",
            render: (course) => (
                <Link href={`/course/${course.id}/home`} className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap">
                    Open
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
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Users
            </button>

            {/* Header */}
            <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center text-white text-xl font-black shrink-0">
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <PageHeader
                        title={user.full_name || "Unnamed User"}
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
                                        Inactive
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
                                {downloading ? "Preparing…" : "Download this person's data"}
                            </button>
                        }
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Demographics & Contact */}
                <div className="lg:col-span-1 space-y-8 min-w-0">
                    <Section title={<span className="flex items-center gap-2"><User className="w-4 h-4 text-teal-600" /> Personal & Contact Info</span>}>
                        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                            <Field label="Phone Number" icon={Phone}>{user.phone || "Not specified"}</Field>
                            <Field label="Gender Identity" className="capitalize">
                                {user.gender && user.gender !== "prefer_not_to_say" ? user.gender.replace("_", " ") : "Not specified"}
                            </Field>
                            <Field label="Preferred Language" icon={Globe2}>
                                {user.preferred_language ? user.preferred_language.toUpperCase() : "English"}
                            </Field>
                        </dl>
                    </Section>

                    <Section divided title={<span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-teal-600" /> Academic & Location</span>}>
                        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                            <Field label="School / Institution" icon={Building2}>{user.school_name || "Not assigned"}</Field>
                            <Field label="Grade / Class Level">{user.grade_level || "Not specified"}</Field>
                            <Field label="Province & District" icon={MapPin}>
                                {user.region_province || "N/A"}, {user.region_district || "N/A"}
                            </Field>
                            <Field label="Location Type">{user.is_rural === 1 ? "Rural Learner" : "Urban / Semi-urban"}</Field>
                            <Field label="Disability Status" className="capitalize">{user.disability_status || "None"}</Field>
                            <Field label="Date Joined" icon={Calendar}>{joined}</Field>
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
                                    <Activity className="w-4 h-4" /> Practice activity
                                </h3>
                                <div className="relative z-10 mt-3">
                                    <p className="text-3xl font-black">{analytics?.activeTrackedOutcomes ?? "—"}</p>
                                    <p className="text-xs font-medium text-teal-200/70 mt-1">Learning-science practice types used</p>
                                    <PracticeLabel className="mt-2 text-teal-100 border-teal-700 bg-teal-950/40" />
                                </div>
                            </div>

                            <Section title="Spaced Practice Status" description={<PracticeLabel />}>
                                {spacedPractice?.length > 0 ? (
                                    <List label="Pending spaced practice reviews">
                                        {spacedPractice.map((sp, idx) => (
                                            <ListRow
                                                key={idx}
                                                title={sp.topic_title}
                                                subtitle={`Interval: ${sp.interval_days} days`}
                                                actions={
                                                    <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase">
                                                        Pending
                                                    </span>
                                                }
                                            />
                                        ))}
                                    </List>
                                ) : (
                                    <EmptyState
                                        icon={<CheckCircle2 className="w-8 h-8" />}
                                        title="All Caught Up!"
                                        description="No pending spaced practice reviews."
                                    />
                                )}
                            </Section>

                            {/* Enrolled Classes */}
                            <Section title="Enrolled Courses" divided>
                                {classes.length > 0 ? (
                                    <DataTable caption="Enrolled courses" columns={courseColumns} rows={classes} />
                                ) : (
                                    <EmptyState
                                        icon={<Building2 className="w-10 h-10" />}
                                        title="Not enrolled in any courses"
                                        description="This student has not joined any active courses yet."
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
