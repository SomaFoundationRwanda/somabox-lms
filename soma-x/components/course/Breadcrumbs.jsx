"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { DEFAULT_NAV_LABELS, useCourseText } from "@/components/course/useCourseText";
import BackButton from "@/components/course/BackButton";

// Item pages a teacher reaches from Weeks lead back there, filtered to that kind of item.
// Assignments, quizzes and discussions lead back to their own lists (in teachers' menus).
const WEEK_TYPES = { pages: "page" };

export default function Breadcrumbs({ sectionKey: givenKey, itemName }) {
  const { courseId, course, nav, isTeacher } = useCourse();
  const { t, navLabel } = useCourseText();
  const viaWeeks = isTeacher && itemName && WEEK_TYPES[givenKey];
  const sectionKey = viaWeeks ? "modules" : givenKey;
  const sectionHref = viaWeeks ? `/course/${courseId}/modules?type=${WEEK_TYPES[givenKey]}` : `/course/${courseId}/${sectionKey}`;
  // The course's own label for this section (a teacher may have renamed it), translated
  // while it is still the default.
  const serverLabel = (nav || []).find((item) => item.navKey === sectionKey)?.label;
  const sectionLabel = DEFAULT_NAV_LABELS[sectionKey] ? navLabel(sectionKey, serverLabel) : null;

  return (
    <div className="flex items-center gap-1.5 text-caption text-fg-subtle px-4 md:px-6 py-3 border-b border-line bg-surface flex-wrap">
      <BackButton />
      <Link href={`/course/${courseId}/home`} className="font-semibold text-fg-muted hover:text-brand-fg">
        {course?.title || t("nav.course")}
      </Link>
      {sectionLabel ? (
        <>
          <ChevronRight className="w-3 h-3" />
          {itemName ? (
            <Link href={sectionHref} className="hover:text-brand-fg">
              {sectionLabel}
            </Link>
          ) : (
            <span className="text-fg-muted font-medium">{sectionLabel}</span>
          )}
        </>
      ) : null}
      {itemName ? (
        <>
          <ChevronRight className="w-3 h-3" />
          <span className="text-fg-muted font-medium truncate max-w-[16rem]">{itemName}</span>
        </>
      ) : null}
    </div>
  );
}
