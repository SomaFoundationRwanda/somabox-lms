"use client"
import { useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"

const GRADE_OPTIONS = [
  { value: "P1", labelKey: "teacher.grades.P1" },
  { value: "P2", labelKey: "teacher.grades.P2" },
  { value: "P3", labelKey: "teacher.grades.P3" },
  { value: "P4", labelKey: "teacher.grades.P4" },
  { value: "P5", labelKey: "teacher.grades.P5" },
  { value: "P6", labelKey: "teacher.grades.P6" },
  { value: "S1", labelKey: "teacher.grades.S1" },
  { value: "S2", labelKey: "teacher.grades.S2" },
  { value: "S3", labelKey: "teacher.grades.S3" },
  { value: "S4", labelKey: "teacher.grades.S4" },
  { value: "S5", labelKey: "teacher.grades.S5" },
  { value: "S6", labelKey: "teacher.grades.S6" },
  { value: "other", labelKey: "teacher.grades.other" },
]

// Shared by every entry point that creates a course, so there's exactly one create-course UX.
export default function CreateCourseModal({ SERVER_URL, onClose, onCreated }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({ title: "", grade: "", gradeOther: "", description: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const resolvedGrade = form.grade === "other" ? form.gradeOther.trim() : form.grade
    if (!form.title.trim()) { setError(t("teacher.createCourse.titleRequired")); return }
    setError("")
    setLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          grade: resolvedGrade,
          description: form.description,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || t("teacher.createCourse.failed")); return }
      onCreated?.(data)
    } catch {
      setError(t("teacher.common.somethingWrong"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">{t("teacher.createCourse.title")}</h3>
          <button aria-label={t("teacher.common.close")} onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">{t("teacher.createCourse.courseTitle")} *</label>
            <input aria-label={t("teacher.createCourse.courseTitle")}
              type="text"
              placeholder={t("teacher.createCourse.titlePlaceholder")}
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282]"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">{t("teacher.createCourse.grade")} *</label>
            <select aria-label={t("teacher.createCourse.grade")}
              value={form.grade}
              onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] bg-white"
            >
              <option value="">{t("teacher.createCourse.selectGrade")}</option>
              {GRADE_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{t(g.labelKey)}</option>
              ))}
            </select>
            {form.grade === "other" && (
              <input aria-label={t("teacher.createCourse.describeGrade")}
                type="text"
                placeholder={t("teacher.createCourse.describeGrade")}
                value={form.gradeOther}
                onChange={(e) => setForm((p) => ({ ...p, gradeOther: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] mt-2"
              />
            )}
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">{t("teacher.createCourse.description")}</label>
            <textarea aria-label={t("teacher.createCourse.description")}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder={t("teacher.createCourse.descriptionPlaceholder")}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading || !form.title.trim() || (!form.grade || (form.grade === "other" && !form.gradeOther.trim()))}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#2E8282] text-white hover:bg-[#1f6767] transition-colors disabled:opacity-50"
          >
            {loading ? t("teacher.createCourse.creating") : t("teacher.createCourse.create")}
          </button>
          <p className="text-xs text-slate-500 text-center">
            {t("teacher.createCourse.orBefore")}{" "}
            <Link href="/library/courses" className="font-semibold text-[#2E8282] hover:underline">{t("teacher.createCourse.orLink")}</Link>
            {" "}{t("teacher.createCourse.orAfter")}
          </p>
        </div>
      </div>
    </div>
  )
}
