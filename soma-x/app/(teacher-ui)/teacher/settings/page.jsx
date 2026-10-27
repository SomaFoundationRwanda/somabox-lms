"use client"
import { useContext, useMemo, useState } from "react"
import DataContext from "@/context/DataContext"
import BrightnessSlider from "@/components/ui/BrightnessSlider"
import { useLanguage } from "@/context/LanguageContext"
import { LANGUAGE_NAMES } from "@/components/global/LanguageSwitcher"
import ChangePasswordForm from "@/components/account/ChangePasswordForm"
import { useToast } from "@/context/ToastContext"
import { apiFetch } from "@/lib/api"
import { Select } from "@/components/form"

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-ui font-semibold text-fg-subtle mb-3">{title}</h2>
      <div className="bg-surface border border-line rounded-xl divide-y divide-line">
        {children}
      </div>
    </div>
  )
}

function Row({ label, description, children }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 gap-4">
      <div>
        <p className="text-ui font-medium text-fg-muted">{label}</p>
        {description && <p className="text-caption text-fg-muted mt-0.5">{description}</p>}
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
      <h1 className="text-section font-semibold text-fg mb-6">{t("teacher.settings.title")}</h1>

      {mustChangePassword && (
        <p role="alert" className="mb-6 px-4 py-3 rounded-xl border text-ui font-medium bg-warning-soft border-warning/30 text-warning-fg">
          {t("teacher.settings.mustChange")}
        </p>
      )}

      <Section title={t("teacher.settings.account")}>
        <Row label={t("teacher.settings.name")} description={t("teacher.settings.nameHelp")}>
          <span className="text-ui text-fg-subtle">{teacherName || "—"}</span>
        </Row>
        <Row label={t("teacher.settings.email")} description={t("teacher.settings.emailHelp")}>
          <span className="text-ui text-fg-subtle">{teacherEmail || "—"}</span>
        </Row>
        <Row label={t("teacher.settings.role")}>
          <span className="text-caption font-semibold px-2.5 py-1 rounded-full bg-brand/10 text-brand-fg">{t("teacher.settings.teacherRole")}</span>
        </Row>
      </Section>

      <Section title={t("teacher.settings.security")}>
        <div className="px-5 py-4">
          <p className="text-ui font-medium text-fg-muted">{t("learner.account.changePassword")}</p>
          <p className="text-caption text-fg-muted mt-0.5 mb-4">{t("teacher.settings.passwordHelp")}</p>
          {passwordStatus.message && (
            <p role="status" className={`mb-4 text-ui font-medium ${passwordStatus.type === "success" ? "text-success-fg" : "text-danger-fg"}`}>
              {passwordStatus.message}
            </p>
          )}
          <ChangePasswordForm onStatus={setPasswordStatus} accent="var(--brand-primary)" />
        </div>
        {!mustChangePassword && (
          <Row label={t("teacher.settings.signOutOthers")} description={t("teacher.settings.signOutOthersHelp")}>
            <button
              onClick={signOutOthers}
              disabled={signingOutOthers}
              className="text-ui px-4 py-1.5 rounded-lg border border-line text-fg-muted hover:bg-surface-hover transition-colors disabled:opacity-50"
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
          <Select
            aria-label={t("teacher.settings.language")}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            size="sm"
            className="w-40"
            options={Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ value: code, label: name }))}
          />
        </Row>
      </Section>

      <Section title={t("teacher.settings.accountActions")}>
        <Row label={t("teacher.settings.signOut")} description={t("teacher.settings.signOutHelp")}>
          <button
            onClick={logout}
            className="text-ui px-4 py-1.5 rounded-lg border border-line text-fg-muted hover:bg-surface-hover transition-colors"
          >
            {t("teacher.settings.signOutButton")}
          </button>
        </Row>
      </Section>
    </div>
  )
}
