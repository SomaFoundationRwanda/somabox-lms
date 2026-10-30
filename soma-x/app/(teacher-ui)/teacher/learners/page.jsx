"use client"

// The teacher's learners, across the courses they teach: create sign-in accounts for new learners
// and give a learner a new temporary password, without going into each course's People page.
import { useMemo, useState } from "react"
import { KeyRound, UserPlus } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, getErrorMessage } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { useLanguage } from "@/context/LanguageContext"
import { useToast } from "@/context/ToastContext"
import { fill } from "@/lib/fill"
import { Select, TextInput } from "@/components/form"
import { EmptyState } from "@/components/ui/empty-state"
import Loader from "@/components/ui/Loader"
import Modal from "@/components/ui/Modal"
import AddLearners from "@/components/teacher/AddLearners"
import CredentialSheet from "@/components/teacher/CredentialSheet"

export default function TeacherLearnersPage() {
  const { t } = useLanguage()
  const l = (key) => t(`teacher.learners.${key}`)
  const lp = (key) => t(`teacher.learnersPage.${key}`)
  const { showToast } = useToast()
  const queryClient = useQueryClient()

  const mine = useQuery({ queryKey: queryKeys.myCourses, queryFn: () => apiFetch("/courses/mine") })
  // Only the courses they teach: that's where they create accounts and reset passwords.
  const courses = useMemo(() => (Array.isArray(mine.data) ? mine.data : []).filter((c) => c.my_role === "teacher"), [mine.data])
  // One row per learner, with their courses and where their password can be reset.
  const list = useQuery({ queryKey: queryKeys.myLearners, queryFn: () => apiFetch("/courses/mine/learners") })
  const learners = Array.isArray(list.data) ? list.data : []
  const loading = mine.isPending || list.isPending

  const [search, setSearch] = useState("")
  const [courseFilter, setCourseFilter] = useState("")
  const shown = learners.filter((r) => {
    if (courseFilter && !r.courses.some((c) => String(c.id) === courseFilter)) return false
    const q = search.trim().toLowerCase()
    return !q || [r.fullName, r.learnerCode, r.className].some((v) => String(v || "").toLowerCase().includes(q))
  })

  // Creating accounts: first which course they join, then the usual "New learners" form.
  const [picking, setPicking] = useState(false)
  const [pickedCourse, setPickedCourse] = useState("")
  const [creatingFor, setCreatingFor] = useState(null)
  const startCreate = () => {
    if (courses.length === 1) setCreatingFor(courses[0])
    else { setPickedCourse(courseFilter || ""); setPicking(true) }
  }

  const [resetDone, setResetDone] = useState(null)
  const resetPassword = async (row) => {
    if (!window.confirm(fill(l("resetConfirm"), { name: row.fullName }))) return
    try {
      const sheet = await apiFetch(`/courses/${row.resetIn.courseId}/people/${row.resetIn.enrollmentId}/reset-password`, { method: "POST" })
      setResetDone(sheet)
    } catch (err) {
      showToast(err?.body?.message || (err?.status === 0 ? getErrorMessage(err) : l("resetFailed")), "error")
    }
  }

  const courseOptions = courses.map((c) => ({ value: String(c.id), label: [c.grade, c.title].filter(Boolean).join(" · ") }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-section font-bold text-fg">{lp("title")}</h1>
          <p className="text-caption text-fg-muted">{lp("subtitle")}</p>
        </div>
        <button onClick={startCreate} disabled={!courses.length} className="flex items-center gap-1.5 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 rounded-lg px-3 py-2 disabled:opacity-50">
          <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> {lp("createAccounts")}
        </button>
      </div>

      {learners.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lp("search")} aria-label={lp("search")} className="flex-1 min-w-[200px]" />
          {courses.length > 1 && (
            <Select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} aria-label={lp("course")} options={[{ value: "", label: lp("allCourses") }, ...courseOptions]} />
          )}
        </div>
      )}

      {loading ? (
        <Loader variant="page" label={t("teacher.common.loading")} />
      ) : !courses.length ? (
        <div className="w-full flex justify-center py-8"><EmptyState message={lp("noCourses")} /></div>
      ) : !shown.length ? (
        <div className="w-full flex justify-center py-8"><EmptyState message={learners.length ? lp("noMatch") : lp("empty")} /></div>
      ) : (
        <div className="overflow-x-auto border border-line rounded-xl">
          <table className="w-full text-ui">
            <caption className="sr-only">{lp("title")}</caption>
            <thead>
              <tr className="text-left text-caption text-fg-subtle border-b border-line">
                <th className="py-2 px-3 font-semibold">{l("name")}</th>
                <th className="py-2 px-3 font-semibold">{l("code")}</th>
                <th className="py-2 px-3 font-semibold hidden sm:table-cell">{lp("class")}</th>
                <th className="py-2 px-3 font-semibold hidden md:table-cell">{lp("courses")}</th>
                <th className="py-2 px-3 font-semibold text-right"><span className="sr-only">{lp("actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2 px-3 font-medium text-fg">{r.fullName || "—"}</td>
                  <td className="py-2 px-3 font-mono text-fg-muted">{r.learnerCode || "—"}</td>
                  <td className="py-2 px-3 text-fg-muted hidden sm:table-cell">{r.className || "—"}</td>
                  <td className="py-2 px-3 text-fg-muted hidden md:table-cell">{r.courses.map((c) => c.title).join(", ")}</td>
                  <td className="py-2 px-3 text-right">
                    {r.resetIn ? (
                      <button onClick={() => resetPassword(r)} aria-label={fill(l("resetNamed"), { name: r.fullName || r.learnerCode || "" })}
                        className="inline-flex items-center gap-1.5 text-caption font-semibold text-fg-muted border border-line hover:bg-surface-hover rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                        <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> {l("resetPassword")}
                      </button>
                    ) : (
                      <span className="text-caption text-fg-subtle" title={lp("otherClassHelp")}>{lp("otherClass")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking && (
        <Modal title={lp("createAccounts")} onClose={() => setPicking(false)}>
          <div className="space-y-4">
            <p className="text-ui text-fg-muted">{lp("pickCourse")}</p>
            <Select value={pickedCourse} onChange={(e) => setPickedCourse(e.target.value)} aria-label={lp("course")} placeholder={lp("chooseCourse")} options={courseOptions} />
            <button
              type="button"
              disabled={!pickedCourse}
              onClick={() => { setPicking(false); setCreatingFor(courses.find((c) => String(c.id) === pickedCourse)) }}
              className="w-full text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              {lp("continue")}
            </button>
          </div>
        </Modal>
      )}

      {creatingFor && (
        <AddLearners
          courseId={creatingFor.id}
          courseTitle={creatingFor.title}
          courseGrade={creatingFor.grade || ""}
          initialTab="new"
          onClose={() => setCreatingFor(null)}
          onChanged={() => queryClient.invalidateQueries({ queryKey: queryKeys.myLearners })}
        />
      )}

      {resetDone && (
        <Modal title={fill(l("resetTitle"), { name: resetDone.fullName })} onClose={() => setResetDone(null)} size="lg" dirty>
          <CredentialSheet rows={[resetDone]} courseTitle={lp("title")} onDone={() => setResetDone(null)} />
        </Modal>
      )}
    </div>
  )
}
