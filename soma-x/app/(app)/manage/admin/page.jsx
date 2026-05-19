"use client"
import AdminOption from "../AdminOption";
import Unauthorized from "@/components/sections/Unauthorized";
import { useContext, useEffect, useMemo, useState } from "react";
import DataContext from "@/context/DataContext";
import { useLanguage } from '@/context/LanguageContext';
import { AddUserDrawer } from "@/components/AddUserDrawer";
import { Button } from "@/components/ui/button";
import Users from "./comps/Users";
import { Bell, LayoutDashboard, Library, Plus, RefreshCcw, Search, Users as UsersIcon } from "lucide-react";

const AdminPortal = () => {
    const { t } = useLanguage();
    const { authenticated, role, unshiftString, isDark } = useContext(DataContext);
    const userRole = unshiftString(role);
    const dm = isDark;

    const ACCENT          = dm ? "#0D9488"                   : "#203B3B";
    const topBarBg        = dm ? "#080B0F"                   : "#ffffff";
    const topBarBorder    = dm ? "rgba(255,255,255,0.07)"    : "#f1f5f9";
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
    ].filter(o => o.allowedRoles.includes(userRole)), [t, userRole]);

    if (!authenticated) return <Unauthorized />;

    return (
        <div className="min-h-screen pb-24 md:pb-8">

            {/* ── Top bar ── */}
            <div
                className="flex items-center justify-between pl-12 pr-4 md:px-4 py-3 sticky top-0 z-10 rounded-b-[5px]"
                style={{ backgroundColor: topBarBg, borderBottom: `1px solid ${topBarBorder}` }}
            >
                <div className="min-w-0">
                    <h1 className="text-[16px] sm:text-[18px] md:text-[20px] font-black leading-tight tracking-tight"
                        style={{ color: titleColor }}>
                        Admin Portal
                    </h1>
                    <p className="text-[11px] mt-0.5 hidden sm:block" style={{ color: subtitleColor }}>
                        Manage system tools, users, and content.
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {[Search, Bell].map((Icon, i) => (
                        <IconBtn key={i} Icon={Icon} color={iconBtnColor} hoverBg={iconBtnHover} />
                    ))}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ml-0.5"
                        style={{ backgroundColor: ACCENT }}>
                        <span className="text-[11px] font-black text-white tracking-wide">{initials}</span>
                    </div>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="px-4 flex flex-col gap-5 mt-4">

                {/* Quick Actions */}
                <div>
                    <p className="text-[9.5px] font-bold uppercase tracking-widest mb-3 px-0.5"
                        style={{ color: sectionLabel }}>
                        Quick Actions
                    </p>
                    <div className="grid gap-2.5"
                        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
                        {options.map((option, i) => <AdminOption key={i} {...option} />)}
                    </div>
                </div>

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
