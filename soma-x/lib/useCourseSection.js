"use client";

import { useCallback, useEffect, useState } from "react";
import { useCourse } from "@/context/CourseContext";

// Fetches GET /courses/:id/<path> with userEmail attached, shared by every course content page.
export function useCourseSection(path) {
  const { SERVER_URL, courseId, userEmail } = useCourse();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    if (!SERVER_URL || !courseId || !userEmail || !path) return;
    try {
      setLoading(true);
      setError("");
      const separator = path.includes("?") ? "&" : "?";
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/${path}${separator}userEmail=${encodeURIComponent(userEmail)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || "Failed to load");
      setData(payload);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [SERVER_URL, courseId, userEmail, path]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, setData, loading, error, refetch };
}
