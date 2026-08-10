"use client"
import { useContext, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Plus } from "lucide-react"
import DataContext from "@/context/DataContext"
import { EmptyState } from "@/components/ui/empty-state"
import CreateCourseModal from "@/components/teacher/CreateCourseModal"

export default function TeacherCoursesPage() {
  const { SERVER_URL, unshiftString } = useContext(DataContext)
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("al")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  const load = async () => {
    if (!SERVER_URL || !teacherEmail) return
    setLoading(true)
    const res = await fetch(`${SERVER_URL}/courses/mine?userEmail=${encodeURIComponent(teacherEmail)}`)
    const data = await res.json()
    if (res.ok) setCourses(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [SERVER_URL, teacherEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Courses</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">Create and manage your courses.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#2E8282] hover:bg-[#1f6767] rounded-lg px-3 py-2 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Course
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Loading...</p>
      ) : courses.length === 0 ? (
        <div className="w-full flex justify-center py-8"><EmptyState message="No courses yet. Create your first course to get started." /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course) => (
            <Link key={course.id} href={`/course/${course.id}/home`} className="block border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden bg-white dark:bg-[#0f1318] shadow-sm hover:shadow-md transition-shadow">
              <div className="w-full h-32 bg-slate-100 relative">
                <Image
                  src={course.coverImageUrl ? `${SERVER_URL}${course.coverImageUrl}` : "/imageFallback.png"}
                  alt={course.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="p-4">
                <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">{course.title}</p>
                <p className="text-xs text-slate-600">{course.grade} · {course.studentCount} student{course.studentCount === 1 ? "" : "s"}</p>
                <p className="text-[10px] text-slate-400 mt-2">Course code: {course.id}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateCourseModal
          SERVER_URL={SERVER_URL}
          teacherEmail={teacherEmail}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load() }}
        />
      )}
    </div>
  )
}
