"use client"
import { useContext, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Library, Plus } from "lucide-react"
import DataContext from "@/context/DataContext"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { EmptyState } from "@/components/ui/empty-state"
import CreateCourseModal from "@/components/teacher/CreateCourseModal"
import { useLanguage } from "@/context/LanguageContext"
import { fill } from "@/lib/fill"
import Loader from "@/components/ui/Loader";

export default function TeacherCoursesPage() {
  const { SERVER_URL, user } = useContext(DataContext)
  const { t } = useLanguage()
  const [createOpen, setCreateOpen] = useState(false)

  const teacherEmail = user?.email || "";

  // The same kept list as every other "my courses" screen.
  const queryClient = useQueryClient()
  const mine = useQuery({ queryKey: queryKeys.myCourses, queryFn: () => apiFetch("/courses/mine"), enabled: !!teacherEmail })
  const courses = Array.isArray(mine.data) ? mine.data : []
  const loading = mine.isPending
  const load = () => queryClient.invalidateQueries({ queryKey: queryKeys.courses })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-section font-bold text-fg">{t("teacher.courses.title")}</h1>
          <p className="text-caption text-fg-muted">{t("teacher.courses.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/library/courses" className="flex items-center gap-1.5 text-caption font-medium text-brand-fg border border-brand/40 hover:bg-brand-soft rounded-lg px-3 py-2 transition-colors">
            <Library className="w-3.5 h-3.5" aria-hidden="true" /> {t("teacher.courses.fromShared")}
          </Link>
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 text-caption font-medium text-on-brand bg-brand hover:bg-brand/90 rounded-lg px-3 py-2 transition-colors">
            <Plus className="w-3.5 h-3.5" /> {t("teacher.common.newCourse")}
          </button>
        </div>
      </div>

      {loading ? (
        <Loader variant="page" label={t("teacher.common.loading")} />
      ) : courses.length === 0 ? (
        <div className="w-full flex justify-center py-8"><EmptyState message={t("teacher.courses.empty")} /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course) => (
            <Link key={course.id} href={`/course/${course.id}/home`} className="block border border-line rounded-2xl overflow-hidden bg-surface shadow-sm hover:shadow-md transition-shadow">
              <div className="w-full h-32 bg-surface-sunken relative">
                <Image
                  src={course.coverImageUrl ? `${SERVER_URL}${course.coverImageUrl}` : "/imageFallback.png"}
                  alt={course.title}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="p-4">
                <p className="text-item font-semibold text-fg-muted mb-1">{course.title}</p>
                <p className="text-caption text-fg-muted">{course.grade} · {fill(t(course.studentCount === 1 ? "teacher.common.oneStudent" : "teacher.common.manyStudents"), { count: course.studentCount ?? 0 })}</p>
                <p className="text-caption text-fg-subtle mt-2">{fill(t("teacher.courses.courseCode"), { code: course.id })}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateCourseModal
          SERVER_URL={SERVER_URL}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load() }}
        />
      )}
    </div>
  )
}
