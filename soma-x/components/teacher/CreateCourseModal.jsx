"use client"
import { useState } from "react"
import { X } from "lucide-react"

const GRADE_OPTIONS = [
  { value: "P1", label: "Primary 1" },
  { value: "P2", label: "Primary 2" },
  { value: "P3", label: "Primary 3" },
  { value: "P4", label: "Primary 4" },
  { value: "P5", label: "Primary 5" },
  { value: "P6", label: "Primary 6" },
  { value: "S1", label: "Secondary 1" },
  { value: "S2", label: "Secondary 2" },
  { value: "S3", label: "Secondary 3" },
  { value: "S4", label: "Secondary 4" },
  { value: "S5", label: "Secondary 5" },
  { value: "S6", label: "Secondary 6" },
  { value: "other", label: "Other / mixed" },
]

// Shared by every entry point that creates a course, so there's exactly one create-course UX.
export default function CreateCourseModal({ SERVER_URL, teacherEmail, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", grade: "", gradeOther: "", description: "" })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    const resolvedGrade = form.grade === "other" ? form.gradeOther.trim() : form.grade
    if (!form.title.trim()) { setError("Course title is required"); return }
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
          teacherEmail,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || "Failed to create course"); return }
      onCreated?.(data)
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800">Create New Course</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Course Title *</label>
            <input
              type="text"
              placeholder="e.g. Grade 5 Mathematics"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282]"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Grade *</label>
            <select
              value={form.grade}
              onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] bg-white"
            >
              <option value="">Select grade/level</option>
              {GRADE_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            {form.grade === "other" && (
              <input
                type="text"
                placeholder="Describe the grade/level"
                value={form.gradeOther}
                onChange={(e) => setForm((p) => ({ ...p, gradeOther: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] mt-2"
              />
            )}
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              placeholder="What is this course about?"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading || !form.title.trim() || (!form.grade || (form.grade === "other" && !form.gradeOther.trim()))}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#2E8282] text-white hover:bg-[#1f6767] transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Course"}
          </button>
        </div>
      </div>
    </div>
  )
}
