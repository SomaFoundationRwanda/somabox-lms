"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import DataContext from "./DataContext";

const CourseContext = createContext(null);

export function CourseProvider({ courseId, children }) {
  const { SERVER_URL, user } = useContext(DataContext);
  const [course, setCourse] = useState(null);
  const [nav, setNav] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const userEmail = user?.email || "";

  const refresh = useCallback(async () => {
    if (!SERVER_URL || !courseId || !userEmail) return;
    try {
      setLoading(true);
      setError("");
      const [courseRes, navRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}`),
        fetch(`${SERVER_URL}/courses/${courseId}/nav`),
      ]);
      const coursePayload = await courseRes.json().catch(() => ({}));
      const navPayload = await navRes.json().catch(() => ({}));

      if (!courseRes.ok) {
        if (courseRes.status === 403 && coursePayload?.code === "COURSE_NOT_OPEN") {
          throw new Error("This course hasn't opened yet.");
        }
        throw new Error(coursePayload.message || "Failed to load course");
      }
      if (!navRes.ok) throw new Error(navPayload.message || "Failed to load navigation");

      setCourse(coursePayload);
      setNav(Array.isArray(navPayload) ? navPayload : []);
    } catch (err) {
      console.error("Load course failed:", err);
      setError(err.message || "Failed to load course");
    } finally {
      setLoading(false);
    }
  }, [SERVER_URL, courseId, userEmail]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isTeacher = course?.myRole === "teacher" || course?.myRole === "ta";

  const value = {
    courseId,
    course,
    nav,
    loading,
    error,
    userEmail,
    SERVER_URL,
    isTeacher,
    refresh,
  };

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useCourse must be used within a CourseProvider");
  return ctx;
}
