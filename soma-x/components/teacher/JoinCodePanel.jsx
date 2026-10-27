"use client"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { KeyRound, RefreshCw } from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"

// A course's join code (teachers only): learners type it on Discover courses to join by themselves,
// so they don't need an email address. Off until the teacher turns it on.
export default function JoinCodePanel({ courseId, isDraft = false }) {
  const { t } = useLanguage()
  const tj = (key) => t(`course.people.join.${key}`)
  const queryClient = useQueryClient()
  const queryKey = queryKeys.courseSection(courseId, "join-code")
  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/courses/${courseId}/join-code`).catch(() => ({ code: null })),
    enabled: !!courseId,
  })
  const code = query.isPending ? undefined : query.data?.code ?? null // undefined: loading; null: off
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const change = async (action) => {
    if (action === "new" && !window.confirm(tj("confirmNew"))) return
    setBusy(true)
    setError("")
    try {
      const data = await apiFetch(`/courses/${courseId}/join-code`, { method: "POST", json: { action } })
      queryClient.setQueryData(queryKey, { code: data.code ?? null })
    } catch {
      setError(tj("failed"))
    } finally {
      setBusy(false)
    }
  }

  if (code === undefined) return null

  const button = "inline-flex items-center gap-1.5 text-caption font-semibold rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
  return (
    <section aria-labelledby={`join-code-${courseId}`} className="space-y-2 border border-line rounded-xl p-4">
      <h3 id={`join-code-${courseId}`} className="text-ui font-bold text-fg flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-brand-fg" aria-hidden="true" /> {tj("title")}
      </h3>
      {code ? (
        <>
          <p className="text-display font-mono font-bold text-fg select-all" aria-live="polite">{code}</p>
          <p className="text-caption text-fg-muted">{tj("help")}</p>
          {isDraft ? <p className="text-caption text-warning-fg">{tj("draftNote")}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => change("new")} disabled={busy} className={`${button} text-fg-muted border border-line hover:bg-surface-hover`}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {tj("newCode")}
            </button>
            <button type="button" onClick={() => change("off")} disabled={busy} className={`${button} text-danger-fg border border-danger/30 hover:bg-danger-soft`}>
              {tj("turnOff")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-caption text-fg-muted">{tj("off")} {tj("help")}</p>
          <button type="button" onClick={() => change("on")} disabled={busy} className={`${button} text-on-brand bg-brand hover:bg-brand/90`}>
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> {tj("turnOn")}
          </button>
        </>
      )}
      {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
    </section>
  )
}
