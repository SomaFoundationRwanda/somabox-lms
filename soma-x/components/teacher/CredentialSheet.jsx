"use client"

// The sign-in details of new learners (or a reset password), shown once: the box never shows a
// temporary password again. The teacher prints it or writes it down, then hands each learner theirs.
import { Printer } from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"
import { Button } from "@/components/ui/button"

const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

export default function CredentialSheet({ rows, courseTitle, onDone }) {
  const { t } = useLanguage()
  const l = (key) => t(`teacher.learners.${key}`)

  // A plain page of its own, so only the sheet is printed (not the app around the dialog).
  const print = () => {
    const win = window.open("", "_blank", "width=800,height=900")
    if (!win) return
    const body = rows.map((r) => `<tr><td>${escape(r.fullName)}</td><td><b>${escape(r.learnerCode)}</b></td><td><b>${escape(r.temporaryPassword)}</b></td></tr>`).join("")
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(courseTitle)}</title>
      <style>body{font:14px system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:8px;text-align:left}th{background:#eee}p{color:#333}</style>
      </head><body><h2>${escape(courseTitle)}</h2><p>${escape(l("sheetPrintNote"))}</p>
      <table><thead><tr><th>${escape(l("name"))}</th><th>${escape(l("code"))}</th><th>${escape(l("tempPassword"))}</th></tr></thead><tbody>${body}</tbody></table>
      </body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="space-y-4">
      <p role="alert" className="px-3 py-2.5 rounded-lg border text-sm bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-100">
        {l("shownOnce")}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={l("sheetCaption")}>
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2 pr-3 font-semibold">{l("name")}</th>
              <th className="py-2 pr-3 font-semibold">{l("code")}</th>
              <th className="py-2 font-semibold">{l("tempPassword")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.learnerCode} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-3 text-slate-800 dark:text-slate-100">{r.fullName}</td>
                <td className="py-2 pr-3 font-mono font-semibold text-slate-900 dark:text-white">{r.learnerCode}</td>
                <td className="py-2 font-mono font-semibold text-slate-900 dark:text-white">{r.temporaryPassword}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={print} className="flex-1 gap-1.5">
          <Printer className="w-4 h-4" aria-hidden="true" /> {l("print")}
        </Button>
        <Button type="button" onClick={onDone} className="flex-1">{l("done")}</Button>
      </div>
    </div>
  )
}
