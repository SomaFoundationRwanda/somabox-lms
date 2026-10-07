"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import CalendarView from "@/components/calendar/CalendarView";
import { downloadFile } from "@/lib/download";
import { formatDate } from "@/lib/dates";

export default function CourseCalendarPage() {
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { showToast } = useToast();
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
      if (!res.ok) throw new Error(payload?.message || "Failed to load the calendar");
      if (id === requestId.current) setData(payload);
    } catch (err) {
      if (id === requestId.current) setError(err.message || "Failed to load the calendar");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [SERVER_URL, courseId, range]);

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
      if (!res.ok) throw new Error(payload?.message || "Could not move this date");
      showToast(`Moved "${event.title}" to ${formatDate(date)}`, "success");
    } catch (err) {
      showToast(err.message || "Could not move this date", "error");
    }
    await load();
  };

  const downloadIcs = async () => {
    setDownloading(true);
    try {
      await downloadFile(`${SERVER_URL}/courses/${courseId}/calendar.ics`, `course-${courseId}.ics`);
    } catch (err) {
      showToast(err.message || "Download failed", "error");
    } finally {
      setDownloading(false);
    }
  };

  const noStartDate = data && !data.startDate;

  return (
    <div>
      <Breadcrumbs sectionKey="calendar" />
      <div className="p-4 md:p-6 space-y-4">
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}

        {noStartDate ? (
          <div className="flex flex-col items-center text-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12">
            <CalendarDays className="w-8 h-8 text-slate-400" aria-hidden="true" />
            <h1 className="text-base font-bold text-slate-900">No dates yet</h1>
            <p className="text-sm text-slate-500 max-w-md">
              Module and due dates appear here once the course has a start date.
              {isTeacher ? " Set one in the course settings and every date is worked out from it." : " Your teacher hasn't set one yet."}
            </p>
            {isTeacher && (
              <Link
                href={`/course/${courseId}/settings`}
                className="text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2 transition-colors"
              >
                Set a start date
              </Link>
            )}
          </div>
        ) : (
          <CalendarView
            title="Calendar"
            events={data?.events || []}
            today={data?.today}
            loading={loading}
            onRangeChange={handleRangeChange}
            onEventMove={isTeacher ? handleMove : undefined}
            extraActions={
              <button
                type="button"
                onClick={downloadIcs}
                disabled={downloading}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
                title="Download a calendar file you can import into Google Calendar, Outlook, or your phone"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" /> {downloading ? "Downloading..." : "Download .ics"}
              </button>
            }
          />
        )}
      </div>
    </div>
  );
}
