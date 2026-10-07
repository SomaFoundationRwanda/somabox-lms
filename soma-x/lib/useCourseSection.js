"use client";

import { useCallback, useEffect, useState } from "react";
import { useCourse } from "@/context/CourseContext";

// Fetches GET /courses/:id/<path>, shared by every course content page.
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
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/${path}`);
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
