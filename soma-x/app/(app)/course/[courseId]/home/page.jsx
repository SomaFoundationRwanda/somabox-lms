"use client";

import Link from "next/link";
import { Bell, MessageSquare, Trophy } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";

const ACTIVITY_ICONS = { announcement: Bell, discussion: MessageSquare, grade: Trophy };

export default function CourseHomePage() {
  const { courseId, course, SERVER_URL } = useCourse();
  const homeType = course?.home_page_type || "modules";

  const modulesSection = useCourseSection("modules");
  const activitySection = useCourseSection(homeType === "activity" ? "activity" : "");

  return (
    <div>
      <Breadcrumbs sectionKey="home" />
      <div>
        {course?.coverImageUrl ? (
          <div className="w-full h-40 md:h-56 bg-slate-100">
            <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-full object-cover" />
          </div>
        ) : null}
        <div className="p-4 md:p-6 space-y-4">
          <h1 className="text-xl font-black text-slate-900">Welcome to {course?.title || "this course"}!</h1>
          {course?.description ? <p className="text-sm text-slate-600 whitespace-pre-wrap">{course.description}</p> : null}

          {homeType === "activity" ? (
            <div className="pt-2">
              <h2 className="text-sm font-bold text-slate-800 mb-2">Recent Activity</h2>
              <AsyncListState
                loading={activitySection.loading}
                error={activitySection.error}
                data={activitySection.data}
                onRetry={activitySection.refetch}
                emptyMessage="Nothing has happened in this course yet."
              >
                {(list) => (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {list.map((item) => {
                      const Icon = ACTIVITY_ICONS[item.type] || Bell;
                      return (
                        <div key={`${item.type}-${item.id}`} className="flex items-start gap-2.5 px-4 py-3">
                          <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700">{item.summary}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(item.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AsyncListState>
            </div>
          ) : (
            <div className="pt-2">
              <h2 className="text-sm font-bold text-slate-800 mb-2">Modules</h2>
              <AsyncListState
                loading={modulesSection.loading}
                error={modulesSection.error}
                data={modulesSection.data}
                onRetry={modulesSection.refetch}
                emptyMessage="No modules published yet."
              >
                {(list) => (
                  <div className="space-y-2">
                    {list.map((moduleRow) => (
                      <Link key={moduleRow.id} href={`/course/${courseId}/modules`} className="block rounded-xl border border-slate-200 hover:border-[#203A3A] px-4 py-3 transition-colors">
                        <p className="text-sm font-semibold text-slate-800">{moduleRow.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{(moduleRow.items || []).length} item{(moduleRow.items || []).length === 1 ? "" : "s"}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </AsyncListState>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
