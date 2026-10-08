"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { DEFAULT_NAV_LABELS, useCourseText } from "@/components/course/useCourseText";

export default function Breadcrumbs({ sectionKey, itemName }) {
  const { courseId, course, nav } = useCourse();
  const { t, navLabel } = useCourseText();
  // The course's own label for this section (a teacher may have renamed it), translated
  // while it is still the default.
  const serverLabel = (nav || []).find((item) => item.navKey === sectionKey)?.label;
  const sectionLabel = DEFAULT_NAV_LABELS[sectionKey] ? navLabel(sectionKey, serverLabel) : null;

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 px-4 md:px-6 py-3 border-b border-slate-100 bg-white flex-wrap">
      <Link href={`/course/${courseId}/home`} className="font-semibold text-slate-700 hover:text-[#203A3A]">
        {course?.title || t("nav.course")}
      </Link>
      {sectionLabel ? (
        <>
          <ChevronRight className="w-3 h-3" />
          {itemName ? (
            <Link href={`/course/${courseId}/${sectionKey}`} className="hover:text-[#203A3A]">
              {sectionLabel}
            </Link>
          ) : (
            <span className="text-slate-700 font-medium">{sectionLabel}</span>
          )}
        </>
      ) : null}
      {itemName ? (
        <>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 font-medium truncate max-w-[16rem]">{itemName}</span>
        </>
      ) : null}
    </div>
  );
}
