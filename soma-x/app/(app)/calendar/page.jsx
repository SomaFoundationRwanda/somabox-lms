"use client";

import { useCallback, useContext, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Download } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import CalendarView from "@/components/calendar/CalendarView";
import { downloadFile } from "@/lib/download";
import { useCourseText } from "@/components/course/useCourseText";

export default function MyCalendarPage() {
  const { role, mounted } = useContext(DataContext);
  const { showToast } = useToast();
  const { t } = useCourseText();
  const isAdmin = role === "admin";
  const [scope, setScope] = useState("me"); // "me" | "school" (admins only)
  const [range, setRange] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const activeScope = isAdmin ? scope : "me";

  // Kept per scope and range; a course change (live updates) marks it out of date.
  const calendar = useQuery({
    queryKey: [...queryKeys.myCalendar, activeScope, range?.from, range?.to],
    queryFn: () => apiFetch(`/calendar/${activeScope}?${new URLSearchParams({ from: range.from, to: range.to })}`),
    enabled: !!range,
    placeholderData: keepPreviousData,
  });
  const data = calendar.data || null;
  const loading = calendar.isFetching;
  const error = calendar.isError ? (calendar.error?.body?.message || t("calendar.loadFailed")) : "";

  const handleRangeChange = useCallback(({ from, to }) => {
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const downloadIcs = async () => {
    setDownloading(true);
    try {
      await downloadFile("/calendar/me.ics", "my-calendar.ics");
    } catch (err) {
      showToast(err.message || t("calendar.downloadFailed"), "error");
    } finally {
      setDownloading(false);
    }
  };

  const actions = (
    <>
      {mounted && isAdmin && (
        <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface-sunken" role="group" aria-label={t("calendar.whose")}>
          {[
            { id: "me", label: t("calendar.mine") },
            { id: "school", label: t("calendar.school") },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScope(opt.id)}
              aria-pressed={scope === opt.id}
              className={`text-caption font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                scope === opt.id ? "bg-brand-strong text-on-brand-strong" : "text-fg-muted hover:text-fg"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {activeScope === "me" && (
        <button
          type="button"
          onClick={downloadIcs}
          disabled={downloading}
          className="flex items-center gap-1.5 text-caption font-semibold text-fg-muted border border-line bg-surface hover:bg-surface-hover disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
          title={t("calendar.icsHelp")}
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" /> {downloading ? t("calendar.downloading") : t("calendar.downloadIcs")}
        </button>
      )}
    </>
  );

  return (
    <div className="py-4 pb-24 md:pb-8">
      <div className="bg-surface rounded-2xl border border-line p-4 md:p-6 space-y-3">
        <p className="text-caption text-fg-subtle">
          {activeScope === "school"
            ? t("calendar.schoolDescription")
            : t("calendar.myDescription")}
        </p>
        {error && <p className="text-ui text-danger-fg" role="alert">{error}</p>}
        <CalendarView
          title={activeScope === "school" ? t("calendar.school") : t("calendar.mine")}
          events={data?.events || []}
          today={data?.today}
          loading={loading}
          onRangeChange={handleRangeChange}
          extraActions={actions}
        />
      </div>
    </div>
  );
}
