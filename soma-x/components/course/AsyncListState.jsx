"use client";

import { RefreshCcw } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseText } from "@/components/course/useCourseText";

// Enforces the loading -> error -> empty -> data sequence structurally, so no page
// can accidentally .map() over null/undefined while a fetch is still in flight or
// has failed. Every list-rendering course page should render through this instead
// of hand-rolling its own ternary.
export default function AsyncListState({ loading, error, data, onRetry, emptyMessage, emptyAction, skeletonRows = 3, children }) {
  const { t } = useCourseText();
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
        <p className="text-sm text-rose-700">{error}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 shrink-0"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> {t("common.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <EmptyState compact title={emptyMessage || t("common.nothingHere")} action={emptyAction || null} />
    );
  }

  return children(data);
}
