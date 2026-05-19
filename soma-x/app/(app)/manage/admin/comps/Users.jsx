"use client";
import { AddUserDrawer } from "@/components/AddUserDrawer";
import { useLanguage } from "@/context/LanguageContext";
import DataContext from "@/context/DataContext";
import { useContext, useEffect, useState } from "react";
import { GraduationCap, Phone, School, ShieldCheck, User, Users2 } from "lucide-react";

function getInitials(name, email) {
    if (name?.trim()) return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (email?.[0] || "?").toUpperCase();
}

function formatDate(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const Users = () => {
    const { t } = useLanguage();
    const { isDark } = useContext(DataContext);
    const dm = isDark;

    const [users, setUsers]     = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/users`, {
                headers: { "Content-Type": "application/json" },
            });
            setUsers(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    /* ── Design tokens ── */
    const avatarBg      = dm ? "#0D9488"                     : "#203B3B";
    const theadBg       = dm ? "rgba(255,255,255,0.03)"      : "#f8fafc";
    const thColor       = dm ? "#556272"                     : "#94a3b8";
    const rowHover      = dm ? "rgba(255,255,255,0.03)"      : "#f8fafc";
    const rowDivider    = dm ? "rgba(255,255,255,0.05)"      : "#f1f5f9";
    const textPrimary   = dm ? "#D1D9E0"                     : "#1e293b";
    const textSecondary = dm ? "#8A95A5"                     : "#94a3b8";
    const textMuted     = dm ? "#637080"                     : "#94a3b8";
    const detailIcon    = dm ? "#4A5567"                     : "#cbd5e1";
    const noNameColor   = dm ? "#4A5567"                     : "#94a3b8";
    const manageBtn     = dm
        ? { bg: "rgba(255,255,255,0.07)", text: "#8A95A5", hoverBg: "rgba(13,148,136,0.2)", hoverText: "#0D9488" }
        : { bg: "#f1f5f9",               text: "#475569",  hoverBg: "#203B3B",               hoverText: "#fff" };

    const roleDark = {
        admin:   { bg: "rgba(168,85,247,0.15)",  text: "#c084fc",  border: "rgba(168,85,247,0.25)" },
        teacher: { bg: "rgba(52,211,153,0.12)",  text: "#6ee7b7",  border: "rgba(52,211,153,0.2)"  },
        scholar: { bg: "rgba(56,189,248,0.12)",  text: "#7dd3fc",  border: "rgba(56,189,248,0.2)"  },
    };
    const roleLight = {
        admin:   { bg: "#f3e8ff", text: "#9333ea", border: "transparent" },
        teacher: { bg: "#d1fae5", text: "#059669", border: "transparent" },
        scholar: { bg: "#e0f2fe", text: "#0284c7", border: "transparent" },
    };
    const roleIcons = { admin: ShieldCheck, teacher: User, scholar: GraduationCap };

    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                    <tr style={{ backgroundColor: theadBg }}>
                        {["User","Details","Role","Joined", t("AdminTable.TableManage")].map(h => (
                            <th key={h} className="py-3 px-4 text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: thColor }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        [...Array(4)].map((_, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${rowDivider}` }}>
                                <td className="py-3.5 px-4" colSpan={5}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full animate-pulse shrink-0"
                                            style={{ backgroundColor: dm ? "rgba(255,255,255,0.06)" : "#e2e8f0" }} />
                                        <div className="space-y-1.5 flex-1">
                                            <div className="h-2.5 rounded animate-pulse w-32"
                                                style={{ backgroundColor: dm ? "rgba(255,255,255,0.06)" : "#e2e8f0" }} />
                                            <div className="h-2 rounded animate-pulse w-44"
                                                style={{ backgroundColor: dm ? "rgba(255,255,255,0.04)" : "#f1f5f9" }} />
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))
                    ) : users.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="py-12 text-center">
                                <div className="flex flex-col items-center gap-2">
                                    <Users2 className="w-8 h-8" style={{ color: dm ? "#2D3748" : "#e2e8f0" }} />
                                    <p className="text-[12px] font-semibold" style={{ color: textSecondary }}>No users found</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        users.map((user, index) => {
                            const roleCfg  = (dm ? roleDark : roleLight)[user.role] || (dm ? roleDark : roleLight).teacher;
                            const RoleIcon = roleIcons[user.role] || User;
                            const initials = getInitials(user.full_name, user.email);
                            const joined   = formatDate(user.created_at);

                            return (
                                <UserRow key={user.id || index}
                                    user={user} initials={initials} joined={joined}
                                    roleCfg={roleCfg} RoleIcon={RoleIcon}
                                    dm={dm} avatarBg={avatarBg} textPrimary={textPrimary}
                                    textSecondary={textSecondary} textMuted={textMuted}
                                    detailIcon={detailIcon} noNameColor={noNameColor}
                                    manageBtn={manageBtn} rowHover={rowHover} rowDivider={rowDivider}
                                    onSuccess={fetchUsers} t={t}
                                />
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
};

function UserRow({ user, initials, joined, roleCfg, RoleIcon, dm, avatarBg, textPrimary,
    textSecondary, textMuted, detailIcon, noNameColor, manageBtn, rowHover, rowDivider, onSuccess, t }) {
    const [hovered, setHovered]   = useState(false);
    const [btnHover, setBtnHover] = useState(false);

    return (
        <tr
            style={{
                borderTop: `1px solid ${rowDivider}`,
                backgroundColor: hovered ? rowHover : "transparent",
                transition: "background-color 150ms",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* User */}
            <td className="py-3 px-4">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-black"
                        style={{ backgroundColor: avatarBg }}>
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: user.full_name ? textPrimary : noNameColor }}>
                            {user.full_name || <em>No name</em>}
                        </p>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: textSecondary }}>{user.email}</p>
                    </div>
                </div>
            </td>

            {/* Details */}
            <td className="py-3 px-4">
                <div className="space-y-0.5">
                    {user.phone && (
                        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: textSecondary }}>
                            <Phone className="w-3 h-3 shrink-0" style={{ color: detailIcon }} />
                            {user.phone}
                        </div>
                    )}
                    {user.school_name && (
                        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: textSecondary }}>
                            <School className="w-3 h-3 shrink-0" style={{ color: detailIcon }} />
                            <span className="truncate max-w-[140px]">{user.school_name}</span>
                        </div>
                    )}
                    {user.grade_level && (
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: dm ? "rgba(255,255,255,0.07)" : "#f1f5f9", color: textSecondary }}>
                            {user.grade_level}
                        </span>
                    )}
                    {!user.phone && !user.school_name && !user.grade_level && (
                        <span style={{ color: textMuted }} className="text-[11px]">—</span>
                    )}
                </div>
            </td>

            {/* Role */}
            <td className="py-3 px-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: roleCfg.bg, color: roleCfg.text, border: `1px solid ${roleCfg.border}` }}>
                    <RoleIcon className="w-3 h-3" />
                    {t(`role.${user.role}`)}
                </span>
            </td>

            {/* Joined */}
            <td className="py-3 px-4">
                <span className="text-[11px] whitespace-nowrap" style={{ color: textSecondary }}>
                    {joined || "—"}
                </span>
            </td>

            {/* Manage */}
            <td className="py-3 px-4">
                <AddUserDrawer
                    user={user}
                    onSuccess={onSuccess}
                    trigger={
                        <button
                            type="button"
                            className="h-7 px-3 rounded-full text-[11px] font-semibold transition-colors"
                            style={{
                                backgroundColor: btnHover ? manageBtn.hoverBg : manageBtn.bg,
                                color: btnHover ? manageBtn.hoverText : manageBtn.text,
                            }}
                            onMouseEnter={() => setBtnHover(true)}
                            onMouseLeave={() => setBtnHover(false)}
                        >
                            {t("AdminTable.TableManage")}
                        </button>
                    }
                />
            </td>
        </tr>
    );
}

export default Users;
