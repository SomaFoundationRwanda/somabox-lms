"use client"
import { useContext, useEffect, useMemo, useState } from "react"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"
import Image from "next/image"
import { ChevronRight, Plus, X } from "lucide-react"
import DataContext from "@/context/DataContext"
import ProfileCompletionBanner from "@/components/notifications/ProfileCompletionBanner"
import CreateCourseModal from "@/components/teacher/CreateCourseModal"
import { useLanguage } from "@/context/LanguageContext"
import { fill } from "@/lib/fill"

function Modal({ title, onClose, children }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-[#0f1318] border border-transparent dark:border-slate-700/50 rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h3>
          <button aria-label={t("teacher.common.close")} onClick={onClose} className="text-slate-600 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function TeacherDashboardPage() {
  const { SERVER_URL, user } = useContext(DataContext)
  const { t } = useLanguage()

  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)

  const [studentModal, setStudentModal] = useState(null) // courseId
  const [studentEmail, setStudentEmail] = useState("")
  const [studentError, setStudentError] = useState("")
  const [studentLoading, setStudentLoading] = useState(false)

  const [createModal, setCreateModal] = useState(false)

  const teacherEmail = user?.email || "";

  const load = async () => {
    if (!SERVER_URL || !teacherEmail) return
    try {
      const res = await fetch(`${SERVER_URL}/courses/mine`)
      if (res.ok) setCourses(await res.json())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [SERVER_URL, teacherEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddStudent = async () => {
    if (!studentEmail.trim() || !studentModal) return
    setStudentError("")
    setStudentLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/courses/${studentModal}/people`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: studentEmail.trim(), role: "student" }),
      })
      const data = await res.json()
      if (!res.ok) { setStudentError(data.message || t("teacher.dashboard.addStudentFailed")); return }
      setStudentEmail("")
      setStudentModal(null)
      load()
    } catch {
      setStudentError(t("teacher.common.somethingWrong"))
    } finally {
      setStudentLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <ProfileCompletionBanner />

      <section>
        <div className="flex items-center justify-between mb-4">
          <Link href="/teacher/courses" className="inline-flex items-center gap-1 group">
            <h2 className="text-base font-semibold text-slate-700">{t("teacher.dashboard.courses")}</h2>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-600 transition-colors" />
          </Link>
          <button
            onClick={() => setCreateModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#2E8282] hover:bg-[#1f6767] rounded-lg px-3 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t("teacher.common.newCourse")}
          </button>
        </div>

        <div className="flex gap-5 overflow-x-auto pb-3 no-scrollbar">
          {loading ? (
            <p className="text-sm text-slate-600">{t("teacher.common.loading")}</p>
          ) : courses.length === 0 ? (
            <div className="w-full flex justify-center py-8"><EmptyState message={t("teacher.dashboard.noCourses")} /></div>
          ) : (
            courses.map((course) => (
              <div key={course.id} className="flex-shrink-0 w-72 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden bg-white dark:bg-[#0f1318] shadow-sm">
                <Link href={`/course/${course.id}/home`}>
                  <div className="w-full h-44 bg-slate-100 relative cursor-pointer">
                    <Image
                      src={course.coverImageUrl ? `${SERVER_URL}${course.coverImageUrl}` : "/imageFallback.png"}
                      alt={course.title}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                </Link>
                <div className="p-4">
                  <Link href={`/course/${course.id}/home`}>
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1 hover:text-[#2E8282] transition-colors cursor-pointer">{course.title}</p>
                  </Link>
                  <p className="text-xs text-slate-600 mb-4">{course.grade} · {fill(t((course.studentCount || 0) === 1 ? "teacher.common.oneStudent" : "teacher.common.manyStudents"), { count: course.studentCount || 0 })}</p>
                  <button
                    onClick={() => { setStudentModal(course.id); setStudentEmail(""); setStudentError("") }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t("teacher.dashboard.addStudent")} <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {studentModal && (
        <Modal title={fill(t("teacher.dashboard.addStudentTo"), { course: courses.find(c => c.id === studentModal)?.title || "" })} onClose={() => setStudentModal(null)}>
          <input aria-label={t("teacher.dashboard.studentEmail")}
            type="email"
            placeholder={t("teacher.dashboard.studentEmail")}
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddStudent()}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] mb-2"
          />
          {studentError && <p className="text-xs text-red-500 mb-2">{studentError}</p>}
          <button
            onClick={handleAddStudent}
            disabled={studentLoading || !studentEmail.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#2E8282] text-white hover:bg-[#1f6767] transition-colors disabled:opacity-50"
          >
            {studentLoading ? t("teacher.dashboard.adding") : t("teacher.dashboard.addStudent")}
          </button>
        </Modal>
      )}

      {createModal && (
        <CreateCourseModal
          SERVER_URL={SERVER_URL}
          onClose={() => setCreateModal(false)}
          onCreated={() => { setCreateModal(false); load() }}
        />
      )}
    </div>
  )
}
