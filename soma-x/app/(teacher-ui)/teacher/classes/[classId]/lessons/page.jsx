"use client"
import { useContext, useEffect, useMemo, useState } from "react"
import { EmptyState } from "@/components/ui/empty-state"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Circle, Clock, Eye, EyeOff, Pencil, Plus } from "lucide-react"
import DataContext from "@/context/DataContext"

export default function ClassLessonsPage() {
  const { SERVER_URL, unshiftString } = useContext(DataContext)
  const params = useParams()
  const classId = params?.classId

  const [lessons, setLessons] = useState([])
  const [className, setClassName] = useState("")
  const [loading, setLoading] = useState(true)

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("al")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  const loadLessons = async () => {
    if (!SERVER_URL || !teacherEmail || !classId) return
    try {
      const [classRes, lessonsRes] = await Promise.all([
        fetch(`${SERVER_URL}/classes/${classId}`),
        fetch(`${SERVER_URL}/classes/${classId}/lessons?teacherEmail=${encodeURIComponent(teacherEmail)}`),
      ])
      if (classRes.ok) setClassName((await classRes.json()).name || "")
      if (lessonsRes.ok) setLessons(await lessonsRes.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLessons() }, [SERVER_URL, teacherEmail, classId])

  const handleToggleVisibility = async (lesson) => {
    try {
      await fetch(`${SERVER_URL}/classes/${classId}/lessons/${lesson.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail, isVisible: !lesson.isVisibleToStudents }),
      })
      await loadLessons()
    } catch (err) { console.error(err) }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading...</p>

  return (
    <div>
      <Link
        href={`/teacher/classes?classId=${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Class
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Lessons</h1>
          {className && <p className="text-sm text-slate-400 mt-0.5">{className}</p>}
        </div>
        <Link href={`/manage/teacher/classes/${classId}/create-lesson`}>
          <button className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#2E8282] hover:bg-[#1f6767] rounded-lg px-3 py-2 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Create Lesson
          </button>
        </Link>
      </div>

      {lessons.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <div className="mb-3"><EmptyState message="No lessons yet." /></div>
          <Link href={`/manage/teacher/classes/${classId}/create-lesson`} className="text-sm text-[#2E8282] underline">
            Create your first lesson
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lessons.map((lesson) => {
            const finished = lesson.completedCount || 0
            const inProgress = Math.max(0, (lesson.startedCount || 0) - finished)
            const total = lesson.totalStudents || 0

            return (
              <div key={lesson.id} className="border border-slate-200 dark:border-slate-700/50 rounded-2xl bg-white dark:bg-[#0f1318] overflow-hidden">
                <Link
                  href={`/teacher/classes/${classId}/lessons/${lesson.id}`}
                  className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors block"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{lesson.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {lesson.stepCount} step{lesson.stepCount === 1 ? "" : "s"}
                      {lesson.dueAt && <> · Due {new Date(lesson.dueAt).toLocaleDateString()}</>}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2.5 py-0.5 rounded-full font-medium mt-0.5 ${
                    lesson.isVisibleToStudents ? "bg-green-100 text-green-700" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                  }`}>
                    {lesson.isVisibleToStudents ? "Visible" : "Hidden"}
                  </span>
                </Link>

                <div className="px-5 pb-4 flex items-center justify-between gap-4">
                  {total > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30 rounded-lg px-3 py-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-xs font-medium text-green-700">{finished}</span>
                        <span className="text-xs text-green-500">Completed</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-lg px-3 py-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-xs font-medium text-amber-700">{inProgress}</span>
                        <span className="text-xs text-amber-500">In Progress</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
                        <Circle className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{Math.max(0, total - (lesson.startedCount || 0))}</span>
                        <span className="text-xs text-slate-400">To Do</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No students yet</p>
                  )}

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleToggleVisibility(lesson)}
                      title={lesson.isVisibleToStudents ? "Hide from students" : "Show to students"}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      {lesson.isVisibleToStudents ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <Link href={`/manage/teacher/classes/${classId}/lessons/${lesson.id}/edit`}>
                      <button className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
