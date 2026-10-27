"use client";

import { useState, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useUser } from "@/lib/queries/users";
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
import { startRouteLoading } from "@/components/global/RouteLoader";
import Loader from "@/components/ui/Loader";
import { shownEmail } from "@/lib/session";
import { accessLabel, genderLabel } from "@/lib/profileOptions";

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


export default function UserProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { SERVER_URL } = useContext(DataContext);
    const { t, lang } = useLanguage();
    const { showToast } = useToast();
    const [downloading, setDownloading] = useState(false);
    
    const userId = params.userId;

    // The account, and for a learner their courses, outcomes and pending practice.
    const account = useUser(userId);
    const user = account.data || null;
    const learnerEmail = user?.role === "scholar" ? encodeURIComponent(user.email) : null;
    const about = (part, path) => ({
        queryKey: [...queryKeys.user(userId), part],
        queryFn: () => apiFetch(path).catch(() => null),
        enabled: !!learnerEmail,
    });
    const classesQuery = useQuery(about("courses", `/courses/mine?userEmail=${learnerEmail}`));
    const analyticsQuery = useQuery(about("outcomes", `/analytics/sol-outcomes?scholarEmail=${learnerEmail}`));
    const spacedQuery = useQuery(about("spaced", `/sol/spaced/pending?scholarEmail=${learnerEmail}`));
    const classes = Array.isArray(classesQuery.data) ? classesQuery.data : [];
    const analytics = analyticsQuery.data || null;
    // The endpoint returns an array of pending reviews.
    const spacedPractice = spacedQuery.data ? (Array.isArray(spacedQuery.data) ? spacedQuery.data : spacedQuery.data.pendingReviews || []) : null;
    const loading = account.isPending;
    const error = account.isError ? t("admin.user.fetchFailed") : null;

    if (loading) {
        return (
            <Loader variant="page" className="min-h-[50vh]" />
        );
    }

    if (error || !user) {
        return (
            <div className="text-center py-12">
                <p className="text-danger-fg font-bold mb-4">{error || t("admin.user.notFound")}</p>
                <button onClick={() => { startRouteLoading(); router.push("/manage/admin"); }} className="px-4 py-2 bg-line rounded-lg text-ui font-semibold">
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
        admin: { bg: "bg-info-soft", text: "text-info-fg", border: "border-info/30" },
        teacher: { bg: "bg-success-soft", text: "text-success-fg", border: "border-success/30" },
        scholar: { bg: "bg-info-soft", text: "text-info-fg", border: "border-info/30" },
    };
    const roleStyle = roleColors[user.role] || roleColors.scholar;

    const Field = ({ label, icon: Icon, children, className = "" }) => (
        <div className="py-2.5 flex items-start justify-between gap-4">
            <dt className="text-caption font-semibold text-fg-subtle">{label}</dt>
            <dd className={`text-ui font-semibold text-fg text-right flex items-center gap-1.5 min-w-0 ${className}`}>
                {Icon ? <Icon className="w-3.5 h-3.5 text-fg-subtle shrink-0" /> : null}
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
                    <Link href={`/course/${course.id}/home`} className="font-semibold text-fg hover:text-brand-fg hover:underline">
                        {course.title}
                    </Link>
                    <p className="text-caption text-fg-subtle mt-0.5 line-clamp-1">{course.description || t("admin.user.noDescription")}</p>
                </div>
            ),
        },
        {
            key: "teacher",
            header: t("admin.courses.colTeacher"),
            hideOnMobile: true,
            render: (course) => <span className="text-caption text-fg-muted">{course.created_by_teacher_email || "—"}</span>,
        },
        {
            key: "grade",
            header: t("admin.user.colGrade"),
            render: (course) => course.grade
                ? <span className="text-caption font-semibold bg-surface-sunken text-fg-muted px-2 py-0.5 rounded-full whitespace-nowrap">{course.grade}</span>
                : <span className="text-caption text-fg-subtle">—</span>,
        },
        {
            key: "open",
            header: <span className="sr-only">{t("admin.library.open")}</span>,
            align: "right",
            render: (course) => (
                <Link href={`/course/${course.id}/home`} className="text-caption font-bold text-brand-fg hover:underline whitespace-nowrap">
                    {t("admin.library.open")}
                </Link>
            ),
        },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12 animate-in fade-in duration-300 pt-4 px-4 sm:px-6">
            <button
                onClick={() => { startRouteLoading(); router.push("/manage/admin?tab=users"); }}
                className="inline-flex items-center gap-1.5 text-caption font-semibold text-fg-subtle hover:text-fg transition-colors"
            >
                <ArrowLeft className="w-3.5 h-3.5" /> {t("admin.user.backToUsers")}
            </button>

            {/* Header */}
            <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-brand flex items-center justify-center text-on-brand text-section font-extrabold shrink-0">
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <PageHeader
                        title={user.full_name || t("admin.user.unnamed")}
                        description={
                            <span className="inline-flex items-center gap-1.5 break-all">
                                <Mail className="w-3.5 h-3.5 text-brand-fg shrink-0" />
                                {shownEmail(user)}
                            </span>
                        }
                        meta={
                            <>
                                <span className={`px-2.5 py-0.5 rounded-full text-caption font-extrabold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
                                    {t(`role.${user.role}`) || user.role}
                                </span>
                                {user.learner_code && (
                                    <span className="px-2.5 py-0.5 rounded-full text-caption font-bold border border-line text-fg-muted">
                                        {t("school.learnerCode")}: <span className="font-mono font-extrabold">{user.learner_code}</span>
                                    </span>
                                )}
                                {isInactive && (
                                    <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-surface-sunken text-fg-subtle">
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
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-caption font-bold text-fg-muted hover:bg-surface-hover disabled:opacity-50"
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
                    <Section title={<span className="flex items-center gap-2"><User className="w-4 h-4 text-brand-fg" /> {t("admin.user.personal")}</span>}>
                        <dl className="divide-y divide-line">
                            <Field label={t("admin.user.phone")} icon={Phone}>{user.phone || notSpecified}</Field>
                            <Field label={t("admin.user.gender")} className="capitalize">
                                {genderLabel(t, user.gender)}
                            </Field>
                            <Field label={t("admin.user.preferredLanguage")} icon={Globe2}>
                                {user.preferred_language ? (LANGUAGE_NAMES[user.preferred_language] || user.preferred_language.toUpperCase()) : LANGUAGE_NAMES.en}
                            </Field>
                        </dl>
                    </Section>

                    <Section divided title={<span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-brand-fg" /> {t("admin.user.academic")}</span>}>
                        <dl className="divide-y divide-line">
                            <Field label={t("admin.user.school")} icon={Building2}>{user.school_name || t("admin.user.notAssigned")}</Field>
                            <Field label={t("admin.user.gradeLevel")}>{user.grade_level || notSpecified}</Field>
                            <Field label={t("admin.user.provinceDistrict")} icon={MapPin}>
                                {user.region_province || t("admin.user.na")}, {user.region_district || t("admin.user.na")}
                            </Field>
                            <Field label={t("admin.user.locationType")}>{user.is_rural === 1 ? t("admin.user.rural") : t("admin.user.urban")}</Field>
                            <Field label={t("admin.user.disability")}>{accessLabel(t, user.disability_status)}</Field>
                            <Field label={t("admin.user.joined")} icon={Calendar}>{joined}</Field>
                        </dl>
                    </Section>
                </div>

                {/* Right Column: Classes, Analytics */}
                <div className="lg:col-span-2 space-y-8 min-w-0">
                    {user.role === "scholar" && (
                        <>
                            {/* Outcome pulse tile (allowed card) */}
                            <div className="dark bg-gradient-to-br from-brand-strong to-surface rounded-2xl border border-brand/40 p-5 text-fg relative overflow-hidden">
                                <BrainCircuit className="absolute -right-4 -bottom-4 w-24 h-24 text-brand-fg/30 opacity-50" />
                                <h3 className="text-caption font-extrabold text-brand-fg flex items-center gap-2 relative z-10">
                                    <Activity className="w-4 h-4" /> {t("admin.user.practiceActivity")}
                                </h3>
                                <div className="relative z-10 mt-3">
                                    <p className="text-display font-extrabold">{analytics?.activeTrackedOutcomes ?? "—"}</p>
                                    <p className="text-caption font-medium text-fg-muted mt-1">{t("admin.user.practiceTypes")}</p>
                                    <PracticeLabel className="mt-2 text-brand-fg border-brand bg-brand-strong/40" />
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
                                                    <span className="px-2 py-1 bg-warning-soft text-warning-fg rounded-lg text-caption font-extrabold">
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
