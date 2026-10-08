"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseText } from "@/components/course/useCourseText";
import { startRouteLoading } from "@/components/global/RouteLoader";

export default function PrevNextNav({ courseId, itemType, contentId, moduleItemId }) {
  const router = useRouter();
  const { SERVER_URL, userEmail } = useCourse();
  const { t, tf } = useCourseText();
  const [positionData, setPositionData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SERVER_URL || !courseId || !userEmail) return;

    const fetchPosition = async () => {
      setLoading(true);
      try {
        const query = moduleItemId
          ? `moduleItemId=${moduleItemId}`
          : `itemType=${encodeURIComponent(itemType)}&contentId=${contentId}`;

        const res = await fetch(
          `${SERVER_URL}/courses/${courseId}/module-items/sequence-position?${query}`
        );
        if (res.ok) {
          const data = await res.json();
          setPositionData(data);
        }
      } catch (err) {
        console.error("Failed to load sequence position:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosition();
  }, [SERVER_URL, courseId, itemType, contentId, moduleItemId, userEmail]);

  if (loading || !positionData || positionData.total <= 0) return null;

  const { index, total, current, prev, next } = positionData;

  const handleNavigate = async (target) => {
    if (!target || !target.url) return;

    // Record progress on current item when advancing
    if (current?.module_item_id && SERVER_URL && userEmail) {
      fetch(`${SERVER_URL}/courses/${courseId}/module-items/${current.module_item_id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(console.error);
    }

    startRouteLoading();
    router.push(target.url);
  };

  return (
    <div className="mt-8 pt-6 border-t border-slate-200">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Previous Button */}
        {prev ? (
          <button
            type="button"
            onClick={() => handleNavigate(prev)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all text-xs font-semibold shadow-sm group min-w-[140px]"
          >
            <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
            <div className="text-left min-w-0">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">{t("pageView.previous")}</span>
              <span className="truncate block font-bold text-slate-800 group-hover:text-[#203A3A] transition-colors">
                {prev.title}
              </span>
            </div>
          </button>
        ) : (
          <div className="min-w-[140px]" />
        )}

        {/* Item Counter */}
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-600 shrink-0">
          <span>{tf("pageView.itemOf", { n: index, total })}</span>
        </div>

        {/* Next Button */}
        {next ? (
          <button
            type="button"
            onClick={() => handleNavigate(next)}
            className="flex items-center justify-end gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-[#203A3A] bg-white hover:bg-[#203A3A] text-slate-700 hover:text-white transition-all text-xs font-semibold shadow-sm group min-w-[140px]"
          >
            <div className="text-right min-w-0">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-teal-200 transition-colors">{t("pageView.next")}</span>
              <span className="truncate block font-bold text-slate-800 group-hover:text-white transition-colors">
                {next.title}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors shrink-0" />
          </button>
        ) : (
          <div className="min-w-[140px]" />
        )}
      </div>
    </div>
  );
}
