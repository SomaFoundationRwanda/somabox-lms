"use client";

import { useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import DataContext from "@/context/DataContext";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { LoadingRows } from "@/components/insights/bits";
import TeacherAttendance from "@/components/attendance/TeacherAttendance";

// Teachers take attendance; admins can look but not mark. Learners' own record is on their
// Grades page, so an old link sends them there.
export default function AttendancePage() {
  const { courseId, isTeacher, course } = useCourse();
  const { role } = useContext(DataContext);
  const router = useRouter();
  const staff = isTeacher || role === "admin";
  useEffect(() => {
    if (course && !staff) router.replace(`/course/${courseId}/grades#attendance`);
  }, [course, staff, courseId, router]);

  return (
    <div>
      <Breadcrumbs sectionKey="attendance" />
      <div className="p-4 md:p-6 max-w-5xl">
        {!course ? <LoadingRows /> : staff ? <TeacherAttendance readOnly={!isTeacher} /> : <LoadingRows />}
      </div>
    </div>
  );
}
