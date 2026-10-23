"use client"

// Adding learners to a course: find learners who already have an account (by name or learner
// code, or by email for the few who have one), or create accounts for new ones from a list of
// names. A name that may already have an account is shown first, so nobody gets two accounts.
// New accounts end on the class sheet (codes and temporary passwords, shown once).
import { useContext, useEffect, useState } from "react"
import DataContext from "@/context/DataContext"
import { useLanguage } from "@/context/LanguageContext"
import { fill } from "@/lib/fill"
import { GRADE_LEVELS } from "@/lib/grades"
import Modal from "@/components/ui/Modal"
import { Button } from "@/components/ui/button"
import JoinCodePanel from "@/components/teacher/JoinCodePanel"
import CredentialSheet from "@/components/teacher/CredentialSheet"

const INPUT = "w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-[var(--brand-secondary)]"
const LABEL = "block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5"

function MatchList({ matches, l }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {matches.map((m) => (
        <li key={m.id} className="text-xs text-slate-600 dark:text-slate-400">
          <span className="font-mono font-semibold">{m.learnerCode}</span>{m.grade ? ` · ${m.grade}` : ""}{m.inCourse ? ` · ${l("alreadyInCourse")}` : ""}
        </li>
      ))}
    </ul>
  )
}

function FindLearner({ courseId, onAdded, l, t }) {
  const { SERVER_URL } = useContext(DataContext)
  const [q, setQ] = useState("")
  const [results, setResults] = useState([])
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/learner-search?q=${encodeURIComponent(q.trim())}`)
      setResults(res.ok ? await res.json() : [])
    }, 250)
    return () => clearTimeout(timer)
  }, [q, courseId, SERVER_URL])

  const add = async (body) => {
    setError("")
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, role: "student" }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.message || t("teacher.dashboard.addStudentFailed")); return false }
    onAdded()
    return true
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="learner-search" className={LABEL}>{l("searchLabel")}</label>
        <input id="learner-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={l("searchPlaceholder")} className={INPUT} autoComplete="off" />
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg" aria-label={l("results")}>
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{r.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400"><span className="font-mono">{r.learnerCode}</span>{r.grade ? ` · ${r.grade}` : ""}</p>
                </div>
                {r.inCourse
                  ? <span className="text-xs text-slate-500">{l("alreadyInCourse")}</span>
                  : <Button type="button" size="sm" variant="outline" onClick={async () => { if (await add({ userId: r.id })) setResults((list) => list.map((x) => x.id === r.id ? { ...x, inCourse: true } : x)) }} aria-label={fill(l("addNamed"), { name: r.fullName })}>{l("add")}</Button>}
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && results.length === 0 && <p className="mt-2 text-xs text-slate-500">{l("noResults")}</p>}
      </div>

      <div>
        <label htmlFor="learner-email" className={LABEL}>{t("course.people.join.orEmail")}</label>
        <div className="flex gap-2">
          <input id="learner-email" aria-label={t("teacher.dashboard.studentEmail")} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={async (e) => { if (e.key === "Enter" && email.trim() && await add({ email: email.trim() })) setEmail("") }}
            placeholder={t("teacher.dashboard.studentEmail")} className={INPUT} />
          <Button type="button" variant="outline" disabled={!email.trim()} onClick={async () => { if (await add({ email: email.trim() })) setEmail("") }}>{l("add")}</Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    </div>
  )
}

function NewLearners({ courseId, onCreated, l, t }) {
  const { SERVER_URL } = useContext(DataContext)
  const [names, setNames] = useState("")
  const [grade, setGrade] = useState("")
  const [duplicates, setDuplicates] = useState(null) // possible duplicates, waiting for the teacher's choice
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const list = names.split("\n").map((n) => n.trim()).filter(Boolean)

  const submit = async (choice = "ask") => {
    setSaving(true)
    setError("")
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/learners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: list, grade, duplicates: choice }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.code === "POSSIBLE_DUPLICATES") { setDuplicates(data.duplicates); return }
      if (!res.ok) throw new Error(data.message || l("createFailed"))
      setDuplicates(null)
      onCreated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (duplicates) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-700 dark:text-slate-200">{l("maybeDuplicates")}</p>
        <ul className="space-y-2">
          {duplicates.map((d) => (
            <li key={d.name} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.name}</p>
              <MatchList matches={d.matches} l={l} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 dark:text-slate-400">{l("duplicatesHelp")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" onClick={() => submit("add")} disabled={saving} className="flex-1">{l("addExisting")}</Button>
          <Button type="button" variant="outline" onClick={() => submit("create")} disabled={saving} className="flex-1">{l("createAnyway")}</Button>
        </div>
        <button type="button" onClick={() => setDuplicates(null)} className="text-xs font-semibold text-slate-600 hover:underline">{l("back")}</button>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="new-learner-names" className={LABEL}>{l("namesLabel")}</label>
        <textarea id="new-learner-names" rows={6} value={names} onChange={(e) => setNames(e.target.value)} placeholder={l("namesPlaceholder")} className={INPUT} />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{fill(l("namesCount"), { count: list.length })}</p>
      </div>
      <div>
        <label htmlFor="new-learner-grade" className={LABEL}>{l("gradeLabel")}</label>
        <select id="new-learner-grade" value={grade} onChange={(e) => setGrade(e.target.value)} className={INPUT}>
          <option value="">{t("learner.profileSetup.selectLevel")}</option>
          {GRADE_LEVELS.map((g) => <option key={g.value} value={g.value}>{t(`learner.profileSetup.grades.${g.key}`)}</option>)}
        </select>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{l("newHelp")}</p>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <Button type="button" onClick={() => submit()} disabled={!list.length || !grade || saving} width="full">
        {saving ? l("creating") : fill(l("create"), { count: list.length })}
      </Button>
    </div>
  )
}

export default function AddLearners({ courseId, courseTitle, isDraft, showJoinCode = false, onClose, onChanged }) {
  const { SERVER_URL } = useContext(DataContext)
  const { t } = useLanguage()
  const l = (key) => t(`teacher.learners.${key}`)
  const [tab, setTab] = useState("find")
  const [result, setResult] = useState(null) // after creating: { created, added, ambiguous }

  const created = (data) => {
    setResult(data)
    onChanged()
  }

  const title = fill(t("teacher.dashboard.addStudentTo"), { course: courseTitle || "" })
  if (result) {
    return (
      <Modal title={title} onClose={onClose} size="lg" dirty>
        <div className="space-y-4">
          {result.added.length > 0 && <p className="text-sm text-emerald-700 dark:text-emerald-400">{fill(l("addedExisting"), { names: result.added.map((a) => a.fullName).join(", ") })}</p>}
          {result.ambiguous.length > 0 && (
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <p>{l("ambiguous")}</p>
              {result.ambiguous.map((a) => <div key={a.name} className="mt-1"><span className="font-medium">{a.name}</span><MatchList matches={a.matches} l={l} /></div>)}
            </div>
          )}
          {result.created.length > 0
            ? <CredentialSheet rows={result.created} courseTitle={courseTitle} onDone={onClose} />
            : <Button type="button" onClick={onClose} width="full">{l("done")}</Button>}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={title} onClose={onClose} size="lg">
      {showJoinCode && (
        <div className="mb-4">
          <JoinCodePanel SERVER_URL={SERVER_URL} courseId={courseId} isDraft={isDraft} />
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-4" role="group" aria-label={l("howLabel")}>
        {["find", "new"].map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${tab === key ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>
            {l(key === "find" ? "tabFind" : "tabNew")}
          </button>
        ))}
      </div>
      {tab === "find"
        ? <FindLearner courseId={courseId} onAdded={onChanged} l={l} t={t} />
        : <NewLearners courseId={courseId} onCreated={created} l={l} t={t} />}
    </Modal>
  )
}
