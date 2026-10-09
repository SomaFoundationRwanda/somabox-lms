"use client"
import SchoolLogo, { PoweredBySomabox } from "@/components/global/SchoolLogo";
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useContext, useEffect, useState } from "react"
import DataContext from "@/context/DataContext"
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import BrightnessSlider from "@/components/ui/BrightnessSlider";
import Header from "@/components/global/Header";
import { useLanguage } from "@/context/LanguageContext";
import { BookOpen, CalendarDays, Compass, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react"
import Loader from "@/components/ui/Loader";
import { startRouteLoading } from "@/components/global/RouteLoader";

const ACCENT_LIGHT = "var(--brand-primary)"
const ACCENT_DARK = "var(--brand-secondary)"
const EXPANDED_WIDTH = 180
const COLLAPSED_WIDTH = 64

const mainNavItems = [
  { id: "dashboard", labelKey: "teacher.nav.dashboard", Icon: LayoutDashboard, href: "/teacher/dashboard" },
  { id: "courses", labelKey: "teacher.nav.courses", Icon: BookOpen, href: "/teacher/courses" },
  { id: "explore", labelKey: "teacher.nav.explore", Icon: Compass, href: "/teacher/explore" },
  { id: "calendar", labelKey: "teacher.nav.calendar", Icon: CalendarDays, href: "/calendar" },
]

const otherNavItems = [
  { id: "settings", labelKey: "teacher.nav.settings", Icon: Settings, href: "/teacher/settings" },
]

export default function TeacherUILayout({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, isDark, authLoading, authenticated, user } = useContext(DataContext)
  const { t } = useLanguage()
  const dm = isDark
  const [collapsed, setCollapsed] = useState(false)
  const allowed = authenticated && ["teacher", "admin"].includes(user?.role)

  // Teacher pages need a teacher or admin session (the API enforces this too).
  useEffect(() => {
    if (authLoading) return
    if (!allowed || user?.mustChangePassword) startRouteLoading()
    if (!authenticated) router.replace("/")
    else if (user?.mustChangePassword) router.replace("/account")
    else if (!allowed) router.replace("/manage/auth")
  }, [authLoading, authenticated, allowed, user, router])

  // Same collapse mechanism and localStorage key as the scholar/admin shell
  // (Nav.jsx) — kept in sync so the preference carries over between shells.
  useEffect(() => {
    const stored = localStorage.getItem("sidebarCollapsed")
    setCollapsed(stored === "true")
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("sidebarCollapsed", String(next))
      return next
    })
  }

  const sidebarBg = dm ? "#080B0F" : "#ffffff"
  const borderColor = dm ? "rgba(255,255,255,0.07)" : "#f1f5f9"
  const labelColor = dm ? "#7A8595" : "#475569"
  const logoutColor = dm ? "#7A8595" : "#393F30"
  const logoutHover = dm ? "rgba(255,255,255,0.05)" : "#f1f5f9"

  const isActive = (href) => pathname === href || pathname.startsWith(href + "/")

  const NavRow = ({ href, label, Icon, onClick, iconOnly }) => {
    const on = isActive(href)
    const activeStyle = dm
      ? { backgroundColor: "color-mix(in srgb, var(--brand-secondary) 10%, transparent)", color: "var(--brand-secondary)", border: "1px solid color-mix(in srgb, var(--brand-secondary) 18%, transparent)", boxShadow: "0 0 14px color-mix(in srgb, var(--brand-secondary) 10%, transparent)" }
      : { backgroundColor: ACCENT_LIGHT, color: "#fff" }
    const inactiveColor = dm ? "#7A8595" : "#393F30"
    const hoverBg = dm ? "rgba(255,255,255,0.05)" : "#f1f5f9"
    return (
      <Link href={href} onClick={onClick} title={iconOnly ? label : undefined}>
        <div
          className={`flex items-center gap-3 py-2.5 rounded-full transition-colors duration-150 cursor-pointer ${iconOnly ? "justify-center px-2.5" : "px-3"}`}
          style={on ? activeStyle : { color: inactiveColor }}
          onMouseEnter={e => { if (!on) e.currentTarget.style.backgroundColor = hoverBg }}
          onMouseLeave={e => { if (!on) e.currentTarget.style.backgroundColor = "transparent" }}
        >
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          {!iconOnly && <span className="text-[13px] font-semibold leading-none truncate">{label}</span>}
        </div>
      </Link>
    )
  }

  const SidebarContent = ({ onNavClick, iconOnly = false }) => (
    <>
      {/* Brand — same full wordmark used across every dashboard, no background
          card. Toggle sits as a normal flex sibling so it never overlaps the
          logo artwork. */}
      <div className={`flex items-center shrink-0 ${iconOnly ? "flex-col gap-2 px-2 py-4" : "justify-between px-4 py-5"}`}>
        <div className={iconOnly ? "" : "flex-1 flex justify-center"}>
          {iconOnly ? (
            <SchoolLogo variant="mark" priority />
          ) : (
            <div className="flex flex-col items-center gap-1 min-w-0"><SchoolLogo priority className="w-auto h-12 max-w-[140px]" /><PoweredBySomabox className="text-center" /></div>
          )}
        </div>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? t("teacher.nav.expandSidebar") : t("teacher.nav.collapseSidebar")}
          aria-label={collapsed ? t("teacher.nav.expandSidebar") : t("teacher.nav.collapseSidebar")}
          className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full transition-colors"
          style={{ color: labelColor }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = dm ? "rgba(255,255,255,0.06)" : "#f1f5f9" }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent" }}
        >
          {collapsed ? <PanelLeftOpen size={15} strokeWidth={1.75} /> : <PanelLeftClose size={15} strokeWidth={1.75} />}
        </button>
      </div>

      {/* Nav links */}
      <div className={`flex-1 overflow-y-auto py-5 space-y-1 min-h-0 ${iconOnly ? "px-2" : "px-3"}`}>
        {[...mainNavItems, ...otherNavItems].map(item => (
          <NavRow key={item.id} href={item.href} label={t(item.labelKey)} Icon={item.Icon} onClick={onNavClick} iconOnly={iconOnly} />
        ))}
      </div>

      {/* Bottom pinned */}
      <div className={`shrink-0 pt-6 pb-5 space-y-5 ${iconOnly ? "px-2" : "px-4"}`} style={{ borderTop: `1px solid ${borderColor}` }}>
        {!iconOnly && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: labelColor }}>{t("teacher.nav.brightness")}</p>
            <BrightnessSlider labelColor={labelColor} trackAccent={dm ? ACCENT_DARK : ACCENT_LIGHT} />
          </div>
        )}

        <button
          onClick={logout}
          title={iconOnly ? t("teacher.nav.logout") : undefined}
          className={`flex items-center w-full py-2.5 rounded-full transition-colors ${iconOnly ? "justify-center px-2.5" : "gap-3 px-3"}`}
          style={{ color: logoutColor }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = logoutHover}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <LogOut size={15} strokeWidth={1.75} className="shrink-0" />
          {!iconOnly && <span className="text-[13px] font-semibold">{t("teacher.nav.logout")}</span>}
        </button>
      </div>
    </>
  )

  if (authLoading || !allowed) {
    return (
      <div className="min-h-screen w-full bg-[#EFEFEF] dark:bg-slate-950">
        <Loader variant="page" className="min-h-screen" />
      </div>
    )
  }

  return (
    <div className="flex w-full h-screen overflow-hidden" style={{ backgroundColor: sidebarBg }}>
      {/* Sidebar — collapsible, expanded by default (same behavior as the
          scholar/admin shell's Nav.jsx) */}
      <aside
        className="flex flex-col flex-shrink-0 h-full transition-[width] duration-200 ease-in-out"
        style={{ backgroundColor: sidebarBg, width: `${collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH}px` }}
      >
        <SidebarContent iconOnly={collapsed} />
      </aside>

      {/* Main content — persistent header shared with the rest of the app,
          so it no longer disappears when navigating away from the dashboard. */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {/* The shared Header carries the language switcher, so every teacher page has it (phones too). */}
        <Header />
        <main className="flex-1 overflow-y-auto px-8 py-6" style={{ backgroundColor: sidebarBg }}>
          {children}
        </main>
      </div>
      <MandatoryProfileSetupModal />
    </div>
  )
}
