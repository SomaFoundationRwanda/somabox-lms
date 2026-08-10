"use client";

import Link from "next/link";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function CourseHomePage() {
  const { courseId, course } = useCourse();
  const { data: modules, loading } = useCourseSection("modules");

  return (
    <div>
      <Breadcrumbs sectionKey="home" />
      <div>
        {course?.coverImageUrl ? (
          <div className="w-full h-40 md:h-56 bg-slate-100">
            <img src={course.coverImageUrl} alt={course.title} className="w-full h-full object-cover" />
          </div>
        ) : null}
        <div className="p-4 md:p-6 space-y-4">
          <h1 className="text-xl font-black text-slate-900">Welcome to {course?.title || "this course"}!</h1>
          {course?.description ? <p className="text-sm text-slate-600 whitespace-pre-wrap">{course.description}</p> : null}

          <div className="pt-2">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Modules</h2>
            {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
            {!loading && (!modules || modules.length === 0) ? <EmptyState message="No modules published yet." /> : null}
            <div className="space-y-2">
              {(modules || []).map((moduleRow) => (
                <Link key={moduleRow.id} href={`/course/${courseId}/modules`} className="block rounded-xl border border-slate-200 hover:border-[#203A3A] px-4 py-3 transition-colors">
                  <p className="text-sm font-semibold text-slate-800">{moduleRow.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{moduleRow.items.length} item{moduleRow.items.length === 1 ? "" : "s"}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
