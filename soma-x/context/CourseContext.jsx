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
  const error = courseQuery.error?.message || (navQuery.isError ? getErrorMessage(navQuery.error) : "");

  // After a change that affects the whole course (settings, opening it): everything kept for it.
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) }),
    [queryClient, courseId],
  );

  const isTeacher = course?.myRole === "teacher" || course?.myRole === "ta";
  // Observers can look at everything a learner sees but can't hand in work or reply.
  const isObserver = course?.myRole === "observer";
  // An admin reading a course they aren't in: an observer, plus a note that says so.
  const adminView = !!course?.adminView;

  const value = {
    courseId,
    course,
    nav,
    loading,
    error,
    userEmail,
    SERVER_URL,
    isTeacher,
    isObserver,
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
