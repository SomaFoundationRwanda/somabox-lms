"use client"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useContext } from "react"
import DataContext from "@/context/DataContext"
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import { BookOpen, Compass, LayoutDashboard, LogOut, Moon, Settings, Sun } from "lucide-react"

const ACCENT_LIGHT = "#203A3A"

const mainNavItems = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard, href: "/teacher/dashboard" },
  { id: "courses", label: "Courses", Icon: BookOpen, href: "/teacher/courses" },
  { id: "explore", label: "Explore", Icon: Compass, href: "/teacher/explore" },
]

const otherNavItems = [
  { id: "settings", label: "Settings", Icon: Settings, href: "/teacher/settings" },
]

export default function TeacherUILayout({ children }) {
  const pathname = usePathname()
  const { logout, isDark, toggleDark } = useContext(DataContext)
  const dm = isDark
  const sidebarBg = dm ? "#080B0F" : "#ffffff"
  const borderColor = dm ? "rgba(255,255,255,0.07)" : "#f1f5f9"
  const labelColor = dm ? "#556272" : "#94a3b8"
  const titleColor = dm ? "#E8ECF0" : "#0f172a"
  const subColor = dm ? "#637080" : "#94a3b8"
  const logoutColor = dm ? "#7A8595" : "#393F30"
  const logoutHover = dm ? "rgba(255,255,255,0.05)" : "#f1f5f9"

  const isActive = (href) => pathname === href || pathname.startsWith(href + "/")

  const NavRow = ({ href, label, Icon, onClick }) => {
    const on = isActive(href)
    const activeStyle = dm
      ? { backgroundColor: "rgba(13,148,136,0.10)", color: "#0D9488", border: "1px solid rgba(13,148,136,0.18)", boxShadow: "0 0 14px rgba(13,148,136,0.10)" }
      : { backgroundColor: ACCENT_LIGHT, color: "#fff" }
    const inactiveColor = dm ? "#7A8595" : "#393F30"
    const hoverBg = dm ? "rgba(255,255,255,0.05)" : "#f1f5f9"
    return (
      <Link href={href} onClick={onClick}>
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors duration-150 cursor-pointer"
          style={on ? activeStyle : { color: inactiveColor }}
          onMouseEnter={e => { if (!on) e.currentTarget.style.backgroundColor = hoverBg }}
          onMouseLeave={e => { if (!on) e.currentTarget.style.backgroundColor = "transparent" }}
        >
          <Icon size={16} strokeWidth={1.75} className="shrink-0" />
          <span className="text-[13px] font-semibold leading-none">{label}</span>
        </div>
      </Link>
    )
  }

  const SidebarContent = ({ onNavClick }) => (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 shrink-0" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div
          className="w-9 h-9 rounded-[8px] overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: dm ? "rgba(255,255,255,0.06)" : "#f1f5f9", border: `1px solid ${borderColor}` }}
        >
          <Image src="/schoolLogo/somabox-logo-dark.webp" alt="SOMABOX" width={32} height={32} className="w-8 h-8 object-contain" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-[14px] font-black truncate" style={{ color: titleColor }}>SOMABOX</p>
          <p className="text-[10px] font-medium truncate" style={{ color: subColor }}>Teacher Dashboard</p>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex-1 overflow-y-auto px-3 py-5 space-y-6 min-h-0">
        <div className="space-y-1">
          <p className="text-[9.5px] font-bold uppercase tracking-widest px-2 mb-2.5" style={{ color: labelColor }}>Main Menu</p>
          {mainNavItems.map(item => <NavRow key={item.id} href={item.href} label={item.label} Icon={item.Icon} onClick={onNavClick} />)}
        </div>
        <div className="space-y-1">
          <p className="text-[9.5px] font-bold uppercase tracking-widest px-2 mb-2.5" style={{ color: labelColor }}>Other</p>
          {otherNavItems.map(item => <NavRow key={item.id} href={item.href} label={item.label} Icon={item.Icon} onClick={onNavClick} />)}
        </div>
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

        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-full transition-colors"
          style={{ color: logoutColor }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = logoutHover}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <LogOut size={15} strokeWidth={1.75} className="shrink-0" />
          <span className="text-[13px] font-semibold">Logout</span>
        </button>
      </div>
    </>
  )

  return (
    <div className="flex w-full h-screen overflow-hidden" style={{ backgroundColor: dm ? "#080B0F" : "#ffffff" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col flex-shrink-0 h-full w-[180px]"
        style={{ backgroundColor: sidebarBg, borderRight: `1px solid ${borderColor}` }}
      >
        <SidebarContent onNavClick={undefined} />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto px-8 py-6" style={{ backgroundColor: dm ? "#080B0F" : "#ffffff" }}>
          {children}
        </main>
      </div>
      <MandatoryProfileSetupModal />
    </div>
  )
}
