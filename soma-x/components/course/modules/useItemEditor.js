"use client";

// Creating and editing a week's items (page, assignment, quiz, discussion), shared by the Weeks
// page and the editor pages. Errors are shown as a toast and thrown, so an editor stays open.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseText } from "@/components/course/useCourseText";

const ERRORS = { page: "modules.errors.savePage", assignment: "modules.errors.saveAssignment", quiz: "modules.errors.saveQuiz", discussion: "modules.errors.addItem" };

/** The editor schedule fields from a week item ({ release_day, due_day, close_day }). */
export const itemDays = (item) => ({ release_day: item.release_day, due_day: item.due_day, close_day: item.close_day });

export function useItemEditor() {
  const { courseId } = useCourse();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useCourseText();

  // After a change to items: the weeks and everything that lists or counts them; not the
  // course's own details, menu or people.
  const invalidate = useCallback(() => queryClient.invalidateQueries({
    predicate: ({ queryKey: [scope, id, section] }) =>
      scope === "course" && id === String(courseId) && !["info", "nav", "people", "join-code", "ai"].includes(section),
  }), [queryClient, courseId]);

  const request = useCallback(async (path, options, fallbackError) => {
    let payload;
    try {
      payload = await apiFetch(path, options);
    } catch (err) {
      const message = err?.status === 0 ? getErrorMessage(err) : err?.body?.message || fallbackError;
      showToast(message, "error");
      throw new Error(message);
    }
    // e.g. a graded item saved unpublished because it has no outcome tag.
    if (payload?.notice) showToast(payload.notice, "info", 7000);
    return payload;
  }, [showToast]);

  /**
   * Saves an item: a new one in `moduleId` (no itemId), or the content of week item `itemId`.
   * For an assignment, `outcomeIds` are its tags and `outcomeIdsBefore` what it had.
   */
  const save = useCallback(async (type, { moduleId, itemId, contentId, outcomeIdsBefore = [] }, { outcomeIds = [], ...data }) => {
    const error = t(ERRORS[type] || "modules.errors.addItem");
    try {
      if (!itemId) {
        const body = { itemType: type, ...data, ...(type === "assignment" ? { outcomeIds } : {}) };
        return await request(`/courses/${courseId}/modules/${moduleId}/items`, { method: "POST", json: body }, error);
      }
      const saved = await request(`/courses/${courseId}/modules/${moduleId}/items/${itemId}/content`, { method: "PATCH", json: data }, error);
      // An assignment's outcome tags are saved separately, and only when they changed.
      if (type === "assignment" && [...outcomeIds].sort().join(",") !== [...outcomeIdsBefore].sort().join(",")) {
        await request(`/courses/${courseId}/item-outcomes`, { method: "POST", json: { itemType: "assignment", itemId: contentId, outcomeIds } }, error);
      }
      return saved;
    } finally {
      invalidate();
    }
  }, [courseId, request, invalidate, t]);

  /** The content of an item for its editor, fresh (also kept for the item's own page). */
  const load = useCallback((type, contentId) => {
    const path = `${type === "quiz" ? "quizzes" : `${type}s`}/${contentId}`;
    return queryClient.fetchQuery({
      queryKey: queryKeys.courseSection(courseId, path),
      queryFn: () => apiFetch(`/courses/${courseId}/${path}`),
      staleTime: 0,
    });
  }, [queryClient, courseId]);

  return { save, load, request, invalidate };
}

/** Where a teacher edits or adds an item (its own page). */
export const editItemHref = (courseId, type, contentId) => `/course/${courseId}/modules/edit?type=${type}&id=${contentId}`;
export const newItemHref = (courseId, moduleId, type, kind) => `/course/${courseId}/modules/new?week=${moduleId}&type=${type}${kind ? `&kind=${kind}` : ""}`;
