"use client";

import Link from "next/link";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, EmptyState } from "@/components/layout";
import MyProgress from "@/components/progress/MyProgress";
import { useProgressText } from "@/components/progress/text";

export default function ProgressPage() {
  const { courseId, isTeacher } = useCourse();
  const { tp } = useProgressText();
  if (isTeacher) {
    return (
      <div>
        <Breadcrumbs sectionKey="progress" />
        <div className="p-4 md:p-6 space-y-6 max-w-4xl">
          <PageHeader title={tp("common.myProgress")} />
          <EmptyState
            compact
            title={tp("progressPage.teacherTitle")}
            description={tp("progressPage.teacherHint")}
            action={<Link href={`/course/${courseId}/insights`} className="text-xs font-semibold text-[#0D9488] hover:underline">{tp("progressPage.openInsights")}</Link>}
          />
        </div>
      </div>
    );
  }
  return <MyProgress sectionKey="progress" />;
}
