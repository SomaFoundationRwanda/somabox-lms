"use client"
import { useContext, useMemo, useState } from "react"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"
import Image from "next/image"
import { ChevronRight, Plus } from "lucide-react"
import DataContext from "@/context/DataContext"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import ProfileCompletionBanner from "@/components/notifications/ProfileCompletionBanner"
import CreateCourseModal from "@/components/teacher/CreateCourseModal"
import { useLanguage } from "@/context/LanguageContext"
import { fill } from "@/lib/fill"
import Loader from "@/components/ui/Loader";
import AddLearners from "@/components/teacher/AddLearners";

export default function TeacherDashboardPage() {
  const { SERVER_URL, user } = useContext(DataContext)
  const { t } = useLanguage()


  const [studentModal, setStudentModal] = useState(null) // courseId

  const [createModal, setCreateModal] = useState(false)

  const teacherEmail = user?.email || "";

  // The same kept list as every other "my courses" screen.
  const queryClient = useQueryClient()
  const mine = useQuery({ queryKey: queryKeys.myCourses, queryFn: () => apiFetch("/courses/mine"), enabled: !!teacherEmail })
  const courses = Array.isArray(mine.data) ? mine.data : []
  const loading = mine.isPending
  const load = () => queryClient.invalidateQueries({ queryKey: queryKeys.courses })


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
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] rounded-lg px-3 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t("teacher.common.newCourse")}
          </button>
        </div>

        <div className="flex gap-5 overflow-x-auto pb-3 no-scrollbar">
          {loading ? (
            <Loader variant="page" size={56} className="min-h-[14rem]" label={t("teacher.common.loading")} />
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
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1 hover:text-[var(--brand-secondary)] transition-colors cursor-pointer">{course.title}</p>
                  </Link>
                  <p className="text-xs text-slate-600 mb-4">{course.grade} · {fill(t((course.studentCount || 0) === 1 ? "teacher.common.oneStudent" : "teacher.common.manyStudents"), { count: course.studentCount || 0 })}</p>
                  <button
                    onClick={() => setStudentModal(course.id)}
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
        <AddLearners
          courseId={studentModal}
          courseTitle={courses.find((c) => c.id === studentModal)?.title || ""}
          isDraft={courses.find((c) => c.id === studentModal)?.lifecycle === "draft"}
          showJoinCode
          onClose={() => setStudentModal(null)}
          onChanged={load}
        />
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
