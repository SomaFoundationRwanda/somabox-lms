"use client"
import { useContext, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { LayoutGrid, Library, List, Plus, Users } from "lucide-react"
import DataContext from "@/context/DataContext"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { EmptyState } from "@/components/ui/empty-state"
import CreateCourseModal from "@/components/teacher/CreateCourseModal"
import { useLanguage } from "@/context/LanguageContext"
import { fill } from "@/lib/fill"
import Loader from "@/components/ui/Loader";

const VIEW_KEY = "somabox.teacherCourses.view"
const STATUS_STYLES = { draft: "text-warning-fg bg-warning-soft", open: "text-success-fg bg-success-soft", closed: "text-fg-muted bg-surface-sunken", archived: "text-fg-subtle bg-surface-sunken" }

// One course as a long, low row: its banner on the left, then the class (always visible), the
// title and subject, learners and status.
function CourseRow({ course, SERVER_URL, t }) {
  return (
    <Link href={`/course/${course.id}/home`} className="flex items-stretch border border-line rounded-xl overflow-hidden bg-surface hover:shadow-md hover:border-brand/40 transition-shadow min-h-[5.5rem]">
      <div className="relative w-28 sm:w-44 shrink-0 bg-surface-sunken">
        <Image src={course.coverImageUrl ? `${SERVER_URL}${course.coverImageUrl}` : "/imageFallback.png"} alt="" fill className="object-cover" unoptimized />
      </div>
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 px-3 sm:px-4 py-2.5">
        <span className="self-start sm:self-center shrink-0 text-ui font-extrabold text-brand-fg bg-brand-soft border border-brand/30 rounded-lg px-2.5 py-1">{course.grade || "—"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-item font-semibold text-fg truncate">{course.title}</p>
          <p className="text-caption text-fg-subtle truncate">{[course.subject, fill(t("teacher.courses.courseCode"), { code: course.id })].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="inline-flex items-center gap-1 text-caption text-fg-muted">
            <Users className="w-3.5 h-3.5" aria-hidden="true" /> {course.studentCount ?? 0}
          </span>
          {course.lifecycle ? (
            <span className={`text-caption font-semibold rounded-full px-2 py-0.5 ${STATUS_STYLES[course.lifecycle] || STATUS_STYLES.closed}`}>{t(`course.lifecycle.${course.lifecycle}`)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

export default function TeacherCoursesPage() {
  const { SERVER_URL, user } = useContext(DataContext)
  const { t } = useLanguage()
  const [createOpen, setCreateOpen] = useState(false)
  const [view, setView] = useState("cards")
  useEffect(() => {
    try { if (window.localStorage.getItem(VIEW_KEY) === "list") setView("list") } catch { /* storage unavailable */ }
  }, [])
  const pickView = (next) => {
    setView(next)
    try { window.localStorage.setItem(VIEW_KEY, next) } catch { /* storage unavailable */ }
  }

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
          <div role="group" aria-label={t("teacher.courses.viewLabel")} className="inline-flex rounded-lg border border-line p-0.5">
            {[["cards", LayoutGrid], ["list", List]].map(([key, Icon]) => (
              <button key={key} type="button" onClick={() => pickView(key)} aria-pressed={view === key}
                className={`inline-flex items-center gap-1.5 text-caption font-semibold rounded-md px-2.5 py-1.5 ${view === key ? "bg-brand-strong text-on-brand-strong" : "text-fg-muted hover:bg-surface-hover"}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {t(`teacher.courses.${key}View`)}
              </button>
            ))}
          </div>
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
      ) : view === "list" ? (
        <div className="space-y-3">
          {courses.map((course) => <CourseRow key={course.id} course={course} SERVER_URL={SERVER_URL} t={t} />)}
        </div>
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
