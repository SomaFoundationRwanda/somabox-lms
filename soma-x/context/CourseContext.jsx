"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import DataContext from "./DataContext";

const CourseContext = createContext(null);

export function CourseProvider({ courseId, children }) {
  const { SERVER_URL, unshiftString } = useContext(DataContext);
  const [course, setCourse] = useState(null);
  const [nav, setNav] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const userEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  const refresh = useCallback(async () => {
    if (!SERVER_URL || !courseId || !userEmail) return;
    try {
      setLoading(true);
      setError("");
      const [courseRes, navRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}?userEmail=${encodeURIComponent(userEmail)}`),
        fetch(`${SERVER_URL}/courses/${courseId}/nav?userEmail=${encodeURIComponent(userEmail)}`),
      ]);
      const coursePayload = await courseRes.json();
      const navPayload = await navRes.json();

      if (!courseRes.ok) throw new Error(coursePayload.message || "Failed to load course");
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
