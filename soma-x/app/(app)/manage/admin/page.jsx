"use client"
import AdminOption from "../AdminOption";
import Unauthorized from "@/components/sections/Unauthorized";
import { useContext, useEffect, useMemo, useState } from "react";
import DataContext from "@/context/DataContext";
import { useLanguage } from '@/context/LanguageContext';
import { AddUserDrawer } from "@/components/AddUserDrawer";
import { Button } from "@/components/ui/button";
import Users from "./comps/Users";
import { BarChart3, ChevronRight, LayoutDashboard, Library, Megaphone, Palette, Plus, RefreshCcw, Search, Sparkles, Users as UsersIcon } from "lucide-react";
import SendNotificationModal from "@/components/notifications/SendNotificationModal";
import InclusivityGapReport from "@/components/analytics/InclusivityGapReport";
import GrowthCurvesChart from "@/components/analytics/GrowthCurvesChart";
import Link from "next/link";

const AdminPortal = () => {
    const { t } = useLanguage();
    const { authenticated, role, unshiftString, isDark, SERVER_URL } = useContext(DataContext);
    const userRole = unshiftString(role);
    const dm = isDark;

    const ACCENT          = dm ? "#0D9488"                   : "#203B3B";
    const titleColor      = dm ? "#E8ECF0"                   : "#0f172a";
    const subtitleColor   = dm ? "#637080"                   : "#94a3b8";
    const iconBtnColor    = dm ? "#637080"                   : "#94a3b8";
    const iconBtnHover    = dm ? "rgba(255,255,255,0.05)"    : "#f1f5f9";
    const sectionLabel    = dm ? "#556272"                   : "#94a3b8";
    const cardBg          = dm ? "rgba(255,255,255,0.03)"    : "#ffffff";
    const cardBorder      = dm ? "rgba(255,255,255,0.07)"    : "#f1f5f9";
    const cardHeaderBorder= dm ? "rgba(255,255,255,0.06)"    : "#f1f5f9";
    const sectionIconBg   = dm ? "rgba(56,189,248,0.1)"      : "#eff6ff";
    const sectionIconColor= dm ? "#7dd3fc"                   : "#2563eb";

    const [initials, setInitials] = useState("A");
    const [sendNotifModal, setSendNotifModal] = useState(false);

    useEffect(() => {
        const name = unshiftString(localStorage.getItem("un") || "");
        if (name) setInitials(name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase());
    }, [unshiftString]);

    const options = useMemo(() => [
        {
            title: t("AdminManageOptions.syncTitle"),
            subtitle: t("AdminManageOptions.syncSubtitle"),
            href: "/manage/admin/sync",
            icon: RefreshCcw,
            allowedRoles: ['admin'],
        },
        {
            title: "Accessibility & Analytics",
            subtitle: "Inclusivity M&E, equity gaps & growth curves",
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
            title: "Manage Library",
            subtitle: "Download and manage books from the cloud",
            href: "/manage/admin/library",
            icon: Library,
            allowedRoles: ['admin'],
        },
        {
            title: "Unit Branding",
            subtitle: "Partner school logo & M&E settings",
            href: "/manage/admin/branding",
            icon: Palette,
            allowedRoles: ['admin'],
        },
    ].filter(o => o.allowedRoles.includes(userRole)), [t, userRole]);

    if (!authenticated) return <Unauthorized />;

    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <SendNotificationModal isOpen={sendNotifModal} onClose={() => setSendNotifModal(false)} />

            {/* ── Page-specific header action (shared header now lives in the app shell layout) ── */}
            <div className="flex items-center justify-end pt-3 px-4">
                <button
                    onClick={() => setSendNotifModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md transition-colors"
                >
                    <Megaphone size={13} />
                    <span className="hidden sm:inline">Broadcast Notification</span>
                </button>
            </div>

            {/* ── Content ── */}
            <div className="px-4 flex flex-col gap-6 mt-4">

                {/* Quick Actions */}
                <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-widest mb-3 px-0.5"
                        style={{ color: sectionLabel }}>
                        Quick Actions
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                        {options.map((option, i) => <AdminOption key={i} {...option} />)}
                    </div>
                </div>

                {/* Accessibility & Analytics M&E Section (Admin Only) */}
                {userRole === 'admin' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-0.5">
                            <div className="flex items-center gap-2">
                                <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: sectionLabel }}>
                                    Accessibility, Inclusivity & Growth Analytics
                                </p>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                                    Admin Reserved
                                </span>
                            </div>
                            <Link
                                href="/manage/admin/analytics"
                                className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline"
                            >
                                Open Full Analytics Hub
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <InclusivityGapReport serverUrl={SERVER_URL} />
                            <GrowthCurvesChart serverUrl={SERVER_URL} />
                        </div>
                    </div>
                )}

                {/* Users Management */}
                {userRole === 'admin' && (
                    <div className="rounded-[5px]"
                        style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>

                        {/* Section header */}
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 py-3"
                            style={{ borderBottom: `1px solid ${cardHeaderBorder}` }}>
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-[5px] flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: sectionIconBg }}>
                                    <UsersIcon className="w-[13px] h-[13px]" style={{ color: sectionIconColor }} />
                                </div>
                                <div>
                                    <p className="text-[13px] font-bold" style={{ color: titleColor }}>
                                        {t("AdminTable.tableTitle")}
                                    </p>
                                    <p className="text-[10px]" style={{ color: subtitleColor }}>Manage roles and credentials</p>
                                </div>
                            </div>
                            <AddUserDrawer
                                trigger={
                                    <Button className="h-8 px-4 gap-1.5 text-[12px] rounded-[5px]">
                                        <Plus className="w-3.5 h-3.5" />
                                        {t("AdminTable.tableButton")}
                                    </Button>
                                }
                            />
                        </div>

                        <Users />
                    </div>
                )}
            </div>
        </div>
    );
};

function IconBtn({ Icon, color, hoverBg }) {
    const [hov, setHov] = useState(false);
    return (
        <button type="button"
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ color, backgroundColor: hov ? hoverBg : "transparent" }}
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
            <Icon className="w-[15px] h-[15px]" />
        </button>
    );
}

export default AdminPortal;
