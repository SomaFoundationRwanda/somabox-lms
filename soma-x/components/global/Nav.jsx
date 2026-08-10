"use client"
import { BookOpen, BookMarked, Compass, Globe, LayoutDashboard, Library, LogOut, Menu, Moon, RefreshCcw, Sun, UserRound, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import DataContext from "@/context/DataContext";
import NotificationBellDrawer from "../notifications/NotificationBellDrawer";

const ACCENT_LIGHT = "#203A3A";
const ACCENT_DARK = "#0D9488";

export default function SomaboxNav() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { role, unshiftString, logout, isDark, toggleDark } = useContext(DataContext);
  const currentRole = role ? unshiftString(role) : "scholar";
  const [mobileOpen, setMobileOpen] = useState(false);

  const dashboardLocation =
    currentRole === "admin" ? "/manage/admin" :
      currentRole === "teacher" ? "/teacher/dashboard" :
        "/manage/scholar-dashboard";

  const mainNavItems = [
    { id: "dashboard", label: t("nav.dashboard") || "Dashboard", Icon: LayoutDashboard, to: dashboardLocation },
    ...(currentRole === "scholar"
      ? [
        { id: "courses", label: t("nav.courses") || "Courses", Icon: BookOpen, to: "/manage/scholar-dashboard/courses" },
        { id: "explore", label: "Explore", Icon: Compass, to: "/home" }
      ]
      : []),
  ];

  const managementNavItems = (currentRole === 'admin' || currentRole === 'teacher')
    ? [
      { id: "manage-content", label: "Content", Icon: LayoutDashboard, to: "/manage/admin/manage-content", roles: ['admin', 'teacher'] },
      { id: "sync", label: "Sync Content", Icon: RefreshCcw, to: "/manage/admin/sync", roles: ['admin'] },
      { id: "manage-library", label: "Library", Icon: Library, to: "/manage/admin/library", roles: ['admin'] },
    ].filter(item => item.roles.includes(currentRole))
    : [];

  const otherNavItems = [
    { id: "discover-courses", label: "Discover Courses", Icon: Globe, to: "/discover-courses" },
    { id: "library", label: t("nav.library") || "Library", Icon: BookMarked, to: "/library" },
    { id: "account", label: t("nav.account") || "Account", Icon: UserRound, to: "/account" },
  ];

  const active = (to) => {
    if (to === dashboardLocation) return pathname === to;
    return pathname === to || pathname.startsWith(to + "/");
  };

  /* ── Shared nav row (used by both desktop sidebar & mobile drawer) ── */
  const NavRow = ({ to, label, Icon, onClick }) => {
    const on = active(to);
    const activeStyle = isDark
      ? { backgroundColor: "rgba(13,148,136,0.10)", color: "#0D9488", border: "1px solid rgba(13,148,136,0.18)", boxShadow: "0 0 14px rgba(13,148,136,0.10)" }
      : { backgroundColor: ACCENT_LIGHT, color: "#fff" };
    const inactiveColor = isDark ? "#7A8595" : "#393F30";
    const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9";
    return (
      <Link href={to} onClick={onClick}>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors duration-150 cursor-pointer"
          style={on ? activeStyle : { color: inactiveColor }}
          onMouseEnter={e => { if (!on) e.currentTarget.style.backgroundColor = hoverBg; }}
          onMouseLeave={e => { if (!on) e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          <span className="text-[13px] font-semibold leading-none">{label}</span>
        </div>
      </Link>
    );
  };

  /* ── Mobile bottom tab item ── */
  const TabItem = ({ to, label, Icon }) => {
    const on = active(to);
    const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;
    return (
      <Link href={to}>
        <div className="flex flex-col items-center gap-1 px-2" style={{ color: on ? accent : (isDark ? "#4A5260" : "#94a3b8") }}>
          <div className="p-1.5 rounded-full" style={on ? { backgroundColor: isDark ? "rgba(13,148,136,0.12)" : "rgba(32,58,58,0.10)" } : {}}>
            <Icon size={19} strokeWidth={1.75} />
          </div>
          <span className="text-[9.5px] font-semibold truncate max-w-[48px] text-center leading-tight">{label}</span>
        </div>
      </Link>
    );
  };

  const dm = isDark;
  const sidebarBg = dm ? "#080B0F" : "#ffffff";
  const borderColor = dm ? "rgba(255,255,255,0.07)" : "#f1f5f9";
  const labelColor = dm ? "#556272" : "#94a3b8";
  const titleColor = dm ? "#E8ECF0" : "#0f172a";
  const subColor = dm ? "#637080" : "#94a3b8";
  const logoutColor = dm ? "#7A8595" : "#393F30";
  const logoutHover = dm ? "rgba(255,255,255,0.05)" : "#f1f5f9";

  /* ── Sidebar inner content (shared between desktop + mobile drawer) ── */
  const SidebarContent = ({ onNavClick }) => (
    <>
      {/* Brand */}
      <div className="flex items-center justify-center px-5 py-5 shrink-0" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <Image 
            src="/schoolLogo/somabox.png" 
            alt="SomaBox" 
            width={160} 
            height={55} 
            className="w-auto h-12 object-contain" 
            priority
        />
      </div>

      {/* Nav links - Flattened without section headers */}
      <div className="flex-1 overflow-y-auto px-3 py-5 space-y-1 min-h-0">
        {[...mainNavItems, ...managementNavItems, ...otherNavItems].map(item => (
          <NavRow key={item.id} {...item} onClick={onNavClick} />
        ))}
      </div>

      {/* Bottom pinned */}
      <div className="shrink-0 px-4 pt-6 pb-5 space-y-5" style={{ borderTop: `1px solid ${borderColor}` }}>
        <div className="space-y-3">
          <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: labelColor }}>Mode</p>
          <div className="flex gap-2">
            <button
              onClick={() => toggleDark(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
              style={!dm
                ? { backgroundColor: ACCENT_LIGHT, color: "#fff" }
                : { backgroundColor: "rgba(255,255,255,0.06)", color: "#7A8595", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Sun size={12} strokeWidth={2} /> Light
            </button>
            <button
              onClick={() => toggleDark(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all"
              style={dm
                ? { backgroundColor: "rgba(13,148,136,0.15)", color: "#0D9488", border: "1px solid rgba(13,148,136,0.25)", boxShadow: "0 0 10px rgba(13,148,136,0.2)" }
                : { backgroundColor: "#e2e8f0", color: "#64748b" }}
            >
              <Moon size={12} strokeWidth={2} /> Dark
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <section>
      {/* ══════════════ Mobile hamburger button ══════════════ */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-[13px] left-3 md:hidden z-[999] w-8 h-8 flex items-center justify-center rounded-[5px]"
        style={{ backgroundColor: sidebarBg, border: `1px solid ${borderColor}` }}
        aria-label="Open menu"
      >
        <Menu size={16} strokeWidth={2} style={{ color: dm ? "#7A8595" : "#393F30" }} />
      </button>

      {/* ══════════════ Mobile drawer backdrop ══════════════ */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[1000] md:hidden backdrop-blur-[1px]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ══════════════ Mobile drawer ══════════════ */}
      <nav
        className={`fixed top-0 left-0 h-screen w-[180px] z-[1001] md:hidden flex flex-col transition-transform duration-300 ease-in-out rounded-r-[8px] ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        style={{ backgroundColor: sidebarBg, boxShadow: dm ? "4px 0 32px rgba(0,0,0,0.6)" : "4px 0 24px rgba(0,0,0,0.12)" }}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: dm ? "rgba(255,255,255,0.07)" : "#f1f5f9", color: dm ? "#7A8595" : "#64748b" }}
          aria-label="Close menu"
        >
          <X size={14} strokeWidth={2} />
        </button>
        <SidebarContent onNavClick={() => setMobileOpen(false)} />
      </nav>

      {/* ══════════════ Desktop sidebar ══════════════ */}
      <nav className="fixed hidden md:flex flex-col h-screen w-[180px] z-50 overflow-hidden rounded-r-[8px]"
        style={{ backgroundColor: sidebarBg, borderRight: `1px solid ${borderColor}` }}>
        <SidebarContent onNavClick={undefined} />
      </nav>

      {/* ══════════════ Mobile bottom tab bar ══════════════ */}
      <nav className="fixed md:hidden z-[998] bottom-0 w-full rounded-t-[8px]"
        style={{ backgroundColor: sidebarBg, borderTop: `1px solid ${borderColor}` }}>
        <div className="flex items-center justify-around px-2 h-[4.2rem] pb-[env(safe-area-inset-bottom)]">
          {[...mainNavItems, ...managementNavItems, ...otherNavItems].map(item => (
            <TabItem key={item.id} to={item.to} label={item.label} Icon={item.Icon} />
          ))}
          <button onClick={logout} className="flex flex-col items-center gap-1 px-2" style={{ color: "#94a3b8" }}>
            <div className="p-1.5 rounded-full hover:bg-slate-100">
              <LogOut size={19} strokeWidth={1.75} />
            </div>
            <span className="text-[9.5px] font-semibold leading-tight">Logout</span>
          </button>
        </div>
      </nav>
    </section>
  );
}
