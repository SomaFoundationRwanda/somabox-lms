"use client";

import { useContext } from "react";
import DataContext from "@/context/DataContext";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { LoadingRows } from "@/components/insights/bits";
import TeacherAttendance from "@/components/attendance/TeacherAttendance";
import MyAttendance from "@/components/attendance/MyAttendance";

// Teachers take attendance; admins can look but not mark; learners see their own record.
export default function AttendancePage() {
  const { isTeacher, course } = useCourse();
  const { role } = useContext(DataContext);
  const staff = isTeacher || role === "admin";

  return (
    <div>
      <Breadcrumbs sectionKey="attendance" />
      <div className="p-4 md:p-6 max-w-5xl">
        {!course ? <LoadingRows /> : staff ? <TeacherAttendance readOnly={!isTeacher} /> : <MyAttendance />}
      </div>
    </div>
  );
}
