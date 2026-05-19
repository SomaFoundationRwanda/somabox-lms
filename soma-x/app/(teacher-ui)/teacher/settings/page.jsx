"use client"
import { useContext, useMemo, useState } from "react"
import DataContext from "@/context/DataContext"

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{title}</h2>
      <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-700/50 rounded-xl divide-y divide-slate-100 dark:divide-slate-700/50">
        {children}
      </div>
    </div>
  )
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 gap-4">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {description && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-10 h-6 rounded-full transition-colors ${enabled ? "bg-[#2E8282]" : "bg-slate-200 dark:bg-slate-700"}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${enabled ? "left-5" : "left-1"}`} />
    </button>
  )
}

export default function TeacherSettingsPage() {
  const { unshiftString, logout, isDark, toggleDark } = useContext(DataContext)

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("al")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  const teacherName = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("un")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  const [emailNotifications, setEmailNotifications] = useState(true)
  const [assignmentAlerts, setAssignmentAlerts] = useState(true)
  const [studentJoinAlerts, setStudentJoinAlerts] = useState(false)
  const [language, setLanguage] = useState("en")

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-white mb-6">Settings</h1>

      <Section title="Account">
        <Row label="Name" description="Your display name">
          <span className="text-sm text-slate-500 dark:text-slate-400">{teacherName || "—"}</span>
        </Row>
        <Row label="Email" description="Your login email">
          <span className="text-sm text-slate-500 dark:text-slate-400">{teacherEmail || "—"}</span>
        </Row>
        <Row label="Role">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#2E8282]/10 text-[#2E8282]">Teacher</span>
        </Row>
      </Section>

      <Section title="Display">
        <Row label="Dark Mode" description="Switch to dark theme">
          <Toggle enabled={isDark} onChange={toggleDark} />
        </Row>
        <Row label="Language" description="Interface language">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-[#2E8282]"
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="rw">Kinyarwanda</option>
            <option value="sw">Swahili</option>
          </select>
        </Row>
      </Section>

      <Section title="Notifications">
        <Row label="Email notifications" description="Receive updates via email">
          <Toggle enabled={emailNotifications} onChange={setEmailNotifications} />
        </Row>
        <Row label="Assignment alerts" description="Notify when students complete assignments">
          <Toggle enabled={assignmentAlerts} onChange={setAssignmentAlerts} />
        </Row>
        <Row label="Student join alerts" description="Notify when a student joins your class">
          <Toggle enabled={studentJoinAlerts} onChange={setStudentJoinAlerts} />
        </Row>
      </Section>

      <Section title="Account Actions">
        <Row label="Sign out" description="Log out of your account">
          <button
            onClick={logout}
            className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Sign Out
          </button>
        </Row>
      </Section>
    </div>
  )
}
