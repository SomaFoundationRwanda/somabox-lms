"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { CourseProvider, useCourse } from "@/context/CourseContext";
import CourseSidebar, { CourseMenuButton } from "@/components/course/CourseSidebar";
import { useCourseOpened } from "@/lib/usage";
import Loader from "@/components/ui/Loader";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { NotEnrolled, SectionUnavailable } from "@/components/course/CourseAccess";
import CourseStatusBar from "@/components/course/CourseStatusBar";
import { DEFAULT_NAV_LABELS } from "@/components/course/useCourseText";

// Course sections that come from the course menu (course_nav_items). Learners, observers and
// admins reading the course reach a section only when it's in their menu; settings, insights,
// rubrics, files and collaborations are checked on every page under them too (item pages under
// pages/assignments/quizzes/discussions open from the weeks, so those are checked by the server).
const NAV_SECTIONS = new Set(Object.keys(DEFAULT_NAV_LABELS).filter((k) => !["ai", "progress"].includes(k)));
const CHECK_SUBPAGES = new Set(["settings", "insights", "rubrics", "files", "collaborations"]);

/**
 * Where this person should be sent instead, or whether the page is closed to them:
 * { redirect } | { unavailable: section } | null (show the page).
 */
function accessFor(pathname, { courseId, nav, isTeacher, isCourseTeacher, isLearner, adminView }) {
  const parts = pathname.split("/").filter(Boolean);
  const section = parts[2] || "";
  const top = parts.length <= 3;
  // One progress page per role: learners have My progress, staff and admins the class Insights.
  if (section === "progress" && !isLearner) return isTeacher || adminView ? { redirect: `/course/${courseId}/insights` } : { unavailable: "progress" };
  if (section === "insights" && isLearner) return { redirect: `/course/${courseId}/progress` };
  // Settings run the course: its teachers only, not assistants.
  if (section === "settings" && !isCourseTeacher) return { unavailable: "settings" };
  if (isTeacher || !NAV_SECTIONS.has(section) || !(top || CHECK_SUBPAGES.has(section))) return null;
  return nav.some((item) => item.navKey === section) ? null : { unavailable: section };
}

function CourseShell({ children }) {
  const courseState = useCourse();
  const { loading, error, course, courseId, adminView, notEnrolled } = courseState;
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname() || "";
  useCourseOpened(courseId, !!course);
  const access = course ? accessFor(pathname, courseState) : null;
  useEffect(() => {
    if (access?.redirect) router.replace(access.redirect);
  }, [access?.redirect, router]);

  if (loading && !course && !notEnrolled) {
    return (
      <Loader variant="page" className="min-h-[60vh]" />
    );
  }

  if (notEnrolled) return <NotEnrolled courseId={courseId} notEnrolled={notEnrolled} />;

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-4">
        <p className="text-ui font-semibold text-danger-fg">{error}</p>
      </div>
    );
  }

  return (
    // The course shell is the page itself, not a card: no border/radius/negative margin
    // (pages inside it use sections and lists, so nothing ends up boxed twice).
    // Below md the sidebar column is hidden and a "Course menu" button opens the same nav.
    <div className="flex min-h-full bg-surface">
      <CourseSidebar />
      <div className="flex-1 min-w-0">
        <CourseMenuButton />
        {adminView && (
          <p role="note" className="mx-4 sm:mx-6 mt-4 px-4 py-2.5 rounded-lg border text-ui bg-info-soft border-info/30 text-info-fg">
            {t("admin.courses.adminViewNote")}{" "}
            <Link href="/manage/admin" className="font-semibold underline underline-offset-2">{t("admin.courses.adminViewLink")}</Link>
          </p>
        )}
        {/* Staff see the course's status (and publish it) on every page. */}
        {courseState.isTeacher && !access?.unavailable ? <CourseStatusBar /> : null}
        {access?.unavailable ? <SectionUnavailable courseId={courseId} section={access.unavailable} />
          : access?.redirect ? <Loader variant="page" className="min-h-[60vh]" />
          : children}
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
