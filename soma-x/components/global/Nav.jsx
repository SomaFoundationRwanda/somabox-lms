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

const EXPANDED_WIDTH = 180;
const COLLAPSED_WIDTH = 64;

export default function SomaboxNav() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const { role, logout } = useContext(DataContext);
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
    return (
      <Link href={to} onClick={onClick} title={iconOnly ? label : undefined}>
        <div
          className={`flex items-center gap-3 py-2.5 rounded-full transition-colors duration-150 cursor-pointer ${iconOnly ? "justify-center px-2.5" : "px-3"} ${on ? "bg-brand-strong text-on-brand-strong" : "text-fg-muted hover:bg-surface-hover"}`}
        >
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          {!iconOnly && <span className="text-small font-semibold leading-none truncate">{label}</span>}
        </div>
      </Link>
    );
  };

  /* ── Mobile bottom tab item ── */
  const TabItem = ({ to, label, Icon }) => {
    const on = active(to);
    return (
      <Link href={to}>
        <div className={`flex flex-col items-center gap-1 px-2 ${on ? "text-brand-fg" : "text-fg-muted"}`}>
          <div className={`p-1.5 rounded-full ${on ? "bg-brand-soft" : ""}`}>
            <Icon size={19} strokeWidth={1.75} />
          </div>
          <span className="text-caption font-semibold truncate max-w-[48px] text-center leading-tight">{label}</span>
        </div>
      </Link>
    );
  };

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
            className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full transition-colors text-fg-muted hover:bg-surface-hover"
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
      <div className={`shrink-0 pt-6 pb-5 space-y-5 border-t border-line ${iconOnly ? "px-2" : "px-4"}`}>
        {!iconOnly && (
          <div className="space-y-3">
            <p className="text-caption font-bold text-fg-muted">{t("shell.nav.brightness")}</p>
            <BrightnessSlider labelColor="var(--fg-muted)" />
          </div>
        )}

        <button
          onClick={logout}
          title={iconOnly ? t("shell.nav.logout") : undefined}
          aria-label={iconOnly ? t("shell.nav.logout") : undefined}
          className={`flex items-center w-full py-2.5 rounded-full transition-colors text-fg-muted hover:bg-surface-hover ${iconOnly ? "justify-center px-2.5" : "gap-3 px-3"}`}
        >
          <LogOut size={15} strokeWidth={1.75} className="shrink-0" />
          {!iconOnly && <span className="text-small font-semibold">{t("shell.nav.logout")}</span>}
        </button>
      </div>
    </>
  );

  return (
    <section>
      {/* ══════════════ Mobile hamburger button ══════════════ */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-[13px] left-3 md:hidden z-[999] w-8 h-8 flex items-center justify-center rounded-[5px] bg-surface border border-line"
        aria-label={t("shell.nav.openMenu")}
      >
        <Menu size={16} strokeWidth={2} className="text-fg-muted" />
      </button>

      {/* ══════════════ Mobile drawer backdrop ══════════════ */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-scrim z-[1000] md:hidden backdrop-blur-[1px]"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ══════════════ Mobile drawer (always fully expanded — it's an overlay, not a persistent rail) ══════════════ */}
      <nav
        className={`fixed top-0 left-0 h-screen w-[180px] z-[1001] md:hidden flex flex-col transition-transform duration-300 ease-in-out rounded-r-[8px] bg-surface shadow-2xl ${mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full transition-colors bg-surface-hover text-fg-subtle"
          aria-label={t("shell.nav.closeMenu")}
        >
          <X size={14} strokeWidth={2} />
        </button>
        <SidebarContent onNavClick={() => setMobileOpen(false)} iconOnly={false} />
      </nav>

      {/* ══════════════ Desktop sidebar — collapsible, expanded by default ══════════════ */}
      <nav
        className="fixed hidden md:flex flex-col h-screen z-50 overflow-hidden transition-[width] duration-200 ease-in-out bg-surface"
        style={{ width: `${collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH}px` }}
      >
        <SidebarContent iconOnly={collapsed} showCollapseToggle />
      </nav>

      {/* ══════════════ Mobile bottom tab bar ══════════════ */}
      <nav className="fixed md:hidden z-[998] bottom-0 w-full rounded-t-[8px] bg-surface border-t border-line">
        <div className="flex items-center justify-around px-2 h-[4.2rem] pb-[env(safe-area-inset-bottom)]">
          {[...mainNavItems, ...managementNavItems, ...otherNavItems].map(item => (
            <TabItem key={item.id} to={item.to} label={item.label} Icon={item.Icon} />
          ))}
          <button onClick={logout} className="flex flex-col items-center gap-1 px-2 text-fg-muted">
            <div className="p-1.5 rounded-full hover:bg-surface-hover">
              <LogOut size={19} strokeWidth={1.75} />
            </div>
            <span className="text-caption font-semibold leading-tight">{t("shell.nav.logout")}</span>
          </button>
        </div>
      </nav>
    </section>
  );
}
