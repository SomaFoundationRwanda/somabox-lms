"use client"
import { useContext, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock, Eye, EyeOff, Minus,
} from "lucide-react"
import DataContext from "@/context/DataContext"

const AVATAR_COLORS = [
  "bg-teal-500", "bg-blue-500", "bg-purple-500",
  "bg-orange-500", "bg-rose-500", "bg-indigo-500",
]

function getAvatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name) {
  if (!name) return "?"
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function parseStepMetadata(step) {
  const raw = step?.metadata
  if (!raw) return {}
  if (typeof raw === "object") return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function getStepQuestions(step) {
  if (!step || step.step_type !== "question") return []
  const metadata = parseStepMetadata(step)
  const questions = Array.isArray(metadata.questions) ? metadata.questions : []
  if (questions.length > 0) {
    return questions.map((question, index) => ({
      prompt: String(question.prompt || `Question ${index + 1}`).trim(),
      questionType: question?.questionType === "multiple_choice" ? "multiple_choice" : "open",
      options: Array.isArray(question?.options) ? question.options.map((option) => String(option || "")) : [],
    }))
  }
  const fallbackPrompt = String(step?.body || "").trim()
  return fallbackPrompt ? [{ prompt: fallbackPrompt, questionType: String(metadata.questionType || "open"), options: Array.isArray(metadata.options) ? metadata.options : [] }] : []
}

function StatusBadge({ status }) {
  if (status === "completed") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" /> Finished
      </span>
    )
  }
  if (status === "in_progress") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 rounded-full">
        <Clock className="w-3 h-3" /> In Progress
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-2.5 py-0.5 rounded-full">
      <Minus className="w-3 h-3" /> Not Started
    </span>
  )
}

function StepPreview({ step, index, expanded, onToggle }) {
  const label = step.step_type === "question" ? "Question" : step.step_type === "checkpoint" ? "Checkpoint" : "Content"
  const labelColor =
    step.step_type === "question" ? "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20" :
    step.step_type === "checkpoint" ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" :
    "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50"
  const questions = getStepQuestions(step)

  return (
    <div className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <button
        type="button"
        onClick={() => onToggle(step.id)}
        className="w-full text-left flex items-start gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
      >
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${labelColor}`}>{label}</span>
            {step.title && <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{step.title}</p>}
          </div>
          {step.body && step.step_type !== "content" && (
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{step.body}</p>
          )}
          {step.step_type === "content" && step.fileUrl && (
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">{step.fileUrl}</p>
          )}
        </div>
        <span className="text-slate-400 dark:text-slate-500 text-xs font-semibold mt-1">
          {expanded ? "Collapse" : "View"}
        </span>
      </button>

      {expanded && (
        <div className="bg-slate-50 dark:bg-slate-900/50 px-5 py-4">
          {step.body && step.step_type !== "question" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Content</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{step.body}</p>
            </div>
          )}

          {step.step_type === "content" && step.fileUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">File</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-mono break-all">{step.fileUrl}</p>
            </div>
          )}

          {step.step_type === "question" && (
            <div className="space-y-4">
              {questions.length > 0 ? (
                questions.map((question, questionIndex) => (
                  <div key={questionIndex} className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 p-4">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{question.prompt}</p>
                    {question.options.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <p className="font-medium">Options:</p>
                        <ul className="list-disc list-inside">
                          {question.options.map((option, optionIndex) => (
                            <li key={optionIndex}>{option}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No question details available.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function LessonProgressPage() {
  const { SERVER_URL, unshiftString } = useContext(DataContext)
  const params = useParams()

  const classId = params?.classId
  const lessonId = params?.lessonId

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [steps, setSteps] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [expandedStepId, setExpandedStepId] = useState(null)

  const [visible, setVisible] = useState(null)
  const [visibilityLoading, setVisibilityLoading] = useState(false)

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("al")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  useEffect(() => {
    if (!SERVER_URL || !teacherEmail || !classId || !lessonId) return
    const load = async () => {
      try {
        const res = await fetch(
          `${SERVER_URL}/classes/${classId}/lessons/${lessonId}/student-progress?teacherEmail=${encodeURIComponent(teacherEmail)}`
        )
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.message || "Failed to load lesson progress")
          return
        }
        const json = await res.json()
        setData(json)
        setVisible(json.lesson?.isVisibleToStudents ?? null)
      } catch {
        setError("Something went wrong")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [SERVER_URL, teacherEmail, classId, lessonId])

  const handleTogglePreview = async () => {
    if (previewOpen) { setPreviewOpen(false); return }
    if (steps.length > 0) {
      setPreviewOpen(true)
      if (!expandedStepId && steps.length > 0) {
        setExpandedStepId(steps[0].id)
      }
      return
    }
    setPreviewLoading(true)
    try {
      const res = await fetch(
        `${SERVER_URL}/classes/${classId}/lessons/${lessonId}?teacherEmail=${encodeURIComponent(teacherEmail)}`
      )
      if (res.ok) {
        const json = await res.json()
        setSteps(json.steps || [])
        if (json.steps?.length > 0) {
          setExpandedStepId(json.steps[0].id)
        }
      }
    } catch { /* ignore */ }
    setPreviewLoading(false)
    setPreviewOpen(true)
  }

  const handleToggleVisibility = async () => {
    if (visibilityLoading || visible === null) return
    setVisibilityLoading(true)
    try {
      await fetch(`${SERVER_URL}/classes/${classId}/lessons/${lessonId}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail, isVisible: !visible }),
      })
      setVisible((v) => !v)
    } catch { /* ignore */ }
    setVisibilityLoading(false)
  }

  const grouped = useMemo(() => {
    if (!data?.students) return { finished: [], in_progress: [], not_started: [] }
    return {
      finished: data.students.filter((s) => s.status === "completed"),
      in_progress: data.students.filter((s) => s.status === "in_progress"),
      not_started: data.students.filter((s) => s.status === "not_started"),
    }
  }, [data])

  if (loading) return <p className="text-sm text-slate-400">Loading...</p>
  if (error) return <p className="text-sm text-red-500">{error}</p>

  const { finished, in_progress, not_started } = grouped
  const total = data?.students?.length || 0

  return (
    <div>
      <Link
        href={`/teacher/classes/${classId}/lessons`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Lessons
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">{data?.lesson?.title}</h1>
          {data?.lesson?.description && (
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">{data.lesson.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <Link
            href={`/teacher/classes/${classId}/lessons/${lessonId}/review`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-[#0f1318] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Grade submissions
          </Link>
          <button
            onClick={handleToggleVisibility}
            disabled={visibilityLoading || visible === null}
            title={visible ? "Hide from students" : "Show to students"}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
              visible
                ? "border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-[#0f1318] hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {visible ? "Visible" : "Hidden"}
          </button>
          <button
            onClick={handleTogglePreview}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-[#0f1318] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {previewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {previewOpen ? "Hide" : "Preview"}
          </button>
        </div>
      </div>

      {/* Lesson preview */}
      {previewOpen && (
        <div className="mb-6 border border-slate-200 dark:border-slate-700/50 rounded-2xl bg-white dark:bg-[#0f1318] overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Lesson Content</p>
            <span className="text-xs text-slate-400">{steps.length} step{steps.length === 1 ? "" : "s"}</span>
          </div>
          {previewLoading ? (
            <p className="px-5 py-4 text-sm text-slate-400">Loading steps...</p>
          ) : steps.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-400">No steps in this lesson.</p>
          ) : (
            <div className="px-5">
              {steps.map((step, i) => (
                <StepPreview
                  key={step.id}
                  step={step}
                  index={i}
                  expanded={expandedStepId === step.id}
                  onToggle={(stepId) => setExpandedStepId((current) => (current === stepId ? null : stepId))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary bar */}
      <div className="flex gap-4 mb-7">
        <div className="flex-1 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{finished.length}</p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">Finished</p>
        </div>
        <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{in_progress.length}</p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">In Progress</p>
        </div>
        <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{not_started.length}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Not Started</p>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm text-slate-400">No students enrolled in this class yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {[
            { label: "Finished", list: finished, status: "completed" },
            { label: "In Progress", list: in_progress, status: "in_progress" },
            { label: "Not Started", list: not_started, status: "not_started" },
          ].map(({ label, list, status }) =>
            list.length === 0 ? null : (
              <section key={status}>
                <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">{label} · {list.length}</h2>
                <div className="flex flex-col gap-2">
                  {list.map((student) => {
                    const name = student.full_name || student.scholar_email
                    return (
                      <Link
                        key={student.scholar_email}
                        href={`/teacher/classes/${classId}/lessons/${lessonId}/review?studentEmail=${encodeURIComponent(student.scholar_email)}`}
                        className="flex items-center gap-3 px-4 py-3 border border-slate-200 dark:border-slate-700/50 rounded-xl bg-white dark:bg-[#0f1318] hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                      >
                        <div className={`w-9 h-9 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                          {getInitials(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{student.scholar_email}</p>
                        </div>
                        <StatusBadge status={status} />
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          )}
        </div>
      )}
    </div>
  )
}
