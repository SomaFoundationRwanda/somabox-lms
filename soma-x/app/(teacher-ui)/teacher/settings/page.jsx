"use client"
import { useContext, useMemo, useState } from "react"
import DataContext from "@/context/DataContext"
import BrightnessSlider from "@/components/ui/BrightnessSlider"
import { useLanguage } from "@/context/LanguageContext"
import { LANGUAGE_NAMES } from "@/components/global/LanguageSwitcher"

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
        {description && <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ enabled, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`relative w-10 h-6 rounded-full transition-colors ${enabled ? "bg-[var(--brand-secondary)]" : "bg-slate-200 dark:bg-slate-700"}`}
    >
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${enabled ? "left-5" : "left-1"}`} />
    </button>
  )
}

export default function TeacherSettingsPage() {
  const { logout, user } = useContext(DataContext)
  const { t, lang, setLang } = useLanguage()

  const teacherEmail = user?.email || "";

  const teacherName = useMemo(() => {
    if (typeof window === "undefined") return ""
    return user?.fullName || ""
  }, [user])

  const [emailNotifications, setEmailNotifications] = useState(true)
  const [assignmentAlerts, setAssignmentAlerts] = useState(true)
  const [studentJoinAlerts, setStudentJoinAlerts] = useState(false)

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-white mb-6">{t("teacher.settings.title")}</h1>

      <Section title={t("teacher.settings.account")}>
        <Row label={t("teacher.settings.name")} description={t("teacher.settings.nameHelp")}>
          <span className="text-sm text-slate-500 dark:text-slate-400">{teacherName || "—"}</span>
        </Row>
        <Row label={t("teacher.settings.email")} description={t("teacher.settings.emailHelp")}>
          <span className="text-sm text-slate-500 dark:text-slate-400">{teacherEmail || "—"}</span>
        </Row>
        <Row label={t("teacher.settings.role")}>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]">{t("teacher.settings.teacherRole")}</span>
        </Row>
      </Section>

      <Section title={t("teacher.settings.display")}>
        <Row label={t("teacher.settings.brightness")} description={t("teacher.settings.brightnessHelp")}>
          <BrightnessSlider className="w-32" />
        </Row>
        <Row label={t("teacher.settings.language")} description={t("teacher.settings.languageHelp")}>
          <select
            aria-label={t("teacher.settings.language")}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-[var(--brand-secondary)]"
          >
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title={t("teacher.settings.notifications")}>
        <Row label={t("teacher.settings.emailNotifications")} description={t("teacher.settings.emailNotificationsHelp")}>
          <Toggle enabled={emailNotifications} onChange={setEmailNotifications} label={t("teacher.settings.emailNotifications")} />
        </Row>
        <Row label={t("teacher.settings.assignmentAlerts")} description={t("teacher.settings.assignmentAlertsHelp")}>
          <Toggle enabled={assignmentAlerts} onChange={setAssignmentAlerts} label={t("teacher.settings.assignmentAlerts")} />
        </Row>
        <Row label={t("teacher.settings.joinAlerts")} description={t("teacher.settings.joinAlertsHelp")}>
          <Toggle enabled={studentJoinAlerts} onChange={setStudentJoinAlerts} label={t("teacher.settings.joinAlerts")} />
        </Row>
      </Section>

      <Section title={t("teacher.settings.accountActions")}>
        <Row label={t("teacher.settings.signOut")} description={t("teacher.settings.signOutHelp")}>
          <button
            onClick={logout}
            className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("teacher.settings.signOutButton")}
          </button>
        </Row>
      </Section>
    </div>
  )
}
