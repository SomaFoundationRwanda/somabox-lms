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

  const button = "inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
  return (
    <section aria-labelledby={`join-code-${courseId}`} className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <h3 id={`join-code-${courseId}`} className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-[var(--brand-secondary)]" aria-hidden="true" /> {tj("title")}
      </h3>
      {code ? (
        <>
          <p className="text-3xl font-mono font-bold tracking-[0.3em] text-slate-900 dark:text-white select-all" aria-live="polite">{code}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{tj("help")}</p>
          {isDraft ? <p className="text-xs text-amber-800">{tj("draftNote")}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={() => change("new")} disabled={busy} className={`${button} text-slate-700 border border-slate-200 hover:bg-slate-50`}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {tj("newCode")}
            </button>
            <button type="button" onClick={() => change("off")} disabled={busy} className={`${button} text-rose-700 border border-rose-200 hover:bg-rose-50`}>
              {tj("turnOff")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-600 dark:text-slate-400">{tj("off")} {tj("help")}</p>
          <button type="button" onClick={() => change("on")} disabled={busy} className={`${button} text-white bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)]`}>
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> {tj("turnOn")}
          </button>
        </>
      )}
      {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
    </section>
  )
}
