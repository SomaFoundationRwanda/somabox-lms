"use client";

import { createContext, useCallback, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import DataContext from "./DataContext";

const CourseContext = createContext(null);

// The course itself (title, dates, my role) and its menu, kept like every other course query
// under ["course", id]: a teacher's change reaches open browsers through live updates.
async function loadCourse(courseId) {
  try {
    return await apiFetch(`/courses/${courseId}`);
  } catch (err) {
    if (err?.code === "COURSE_NOT_OPEN") throw new Error("This course hasn't opened yet.");
    // Not a member: the page offers to join a public course, or says how to get in.
    const code = err?.body?.code;
    if (code === "NOT_ENROLLED" || code === "REMOVED") {
      throw Object.assign(new Error(err.body.message || "Not enrolled in this course"), { notEnrolled: code, publicCourse: err.body.course || null });
    }
    throw new Error(getErrorMessage(err) || "Failed to load course");
  }
}

export function CourseProvider({ courseId, children }) {
  const { SERVER_URL, user } = useContext(DataContext);
  const queryClient = useQueryClient();
  const userEmail = user?.email || "";
  const ready = !!courseId && !!userEmail;

  const courseQuery = useQuery({ queryKey: queryKeys.courseSection(courseId, "info"), queryFn: () => loadCourse(courseId), enabled: ready, retry: false });
  const navQuery = useQuery({ queryKey: queryKeys.courseSection(courseId, "nav"), queryFn: () => apiFetch(`/courses/${courseId}/nav`), enabled: ready });
  const course = courseQuery.data || null;
  const nav = Array.isArray(navQuery.data) ? navQuery.data : [];
  const loading = !ready || courseQuery.isPending || navQuery.isPending;
  const notEnrolled = courseQuery.error?.notEnrolled ? { code: courseQuery.error.notEnrolled, course: courseQuery.error.publicCourse } : null;
  const error = courseQuery.error?.message || (navQuery.isError && !notEnrolled ? getErrorMessage(navQuery.error) : "");

  // After a change that affects the whole course (settings, opening it): everything kept for it.
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) }),
    [queryClient, courseId],
  );

  // Staff: the course's teachers and assistants. Only its teachers run the course itself
  // (settings, dates, opening it, join code, passwords); assistants teach, grade and post.
  const isTeacher = course?.myRole === "teacher" || course?.myRole === "ta";
  const isCourseTeacher = course?.myRole === "teacher";
  // An admin reading a course they aren't in: read-only, plus a note that says so.
  const adminView = !!course?.adminView;
  // Observers can look at what a learner sees but can't hand in work, reply or post.
  const isObserver = course?.myRole === "observer" && !adminView;
  // A learner of this course (their own work, grades and progress).
  const isLearner = course?.myRole === "student";
  // Only looks: observers and admins reading the course.
  const readOnly = isObserver || adminView;
  // Can start discussions, reply, hand in work: staff, and learners until the course has ended.
  const ended = course?.lifecycle === "closed" || course?.lifecycle === "archived";
  const canTakePart = isTeacher || (isLearner && !ended);

  const value = {
    courseId,
    course,
    nav,
    loading,
    error,
    userEmail,
    SERVER_URL,
    notEnrolled,
    isTeacher,
    isCourseTeacher,
    isObserver,
    isLearner,
    readOnly,
    canTakePart,
    adminView,
    refresh,
  };

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useCourse must be used within a CourseProvider");
  return ctx;
}

/** The course context if inside a course, else null (never throws). */
export function useOptionalCourse() {
  return useContext(CourseContext);
}
