"use client"
import Unauthorized from "@/components/sections/Unauthorized";
import { useContext, useMemo, useState } from "react";
import DataContext from "@/context/DataContext";
import { useLanguage } from '@/context/LanguageContext';
import { AddUserDrawer } from "@/components/AddUserDrawer";
import { Button } from "@/components/ui/button";
import Users from "./comps/Users";
import AllCourses from "./comps/AllCourses";
import { BarChart3, ChevronRight, LayoutDashboard, Library, Megaphone, Palette, Plus, RefreshCcw, School, Sparkles } from "lucide-react";
import { useSchool } from "@/context/SchoolContext";
import { FOCUS_RING } from "@/lib/a11y";
import { PageHeader, Section, List, ListRow } from "@/components/layout";
import SendNotificationModal from "@/components/notifications/SendNotificationModal";
import InclusivityGapReport from "@/components/analytics/InclusivityGapReport";
import GrowthCurvesChart from "@/components/analytics/GrowthCurvesChart";
import Link from "next/link";

const AdminPortal = () => {
    const { t } = useLanguage();
    const { authenticated, role, SERVER_URL } = useContext(DataContext);
    const userRole = role;
    const { school, loaded: schoolLoaded } = useSchool();

    const [sendNotifModal, setSendNotifModal] = useState(false);

    const options = useMemo(() => [
        {
            title: t("AdminManageOptions.syncTitle"),
            subtitle: t("AdminManageOptions.syncSubtitle"),
            href: "/manage/admin/sync",
            icon: RefreshCcw,
            allowedRoles: ['admin'],
        },
        {
            title: t("admin.home.analyticsTitle"),
            subtitle: t("admin.home.analyticsSubtitle"),
            href: "/manage/admin/analytics",
            icon: BarChart3,
            allowedRoles: ['admin'],
        },
        {
            title: t("AdminManageOptions.contentTitle"),
            subtitle: t("AdminManageOptions.contentSubtitle"),
            href: "/manage/admin/manage-content",
            icon: LayoutDashboard,
            allowedRoles: ['admin', 'teacher'],
        },
        {
            title: t("admin.home.libraryTitle"),
            subtitle: t("admin.home.librarySubtitle"),
            href: "/manage/admin/library",
            icon: Library,
            allowedRoles: ['admin'],
        },
        {
            title: t("admin.home.aiTitle"),
            subtitle: t("admin.home.aiSubtitle"),
            href: "/manage/admin/ai",
            icon: Sparkles,
            allowedRoles: ['admin'],
        },
        {
            title: t("school.settings.navTitle"),
            // One School page: name, code, location, logo, colours and visitor previews.
            subtitle: t("school.settings.navSubtitle"),
            href: "/manage/admin/school",
            icon: School,
            allowedRoles: ['admin'],
        },
    ].filter(o => o.allowedRoles.includes(userRole)), [t, userRole]);

    if (!authenticated) return <Unauthorized />;

    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <SendNotificationModal isOpen={sendNotifModal} onClose={() => setSendNotifModal(false)} />

            <div className="px-4 pt-4 flex flex-col gap-8">
                <PageHeader
                    eyebrow={t("admin.home.eyebrow")}
                    title={t("admin.home.title")}
                    description={t("admin.home.description")}
                    actions={
                        <button
                            onClick={() => setSendNotifModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] text-white text-xs font-bold transition-colors"
                        >
                            <Megaphone size={13} />
                            <span className="hidden sm:inline">{t("admin.home.broadcast")}</span>
                        </button>
                    }
                />

                {/* Until the admin names the school, ask them to set it up (name, logo, colours, location). */}
                {userRole === 'admin' && schoolLoaded && !school.configured && (
                    <Link
                        href="/manage/admin/school"
                        className={`flex items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors ${FOCUS_RING}`}
                    >
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-white/70 dark:bg-white/10 flex items-center justify-center" aria-hidden="true">
                            <Palette className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold">{t("school.banner.title")}</span>
                            <span className="block text-xs mt-0.5">{t("school.banner.body")}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                    </Link>
                )}

                {/* Quick Actions */}
                <Section title={t("admin.home.quickActions")}>
                    <List label={t("admin.home.adminTools")}>
                        {options.map((option) => {
                            const Icon = option.icon;
                            return (
                                <ListRow
                                    key={option.href}
                                    icon={Icon ? <Icon size={16} /> : null}
                                    title={option.title}
                                    href={option.href}
                                    subtitle={option.subtitle}
                                    actions={<ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />}
                                />
                            );
                        })}
                    </List>
                </Section>

                {/* Accessibility & Analytics M&E Section (Admin Only) */}
                {userRole === 'admin' && (
                    <Section
                        title={t("admin.home.analyticsSection")}
                        description={t("admin.home.adminReserved")}
                        divided
                        actions={
                            <Link
                                href="/manage/admin/analytics"
                                className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline"
                            >
                                {t("admin.home.openAnalytics")}
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                        }
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                            <InclusivityGapReport serverUrl={SERVER_URL} />
                            <GrowthCurvesChart serverUrl={SERVER_URL} />
                        </div>
                    </Section>
                )}

                {/* Courses on this box */}
                {userRole === 'admin' && (
                    <Section title={t("admin.home.coursesTitle")} description={t("admin.home.coursesDescription")} divided>
                        <AllCourses serverUrl={SERVER_URL} />
                    </Section>
                )}

                {/* Users Management */}
                {userRole === 'admin' && (
                    <Section
                        title={t("AdminTable.tableTitle")}
                        description={t("admin.home.usersDescription")}
                        divided
                        actions={
                            <AddUserDrawer
                                trigger={
                                    <Button className="h-8 px-4 gap-1.5 text-[12px] rounded-[5px]">
                                        <Plus className="w-3.5 h-3.5" />
                                        {t("AdminTable.tableButton")}
                                    </Button>
                                }
                            />
                        }
                    >
                        <Users />
                    </Section>
                )}
            </div>
        </div>
    );
};

export default AdminPortal;
