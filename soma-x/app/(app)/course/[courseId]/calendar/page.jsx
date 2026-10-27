"use client";

import { useCallback, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import Link from "next/link";
import { CalendarDays, Download } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, EmptyState } from "@/components/layout";
import CalendarView from "@/components/calendar/CalendarView";
import { downloadFile } from "@/lib/download";
import { useCourseText } from "@/components/course/useCourseText";

export default function CourseCalendarPage() {
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { showToast } = useToast();
  const { t, tf, fmtDay } = useCourseText();
  const [range, setRange] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const queryClient = useQueryClient();

  // { today, startDate, events } for the range on screen; kept per range.
  const calendar = useQuery({
    queryKey: [...queryKeys.courseSection(courseId, "calendar"), range?.from, range?.to],
    queryFn: () => apiFetch(`/courses/${courseId}/calendar?${new URLSearchParams({ from: range.from, to: range.to })}`),
    enabled: !!courseId && !!range,
    placeholderData: keepPreviousData,
  });
  const data = calendar.data || null;
  const loading = calendar.isFetching;
  const error = calendar.isError ? calendar.error?.body?.message || t("calendar.loadFailed") : "";

  const handleRangeChange = useCallback(({ from, to }) => {
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const handleMove = async (event, date) => {
    if (!event.moduleItemId || event.type === "module") return;
    try {
      await apiFetch(`/courses/${courseId}/calendar/items/${event.moduleItemId}`, { method: "PATCH", json: { field: event.type, date } });
      showToast(tf("calendar.moved", { title: event.title, date: fmtDay(date) }), "success");
    } catch (err) {
      showToast(err?.body?.message || t("calendar.moveFailed"), "error");
    }
    // Dates show on the weeks, items and calendar alike.
    await queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
  };

  const downloadIcs = async () => {
    setDownloading(true);
    try {
      await downloadFile(`${SERVER_URL}/courses/${courseId}/calendar.ics`, `course-${courseId}.ics`);
    } catch (err) {
      showToast(err.message || t("calendar.downloadFailed"), "error");
    } finally {
      setDownloading(false);
    }
  };

  const noStartDate = data && !data.startDate;

  const downloadButton = (
    <button
      type="button"
      onClick={downloadIcs}
      disabled={downloading}
      className="flex items-center gap-1.5 text-caption font-semibold text-fg-muted border border-line hover:bg-surface-hover disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
      title={t("calendar.icsHelp")}
    >
      <Download className="w-3.5 h-3.5" aria-hidden="true" /> {downloading ? t("calendar.downloading") : t("calendar.downloadIcs")}
    </button>
  );

  return (
    <div>
      <Breadcrumbs sectionKey="calendar" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader help="pages.calendar"
          title={t("nav.calendar")}
          description={isTeacher ? t("calendar.courseDescription") : undefined}
          actions={noStartDate ? null : downloadButton}
        />

        {error && <p className="text-ui text-danger-fg" role="alert">{error}</p>}

        {noStartDate ? (
          <EmptyState
            compact
            icon={<CalendarDays className="w-8 h-8" aria-hidden="true" />}
            title={t("home.noDatesYet")}
            description={`${t("calendar.noStartDate")} ${isTeacher ? t("calendar.noStartTeacher") : t("calendar.noStartLearner")}`}
            action={isTeacher ? (
              <Link
                href={`/course/${courseId}/settings`}
                className="text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 rounded-lg px-3 py-2 transition-colors"
              >
                {t("calendar.setStart")}
              </Link>
            ) : null}
          />
        ) : (
          <CalendarView
            events={data?.events || []}
            today={data?.today}
            loading={loading}
            onRangeChange={handleRangeChange}
            onEventMove={isTeacher ? handleMove : undefined}
          />
        )}
      </div>
    </div>
  );
}
