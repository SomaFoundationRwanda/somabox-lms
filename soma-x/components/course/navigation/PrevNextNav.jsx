"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseText } from "@/components/course/useCourseText";
import { startRouteLoading } from "@/components/global/RouteLoader";

export default function PrevNextNav({ courseId, itemType, contentId, moduleItemId }) {
  const router = useRouter();
  const { SERVER_URL, userEmail } = useCourse();
  const { t, tf } = useCourseText();
  const queryClient = useQueryClient();
  const query = moduleItemId
    ? `moduleItemId=${moduleItemId}`
    : `itemType=${encodeURIComponent(itemType)}&contentId=${contentId}`;
  const position = useQuery({
    queryKey: queryKeys.courseSection(courseId, `module-items/sequence-position/${query}`),
    queryFn: () => apiFetch(`/courses/${courseId}/module-items/sequence-position?${query}`),
    enabled: !!SERVER_URL && !!courseId && !!userEmail,
  });
  const positionData = position.data || null;
  const loading = position.isPending;

  if (loading || !positionData || positionData.total <= 0) return null;

  const { index, total, current, prev, next } = positionData;

  const handleNavigate = async (target) => {
    if (!target || !target.url) return;

    // Record progress on current item when advancing
    if (current?.module_item_id && SERVER_URL && userEmail) {
      apiFetch(`/courses/${courseId}/module-items/${current.module_item_id}/progress`, { method: "POST", json: {} })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, "my-progress") });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        })
        .catch(console.error);
    }

    startRouteLoading();
    router.push(target.url);
  };

  return (
    <div className="mt-8 pt-6 border-t border-line">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Previous Button */}
        {prev ? (
          <button
            type="button"
            onClick={() => handleNavigate(prev)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-line hover:border-line-strong bg-surface hover:bg-surface-hover text-fg-muted transition-all text-caption font-semibold shadow-sm group min-w-[140px]"
          >
            <ChevronLeft className="w-4 h-4 text-fg-subtle group-hover:text-fg-muted transition-colors shrink-0" />
            <div className="text-left min-w-0">
              <span className="block text-caption font-bold text-fg-subtle">{t("pageView.previous")}</span>
              <span className="truncate block font-bold text-fg group-hover:text-brand-fg transition-colors">
                {prev.title}
              </span>
            </div>
          </button>
        ) : (
          <div className="min-w-[140px]" />
        )}

        {/* Item Counter */}
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-sunken border border-line/80 text-caption font-semibold text-fg-muted shrink-0">
          <span>{tf("pageView.itemOf", { n: index, total })}</span>
        </div>

        {/* Next Button */}
        {next ? (
          <button
            type="button"
            onClick={() => handleNavigate(next)}
            className="flex items-center justify-end gap-2 px-4 py-2.5 rounded-xl border border-line hover:border-brand-strong bg-surface hover:bg-brand-strong text-fg-muted hover:text-on-brand transition-all text-caption font-semibold shadow-sm group min-w-[140px]"
          >
            <div className="text-right min-w-0">
              <span className="block text-caption font-bold text-fg-subtle group-hover:text-white/75 transition-colors">{t("pageView.next")}</span>
              <span className="truncate block font-bold text-fg group-hover:text-white transition-colors">
                {next.title}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-fg-subtle group-hover:text-white transition-colors shrink-0" />
          </button>
        ) : (
          <div className="min-w-[140px]" />
        )}
      </div>
    </div>
  );
}
