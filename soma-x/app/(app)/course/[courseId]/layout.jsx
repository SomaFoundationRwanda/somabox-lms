"use client";

import { useParams } from "next/navigation";
import { CourseProvider, useCourse } from "@/context/CourseContext";
import CourseSidebar from "@/components/course/CourseSidebar";

function CourseShell({ children }) {
  const { loading, error, course } = useCourse();

  if (loading && !course) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-[3px] border-slate-200 border-t-[#203A3A] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
        <p className="text-sm font-semibold text-rose-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full bg-white rounded-2xl border border-slate-200 overflow-hidden -mx-[1%]">
      <CourseSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function CourseLayout({ children }) {
  const params = useParams();
  const courseId = String(params?.courseId || "");

  return (
    <CourseProvider courseId={courseId}>
      <CourseShell>{children}</CourseShell>
    </CourseProvider>
  );
}
