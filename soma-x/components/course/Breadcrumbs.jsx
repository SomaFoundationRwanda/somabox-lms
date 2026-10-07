"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCourse } from "@/context/CourseContext";

const SECTION_LABELS = {
  home: "Home",
  announcements: "Announcements",
  syllabus: "Syllabus",
  modules: "Modules",
  calendar: "Calendar",
  grades: "Grades",
  people: "People",
  assignments: "Assignments",
  rubrics: "Rubrics",
  files: "Files",
  collaborations: "Collaborations",
  outcomes: "Outcomes",
  quizzes: "Quizzes",
  pages: "Pages",
  discussions: "Discussions",
  settings: "Settings",
  ai: "AI drafts",
};

export default function Breadcrumbs({ sectionKey, itemName }) {
  const { courseId, course } = useCourse();
  const sectionLabel = SECTION_LABELS[sectionKey];

  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500 px-4 md:px-6 py-3 border-b border-slate-100 bg-white flex-wrap">
      <Link href={`/course/${courseId}/home`} className="font-semibold text-slate-700 hover:text-[#203A3A]">
        {course?.title || "Course"}
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
