"use client"
import { BookCopy, BookOpen, BookMarked, CalendarDays, Compass, Globe, LayoutDashboard, Library, LogOut, Menu, PanelLeftClose, PanelLeftOpen, RefreshCcw, UserRound, X } from "lucide-react";
import Link from "next/link";
import SchoolLogo, { PoweredBySomabox } from "@/components/global/SchoolLogo";
import { useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import DataContext from "@/context/DataContext";
import NotificationBellDrawer from "../notifications/NotificationBellDrawer";
import BrightnessSlider from "@/components/ui/BrightnessSlider";

const ACCENT_LIGHT = "var(--brand-primary)";
const ACCENT_DARK = "var(--brand-secondary)";
const EXPANDED_WIDTH = 180;
const COLLAPSED_WIDTH = 64;

export default function SomaboxNav() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { role, logout, isDark } = useContext(DataContext);
  const currentRole = role || "scholar";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Desktop-only collapse state, remembered across visits (mirrors Drive).
  // Written to a CSS var so the app-shell layout's content margin can react
  // to it without needing its own copy of this state.
  useEffect(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    setCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH}px`);
  }, [collapsed]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  const dashboardLocation =
    currentRole === "admin" ? "/manage/admin" :
      currentRole === "teacher" ? "/teacher/dashboard" :
        "/manage/scholar-dashboard";

  const mainNavItems = [
    { id: "dashboard", label: t("nav.dashboard") || "Dashboard", Icon: LayoutDashboard, to: dashboardLocation },
    ...(currentRole === "scholar"
      ? [
        { id: "courses", label: t("shell.nav.courses"), Icon: BookOpen, to: "/manage/scholar-dashboard/courses" },
        { id: "explore", label: t("shell.nav.explore"), Icon: Compass, to: "/home" }
      ]
      : []),
    { id: "calendar", label: t("shell.nav.calendar"), Icon: CalendarDays, to: "/calendar" },
  ];

  const managementNavItems = (currentRole === 'admin' || currentRole === 'teacher')
    ? [
      { id: "manage-content", label: t("shell.nav.content"), Icon: LayoutDashboard, to: "/manage/admin/manage-content", roles: ['admin', 'teacher'] },
      { id: "sync", label: t("shell.nav.sync"), Icon: RefreshCcw, to: "/manage/admin/sync", roles: ['admin'] },
      { id: "course-library", label: t("shell.nav.courseLibrary"), Icon: BookCopy, to: "/library/courses", roles: ['admin', 'teacher'] },
      { id: "manage-library", label: t("nav.library") || "Library", Icon: Library, to: "/manage/admin/library", roles: ['admin'] },
    ].filter(item => item.roles.includes(currentRole))
    : [];

  const otherNavItems = [
    { id: "discover-courses", label: t("shell.nav.discoverCourses"), Icon: Globe, to: "/discover-courses" },
    { id: "library", label: t("nav.library") || "Library", Icon: BookMarked, to: "/library" },
    { id: "account", label: t("nav.account") || "Account", Icon: UserRound, to: "/account" },
  ];

  const active = (to) => {
    if (to === dashboardLocation) return pathname === to;
    if (to === "/library" && pathname.startsWith("/library/courses")) return false;
    return pathname === to || pathname.startsWith(to + "/");
  };

  /* ── Shared nav row (used by both desktop sidebar & mobile drawer) ── */
  const NavRow = ({ to, label, Icon, onClick, iconOnly }) => {
    const on = active(to);
    const activeStyle = isDark
      ? { backgroundColor: "color-mix(in srgb, var(--brand-secondary) 10%, transparent)", color: "var(--brand-secondary)", border: "1px solid color-mix(in srgb, var(--brand-secondary) 18%, transparent)", boxShadow: "0 0 14px color-mix(in srgb, var(--brand-secondary) 10%, transparent)" }
      : { backgroundColor: ACCENT_LIGHT, color: "#fff" };
    const inactiveColor = isDark ? "#7A8595" : "#393F30";
    const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9";
    return (
      <Link href={to} onClick={onClick} title={iconOnly ? label : undefined}>
        <div
          className={`flex items-center gap-3 py-2.5 rounded-full transition-colors duration-150 cursor-pointer ${iconOnly ? "justify-center px-2.5" : "px-3"}`}
          style={on ? activeStyle : { color: inactiveColor }}
          onMouseEnter={e => { if (!on) e.currentTarget.style.backgroundColor = hoverBg; }}
          onMouseLeave={e => { if (!on) e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          {!iconOnly && <span className="text-[13px] font-semibold leading-none truncate">{label}</span>}
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
        <div className="flex flex-col items-center gap-1 px-2" style={{ color: on ? accent : (isDark ? "#7A8595" : "#475569") }}>
          <div className="p-1.5 rounded-full" style={on ? { backgroundColor: `color-mix(in srgb, ${accent} ${isDark ? 12 : 10}%, transparent)` } : {}}>
            <Icon size={19} strokeWidth={1.75} />
          </div>
          <span className="text-[11px] font-semibold truncate max-w-[48px] text-center leading-tight">{label}</span>
        </div>
      </Link>
    );
  };

  const dm = isDark;
  const sidebarBg = dm ? "#080B0F" : "#ffffff";
  const borderColor = dm ? "rgba(255,255,255,0.07)" : "#f1f5f9";
  const labelColor = dm ? "#7A8595" : "#475569";
  const logoutColor = dm ? "#7A8595" : "#393F30";
  const logoutHover = dm ? "rgba(255,255,255,0.05)" : "#f1f5f9";

  /* ── Sidebar inner content (shared between desktop + mobile drawer) ── */
  const SidebarContent = ({ onNavClick, iconOnly = false, showCollapseToggle = false }) => (
    <>
      {/* Brand — toggle sits as a normal flex sibling here (not absolutely
          positioned) so it can never overlap the logo artwork. */}
      <div className={`flex items-center shrink-0 ${iconOnly ? "flex-col gap-2 px-2 py-4" : "justify-between px-4 py-5"}`}>
        <div className={iconOnly ? "" : "flex-1 flex justify-center"}>
          {iconOnly ? (
            <SchoolLogo variant="mark" priority />
          ) : (
            <div className="flex flex-col items-center gap-1 min-w-0"><SchoolLogo priority className="w-auto h-12 max-w-[140px]" /><PoweredBySomabox className="text-center" /></div>
          )}
        </div>
        {showCollapseToggle && (
          <button
            onClick={toggleCollapsed}
            title={collapsed ? t("shell.nav.expandSidebar") : t("shell.nav.collapseSidebar")}
            aria-label={collapsed ? t("shell.nav.expandSidebar") : t("shell.nav.collapseSidebar")}
            className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full transition-colors"
            style={{ color: labelColor }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = dm ? "rgba(255,255,255,0.06)" : "#f1f5f9"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.75} /> : <PanelLeftClose size={15} strokeWidth={1.75} />}
          </button>
        )}
      </div>

      {/* Nav links - Flattened without section headers */}
      <div className={`flex-1 overflow-y-auto py-5 space-y-1 min-h-0 ${iconOnly ? "px-2" : "px-3"}`}>
        {[...mainNavItems, ...managementNavItems, ...otherNavItems].map(item => (
          <NavRow key={item.id} {...item} onClick={onNavClick} iconOnly={iconOnly} />
        ))}
      </div>

      {/* Bottom pinned */}
      <div className={`shrink-0 pt-6 pb-5 space-y-5 ${iconOnly ? "px-2" : "px-4"}`} style={{ borderTop: `1px solid ${borderColor}` }}>
        {!iconOnly && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: labelColor }}>{t("shell.nav.brightness")}</p>
            <BrightnessSlider labelColor={labelColor} trackAccent={dm ? ACCENT_DARK : ACCENT_LIGHT} />
          </div>
        )}

        <button
          onClick={logout}
          title={iconOnly ? t("shell.nav.logout") : undefined}
          aria-label={iconOnly ? t("shell.nav.logout") : undefined}
          className={`flex items-center w-full py-2.5 rounded-full transition-colors ${iconOnly ? "justify-center px-2.5" : "gap-3 px-3"}`}
          style={{ color: logoutColor }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = logoutHover; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <LogOut size={15} strokeWidth={1.75} className="shrink-0" />
          {!iconOnly && <span className="text-[13px] font-semibold">{t("shell.nav.logout")}</span>}
        </button>
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
        aria-label={t("shell.nav.openMenu")}
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

      {/* ══════════════ Mobile drawer (always fully expanded — it's an overlay, not a persistent rail) ══════════════ */}
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
          aria-label={t("shell.nav.closeMenu")}
        >
          <X size={14} strokeWidth={2} />
        </button>
        <SidebarContent onNavClick={() => setMobileOpen(false)} iconOnly={false} />
      </nav>

      {/* ══════════════ Desktop sidebar — collapsible, expanded by default ══════════════ */}
      <nav
        className="fixed hidden md:flex flex-col h-screen z-50 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ backgroundColor: sidebarBg, width: `${collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH}px` }}
      >
        <SidebarContent iconOnly={collapsed} showCollapseToggle />
      </nav>

      {/* ══════════════ Mobile bottom tab bar ══════════════ */}
      <nav className="fixed md:hidden z-[998] bottom-0 w-full rounded-t-[8px]"
        style={{ backgroundColor: sidebarBg, borderTop: `1px solid ${borderColor}` }}>
        <div className="flex items-center justify-around px-2 h-[4.2rem] pb-[env(safe-area-inset-bottom)]">
          {[...mainNavItems, ...managementNavItems, ...otherNavItems].map(item => (
            <TabItem key={item.id} to={item.to} label={item.label} Icon={item.Icon} />
          ))}
          <button onClick={logout} className="flex flex-col items-center gap-1 px-2" style={{ color: dm ? "#7A8595" : "#475569" }}>
            <div className="p-1.5 rounded-full hover:bg-slate-100">
              <LogOut size={19} strokeWidth={1.75} />
            </div>
            <span className="text-[11px] font-semibold leading-tight">{t("shell.nav.logout")}</span>
          </button>
        </div>
      </nav>
    </section>
  );
}
