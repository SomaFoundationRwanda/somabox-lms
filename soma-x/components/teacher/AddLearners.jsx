"use client"

// Adding learners to a course: find learners who already have an account (by name or learner
// code, or by email for the few who have one), or create accounts for new ones from a list of
// names. A name that may already have an account is shown first, so nobody gets two accounts.
// New accounts end on the class sheet (codes and temporary passwords, shown once).
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, getErrorMessage } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { useLanguage } from "@/context/LanguageContext"
import { fill } from "@/lib/fill"
import GradeSelect from "@/components/teacher/GradeSelect"
import Modal from "@/components/ui/Modal"
import { Button } from "@/components/ui/button"
import JoinCodePanel from "@/components/teacher/JoinCodePanel"
import CredentialSheet from "@/components/teacher/CredentialSheet"
import { ChoiceGroup, Field, TextInput, Textarea } from "@/components/form";


function MatchList({ matches, l }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {matches.map((m) => (
        <li key={m.id} className="text-caption text-fg-muted">
          <span className="font-mono font-semibold">{m.learnerCode}</span>{m.grade ? ` · ${m.grade}` : ""}{m.inCourse ? ` · ${l("alreadyInCourse")}` : ""}
        </li>
      ))}
    </ul>
  )
}

function FindLearner({ courseId, onAdded, l, t }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState([])
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    // Not kept: the results change with every pause in typing.
    const timer = setTimeout(async () => {
      const found = await apiFetch(`/courses/${courseId}/learner-search?q=${encodeURIComponent(q.trim())}`).catch(() => [])
      setResults(Array.isArray(found) ? found : [])
    }, 250)
    return () => clearTimeout(timer)
  }, [q, courseId])

  const add = async (body) => {
    setError("")
    try {
      await apiFetch(`/courses/${courseId}/people`, { method: "POST", json: { ...body, role: "student" } })
    } catch (err) {
      setError(err?.body?.message || (err?.status === 0 ? getErrorMessage(err, t) : t("teacher.dashboard.addStudentFailed")))
      return false
    }
    onAdded()
    return true
  }

  return (
    <div className="space-y-4">
      <Field id="learner-search" label={l("searchLabel")}>
        <TextInput type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={l("searchPlaceholder")} autoComplete="off" />
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-line border border-line rounded-lg" aria-label={l("results")}>
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-ui font-medium text-fg truncate">{r.fullName}</p>
                  <p className="text-caption text-fg-subtle"><span className="font-mono">{r.learnerCode}</span>{r.grade ? ` · ${r.grade}` : ""}</p>
                </div>
                {r.inCourse
                  ? <span className="text-caption text-fg-subtle">{l("alreadyInCourse")}</span>
                  : <Button type="button" size="sm" variant="outline" onClick={async () => { if (await add({ userId: r.id })) setResults((list) => list.map((x) => x.id === r.id ? { ...x, inCourse: true } : x)) }} aria-label={fill(l("addNamed"), { name: r.fullName })}>{l("add")}</Button>}
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 2 && results.length === 0 && <p className="mt-2 text-caption text-fg-subtle">{l("noResults")}</p>}
      </Field>

      <Field id="learner-email" label={t("course.people.join.orEmail")}>
        <div className="flex gap-2">
          <TextInput aria-label={t("teacher.dashboard.studentEmail")} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={async (e) => { if (e.key === "Enter" && email.trim() && await add({ email: email.trim() })) setEmail("") }}
            placeholder={t("teacher.dashboard.studentEmail")} />
          <Button type="button" variant="outline" disabled={!email.trim()} onClick={async () => { if (await add({ email: email.trim() })) setEmail("") }}>{l("add")}</Button>
        </div>
      </Field>
      {error && <p role="alert" className="text-ui text-danger-fg">{error}</p>}
    </div>
  )
}

// Learners of the course's class (and then of the same level) who aren't in it yet: added in one
// tap, without knowing their code.
function ClassLearners({ courseId, onAdded, l }) {
  const { data, isPending, refetch } = useQuery({
    queryKey: [...queryKeys.courseSection(courseId, "learner-suggestions")],
    queryFn: () => apiFetch(`/courses/${courseId}/learner-suggestions`),
  })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState("")
  const add = async (learner) => {
    setBusy(learner.id)
    setError("")
    try {
      await apiFetch(`/courses/${courseId}/people`, { method: "POST", json: { userId: learner.id, role: "student" } })
      onAdded()
      refetch()
    } catch (err) {
      setError(err?.body?.message || l("addFailed"))
    } finally {
      setBusy(null)
    }
  }
  const addAll = async (list) => {
    for (const learner of list) await add(learner)
  }
  if (isPending) return <p className="text-caption text-fg-subtle">{l("loadingClass")}</p>
  if (!data?.course?.grade) return <p className="text-ui text-fg-muted">{l("noCourseClass")}</p>
  const groups = [
    { key: "sameClass", title: fill(l("sameClass"), { grade: data.course.grade }), list: data.sameClass || [] },
    { key: "sameLevel", title: l("sameLevel"), list: data.sameLevel || [] },
  ]
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-ui font-semibold text-fg">{g.title} <span className="text-fg-subtle font-normal">({g.list.length})</span></h3>
            {g.key === "sameClass" && g.list.length > 1 ? (
              <Button type="button" size="sm" variant="outline" onClick={() => addAll(g.list)} disabled={!!busy}>{l("addAll")}</Button>
            ) : null}
          </div>
          {g.list.length === 0 ? <p className="text-caption text-fg-subtle">{l("noneHere")}</p> : (
            <ul className="divide-y divide-line border border-line rounded-lg max-h-64 overflow-y-auto">
              {g.list.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-ui font-medium text-fg truncate">{r.fullName}</span>
                    <span className="block text-caption text-fg-subtle">{[r.learnerCode, r.grade].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Button type="button" size="sm" variant="outline" disabled={busy === r.id} onClick={() => add(r)} aria-label={fill(l("addNamed"), { name: r.fullName })}>{l("add")}</Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {error && <p role="alert" className="text-ui text-danger-fg">{error}</p>}
    </div>
  )
}

// courseGrade: the course's class, the new learners' class unless the teacher picks another.
function NewLearners({ courseId, courseGrade = "", onCreated, l, t }) {
  const [names, setNames] = useState("")
  const [grade, setGrade] = useState(courseGrade)
  // "temporary": they choose their own password at first sign-in; "permanent": they keep this one.
  const [passwordMode, setPasswordMode] = useState("temporary")
  const { data: profile } = useQuery({ queryKey: queryKeys.profile, queryFn: () => apiFetch("/users/profile/view") })
  const classes = Array.isArray(profile?.teacher_classes) ? profile.teacher_classes : []
  const [duplicates, setDuplicates] = useState(null) // possible duplicates, waiting for the teacher's choice
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const list = names.split("\n").map((n) => n.trim()).filter(Boolean)

  const submit = async (choice = "ask") => {
    setSaving(true)
    setError("")
    try {
      let data
      try {
        data = await apiFetch(`/courses/${courseId}/learners`, { method: "POST", json: { names: list, grade, duplicates: choice, passwordMode } })
      } catch (err) {
        if (err?.code === "POSSIBLE_DUPLICATES") { setDuplicates(err.body.duplicates); return }
        throw new Error(err?.status === 0 ? getErrorMessage(err, t) : err?.body?.message || l("createFailed"))
      }
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
        <p className="text-ui text-fg-muted">{l("maybeDuplicates")}</p>
        <ul className="space-y-2">
          {duplicates.map((d) => (
            <li key={d.name} className="px-3 py-2 rounded-lg border border-line">
              <p className="text-ui font-medium text-fg">{d.name}</p>
              <MatchList matches={d.matches} l={l} />
            </li>
          ))}
        </ul>
        <p className="text-caption text-fg-subtle">{l("duplicatesHelp")}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" onClick={() => submit("add")} disabled={saving} className="flex-1">{l("addExisting")}</Button>
          <Button type="button" variant="outline" onClick={() => submit("create")} disabled={saving} className="flex-1">{l("createAnyway")}</Button>
        </div>
        <button type="button" onClick={() => setDuplicates(null)} className="text-caption font-semibold text-fg-muted hover:underline">{l("back")}</button>
        {error && <p role="alert" className="text-ui text-danger-fg">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Field id="new-learner-names" label={l("namesLabel")} hint={fill(l("namesCount"), { count: list.length })}>
        <Textarea rows={6} value={names} onChange={(e) => setNames(e.target.value)} placeholder={l("namesPlaceholder")} />
      </Field>
      <Field id="new-learner-grade" label={l("gradeLabel")}>
        <GradeSelect inField classes={classes} value={grade} onChange={setGrade} />
      </Field>
      <Field id="new-learner-passwords" label={l("passwordsLabel")}>
        <ChoiceGroup
          columns={2}
          size="sm"
          value={passwordMode}
          onChange={setPasswordMode}
          options={[
            { value: "temporary", label: l("passwordTemporary"), description: l("passwordTemporaryHelp") },
            { value: "permanent", label: l("passwordPermanent"), description: l("passwordPermanentHelp") },
          ]}
        />
      </Field>
      <p className="text-caption text-fg-subtle">{l("newHelp")}</p>
      {error && <p role="alert" className="text-ui text-danger-fg">{error}</p>}
      <Button type="button" onClick={() => submit()} disabled={!list.length || !grade || saving} width="full">
        {saving ? l("creating") : fill(l("create"), { count: list.length })}
      </Button>
    </div>
  )
}

export default function AddLearners({ courseId, courseTitle, courseGrade, isDraft, showJoinCode = false, initialTab, onClose, onChanged }) {
  const queryClient = useQueryClient()
  // Whoever shows this course's people or the course lists sees the new learners.
  const changed = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, "people") })
    queryClient.invalidateQueries({ queryKey: queryKeys.courses })
    onChanged?.()
  }
  const { t } = useLanguage()
  const l = (key) => t(`teacher.learners.${key}`)
  // A course with a class starts on its class's learners (no codes to know).
  const [tab, setTab] = useState(initialTab || (courseGrade ? "class" : "find"))
  const [result, setResult] = useState(null) // after creating: { created, added, ambiguous }

  const created = (data) => {
    setResult(data)
    changed()
  }

  const title = fill(t("teacher.dashboard.addStudentTo"), { course: courseTitle || "" })
  if (result) {
    return (
      <Modal title={title} onClose={onClose} size="lg" dirty>
        <div className="space-y-4">
          {result.added.length > 0 && <p className="text-ui text-success-fg">{fill(l("addedExisting"), { names: result.added.map((a) => a.fullName).join(", ") })}</p>}
          {result.ambiguous.length > 0 && (
            <div className="text-ui text-fg-muted">
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
          <JoinCodePanel courseId={courseId} isDraft={isDraft} />
        </div>
      )}
      <div className="flex items-center gap-1.5 mb-4" role="group" aria-label={l("howLabel")}>
        {["class", "find", "new"].map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
            className={`text-caption font-semibold px-3 py-1.5 rounded-full border ${tab === key ? "bg-brand-strong text-on-brand-strong border-brand-strong" : "border-line text-fg-muted"}`}>
            {l(key === "class" ? "tabClass" : key === "find" ? "tabFind" : "tabNew")}
          </button>
        ))}
      </div>
      {tab === "class"
        ? <ClassLearners courseId={courseId} onAdded={changed} l={l} />
        : tab === "find"
        ? <FindLearner courseId={courseId} onAdded={changed} l={l} t={t} />
        : <NewLearners courseId={courseId} courseGrade={courseGrade} onCreated={created} l={l} t={t} />}
    </Modal>
  )
}
