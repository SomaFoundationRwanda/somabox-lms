"use client"
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"
import GradeSelect from "@/components/teacher/GradeSelect"
import { useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { Field, TextInput, Textarea } from "@/components/form";

// Shared by every entry point that creates a course, so there's exactly one create-course UX.
export default function CreateCourseModal({ onClose, onCreated }) {
  const queryClient = useQueryClient()
  const { t } = useLanguage()
  const router = useRouter()
  const [form, setForm] = useState({ title: "", grade: "", description: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const dirty = Boolean(form.title.trim() || form.grade.trim() || form.description.trim())

  const handleSubmit = async () => {
    const resolvedGrade = form.grade.trim()
    if (!form.title.trim()) { setError(t("teacher.createCourse.titleRequired")); return }
    if (!resolvedGrade) { setError(t("teacher.createCourse.gradeRequired")); return }
    setError("")
    setLoading(true)
    try {
      let data
      try {
        data = await apiFetch("/courses", { method: "POST", json: { title: form.title.trim(), grade: resolvedGrade, description: form.description } })
      } catch (err) {
        if (err?.status === 0) throw err
        setError(err?.body?.message || t("teacher.createCourse.failed"))
        return
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.courses })
      onCreated?.(data)
      // Straight into the guided setup: a new course is a draft that needs outcomes, dates and weeks.
      if (data?.id) router.push(`/course/${data.id}/settings#guided-setup`)
    } catch {
      setError(t("teacher.common.somethingWrong"))
    } finally {
      setLoading(false)
    }
  }

  return (
    // Clicking outside closes only an untouched form, so a stray click doesn't lose the teacher's typing.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { if (!dirty) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">{t("teacher.createCourse.title")}</h3>
          <button aria-label={t("teacher.common.close")} onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label={t("teacher.createCourse.courseTitle")} required>
            <TextInput aria-label={t("teacher.createCourse.courseTitle")}
              placeholder={t("teacher.createCourse.titlePlaceholder")}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
          </Field>
          <Field label={t("teacher.createCourse.grade")} required>
            <GradeSelect value={form.grade} onChange={(grade) => setForm((p) => ({ ...p, grade }))} />
          </Field>
          <Field label={t("teacher.createCourse.description")}>
            <Textarea aria-label={t("teacher.createCourse.description")}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder={t("teacher.createCourse.descriptionPlaceholder")}
            />
          </Field>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-[var(--brand-secondary)] text-white hover:bg-[var(--brand-secondary-dark)] transition-colors disabled:opacity-50"
          >
            {loading ? t("teacher.createCourse.creating") : t("teacher.createCourse.create")}
          </button>
          <p className="text-xs text-slate-500 text-center">
            {t("teacher.createCourse.orBefore")}{" "}
            <Link href="/library/courses" className="font-semibold text-[var(--brand-secondary)] hover:underline">{t("teacher.createCourse.orLink")}</Link>
            {" "}{t("teacher.createCourse.orAfter")}
          </p>
        </div>
      </div>
    </div>
  )
}
