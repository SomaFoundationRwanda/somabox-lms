"use client"
import { useContext, useMemo, useState } from "react"
import DataContext from "@/context/DataContext"
import BrightnessSlider from "@/components/ui/BrightnessSlider"
import { useLanguage } from "@/context/LanguageContext"
import { LANGUAGE_NAMES } from "@/components/global/LanguageSwitcher"
import ChangePasswordForm from "@/components/account/ChangePasswordForm"
import { useToast } from "@/context/ToastContext"
import { apiFetch } from "@/lib/api"

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

export default function TeacherSettingsPage() {
  const { logout, user } = useContext(DataContext)
  const { t, lang, setLang } = useLanguage()
  const { showToast } = useToast()
  const [passwordStatus, setPasswordStatus] = useState({ type: "", message: "" })
  const [signingOutOthers, setSigningOutOthers] = useState(false)
  const mustChangePassword = !!user?.mustChangePassword

  const signOutOthers = async () => {
    setSigningOutOthers(true)
    try {
      await apiFetch("/auth/logout-others", { method: "POST" })
      showToast(t("teacher.settings.signedOutOthers"), "success")
    } catch {
      showToast(t("teacher.common.somethingWrong"), "error")
    } finally {
      setSigningOutOthers(false)
    }
  }

  const teacherEmail = user?.email || "";

  const teacherName = useMemo(() => {
    if (typeof window === "undefined") return ""
    return user?.fullName || ""
  }, [user])

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-white mb-6">{t("teacher.settings.title")}</h1>

      {mustChangePassword && (
        <p role="alert" className="mb-6 px-4 py-3 rounded-xl border text-sm font-medium bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
          {t("teacher.settings.mustChange")}
        </p>
      )}

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

      <Section title={t("teacher.settings.security")}>
        <div className="px-5 py-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("learner.account.changePassword")}</p>
          <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5 mb-4">{t("teacher.settings.passwordHelp")}</p>
          {passwordStatus.message && (
            <p role="status" className={`mb-4 text-sm font-medium ${passwordStatus.type === "success" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {passwordStatus.message}
            </p>
          )}
          <ChangePasswordForm onStatus={setPasswordStatus} accent="var(--brand-primary)" darkAware />
        </div>
        {!mustChangePassword && (
          <Row label={t("teacher.settings.signOutOthers")} description={t("teacher.settings.signOutOthersHelp")}>
            <button
              onClick={signOutOthers}
              disabled={signingOutOthers}
              className="text-sm px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {t("teacher.settings.signOutOthersButton")}
            </button>
          </Row>
        )}
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
