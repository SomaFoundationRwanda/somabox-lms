"use client"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useContext, useEffect, useState } from "react"
import DataContext from "@/context/DataContext"
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import BrightnessSlider from "@/components/ui/BrightnessSlider";
import Header from "@/components/global/Header";
import { BookOpen, CalendarDays, Compass, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react"

const ACCENT_LIGHT = "#203A3A"
const ACCENT_DARK = "#0D9488"
const EXPANDED_WIDTH = 180
const COLLAPSED_WIDTH = 64

const mainNavItems = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard, href: "/teacher/dashboard" },
  { id: "courses", label: "Courses", Icon: BookOpen, href: "/teacher/courses" },
  { id: "explore", label: "Explore", Icon: Compass, href: "/teacher/explore" },
  { id: "calendar", label: "Calendar", Icon: CalendarDays, href: "/calendar" },
]

const otherNavItems = [
  { id: "settings", label: "Settings", Icon: Settings, href: "/teacher/settings" },
]

export default function TeacherUILayout({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, isDark, authLoading, authenticated, user } = useContext(DataContext)
  const dm = isDark
  const [collapsed, setCollapsed] = useState(false)
  const allowed = authenticated && ["teacher", "admin"].includes(user?.role)

  // Teacher pages need a teacher or admin session (the API enforces this too).
  useEffect(() => {
    if (authLoading) return
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
      ? { backgroundColor: "rgba(13,148,136,0.10)", color: "#0D9488", border: "1px solid rgba(13,148,136,0.18)", boxShadow: "0 0 14px rgba(13,148,136,0.10)" }
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
            <Image src="/schoolLogo/somabox-logo-dark.webp" alt="SomaBox" width={32} height={32} className="w-8 h-8 object-contain" priority />
          ) : (
            <Image src="/schoolLogo/somabox.png" alt="SomaBox" width={160} height={55} className="w-auto h-12 object-contain" priority />
          )}
        </div>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
          <NavRow key={item.id} href={item.href} label={item.label} Icon={item.Icon} onClick={onNavClick} iconOnly={iconOnly} />
        ))}
      </div>

      {/* Bottom pinned */}
      <div className={`shrink-0 pt-6 pb-5 space-y-5 ${iconOnly ? "px-2" : "px-4"}`} style={{ borderTop: `1px solid ${borderColor}` }}>
        {!iconOnly && (
          <div className="space-y-3">
            <p className="text-[9.5px] font-bold uppercase tracking-widest" style={{ color: labelColor }}>Brightness</p>
            <BrightnessSlider labelColor={labelColor} trackAccent={dm ? ACCENT_DARK : ACCENT_LIGHT} />
          </div>
        )}

        <button
          onClick={logout}
          title={iconOnly ? "Logout" : undefined}
          className={`flex items-center w-full py-2.5 rounded-full transition-colors ${iconOnly ? "justify-center px-2.5" : "gap-3 px-3"}`}
          style={{ color: logoutColor }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = logoutHover}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <LogOut size={15} strokeWidth={1.75} className="shrink-0" />
          {!iconOnly && <span className="text-[13px] font-semibold">Logout</span>}
        </button>
      </div>
    </>
  )

  if (authLoading || !allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EFEFEF]">
        <div className="w-8 h-8 rounded-full border-[3px] border-slate-200 border-t-[#203A3A] animate-spin" />
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
        <Header />
        <main className="flex-1 overflow-y-auto px-8 py-6" style={{ backgroundColor: sidebarBg }}>
          {children}
        </main>
      </div>
      <MandatoryProfileSetupModal />
    </div>
  )
}
