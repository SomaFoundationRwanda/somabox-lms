"use client";

import Link from "next/link";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, EmptyState } from "@/components/layout";
import MyProgress from "@/components/progress/MyProgress";

export default function ProgressPage() {
  const { courseId, isTeacher } = useCourse();
  if (isTeacher) {
    return (
      <div>
        <Breadcrumbs sectionKey="progress" />
        <div className="p-4 md:p-6 space-y-6 max-w-4xl">
          <PageHeader title="My progress" />
          <EmptyState
            compact
            title="My progress is for learners"
            description="Teachers can see every learner's progress in Insights."
            action={<Link href={`/course/${courseId}/insights`} className="text-xs font-semibold text-[#0D9488] hover:underline">Open Insights</Link>}
          />
        </div>
      </div>
    );
  }
  return <MyProgress sectionKey="progress" />;
}
