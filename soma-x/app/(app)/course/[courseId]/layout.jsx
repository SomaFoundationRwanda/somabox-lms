"use client";

import { useContext } from "react";
import { useParams, usePathname } from "next/navigation";
import DataContext from "@/context/DataContext";
import { CourseProvider, useCourse } from "@/context/CourseContext";
import CourseSidebar, { CourseMenuButton } from "@/components/course/CourseSidebar";
import { useCourseOpened } from "@/lib/usage";
import Loader from "@/components/ui/Loader";

function CourseShell({ children }) {
  const { loading, error, course, courseId } = useCourse();
  const { role } = useContext(DataContext);
  const pathname = usePathname() || "";
  useCourseOpened(courseId, !!course);

  // Admins who aren't members of the course can still open its Insights (the insights API
  // allows admins); the rest of the course stays members-only.
  const adminInsights = role === "admin" && /^\/course\/[^/]+\/insights(\/|$)/.test(pathname);

  if (loading && !course) {
    return (
      <Loader variant="page" className="min-h-[60vh]" />
    );
  }

  if (error && adminInsights && !course) {
    return <div className="min-h-full bg-white dark:bg-transparent">{children}</div>;
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
        <p className="text-sm font-semibold text-rose-600">{error}</p>
      </div>
    );
  }

  return (
    // The course shell is the page itself, not a card: no border/radius/negative margin
    // (pages inside it use sections and lists, so nothing ends up boxed twice).
    // Below md the sidebar column is hidden and a "Course menu" button opens the same nav.
    <div className="flex min-h-full bg-white dark:bg-transparent">
      <CourseSidebar />
      <div className="flex-1 min-w-0">
        <CourseMenuButton />
        {children}
      </div>
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
