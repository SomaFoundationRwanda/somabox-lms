"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [data, setData] = useState(null); // { today, startDate, events }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!SERVER_URL || !courseId || !range) return;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/calendar?${qs}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || t("calendar.loadFailed"));
      if (id === requestId.current) setData(payload);
    } catch (err) {
      if (id === requestId.current) setError(err.message || t("calendar.loadFailed"));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [SERVER_URL, courseId, range, t]);

  useEffect(() => { load(); }, [load]);

  const handleRangeChange = useCallback(({ from, to }) => {
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const handleMove = async (event, date) => {
    if (!event.moduleItemId || event.type === "module") return;
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/calendar/items/${event.moduleItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: event.type, date }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || t("calendar.moveFailed"));
      showToast(tf("calendar.moved", { title: event.title, date: fmtDay(date) }), "success");
    } catch (err) {
      showToast(err.message || t("calendar.moveFailed"), "error");
    }
    await load();
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
      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/40 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
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
          description={t("calendar.courseDescription")}
          actions={noStartDate ? null : downloadButton}
        />

        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}

        {noStartDate ? (
          <EmptyState
            compact
            icon={<CalendarDays className="w-8 h-8" aria-hidden="true" />}
            title={t("home.noDatesYet")}
            description={`${t("calendar.noStartDate")} ${isTeacher ? t("calendar.noStartTeacher") : t("calendar.noStartLearner")}`}
            action={isTeacher ? (
              <Link
                href={`/course/${courseId}/settings`}
                className="text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] rounded-lg px-3 py-2 transition-colors"
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
