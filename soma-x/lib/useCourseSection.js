"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCourse } from "@/context/CourseContext";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/**
 * GET /courses/:id/<path>, shared by every course content page: kept under ["course", id, ...path]
 * (so two components asking for the same section share one request). `setData` changes the kept
 * copy after an edit; `refetch` asks the box again.
 */
export function useCourseSection(path) {
  const { courseId, userEmail } = useCourse();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.courseSection(courseId, path);
  const query = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/courses/${courseId}/${path}`),
    enabled: !!courseId && !!userEmail && !!path,
  });
  const setData = useCallback(
    (next) => queryClient.setQueryData(queryKey, next),
    [queryClient, queryKey.join("/")], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return {
    data: query.data ?? null,
    setData,
    loading: query.isPending,
    error: query.isError ? getErrorMessage(query.error) : "",
    refetch: query.refetch,
  };
}
