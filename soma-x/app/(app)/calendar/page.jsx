"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import CalendarView from "@/components/calendar/CalendarView";
import { downloadFile } from "@/lib/download";
import { useCourseText } from "@/components/course/useCourseText";

export default function MyCalendarPage() {
  const { SERVER_URL, role, mounted } = useContext(DataContext);
  const { showToast } = useToast();
  const { t } = useCourseText();
  const isAdmin = role === "admin";
  const [scope, setScope] = useState("me"); // "me" | "school" (admins only)
  const [range, setRange] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const requestId = useRef(0);

  const activeScope = isAdmin ? scope : "me";

  const load = useCallback(async () => {
    if (!SERVER_URL || !range) return;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`${SERVER_URL}/calendar/${activeScope}?${qs}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || t("calendar.loadFailed"));
      if (id === requestId.current) setData(payload);
    } catch (err) {
      if (id === requestId.current) setError(err.message || t("calendar.loadFailed"));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [SERVER_URL, range, activeScope, t]);

  useEffect(() => { load(); }, [load]);

  const handleRangeChange = useCallback(({ from, to }) => {
    setRange((prev) => (prev && prev.from === from && prev.to === to ? prev : { from, to }));
  }, []);

  const downloadIcs = async () => {
    setDownloading(true);
    try {
      await downloadFile(`${SERVER_URL}/calendar/me.ics`, "my-calendar.ics");
    } catch (err) {
      showToast(err.message || t("calendar.downloadFailed"), "error");
    } finally {
      setDownloading(false);
    }
  };

  const actions = (
    <>
      {mounted && isAdmin && (
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" role="group" aria-label={t("calendar.whose")}>
          {[
            { id: "me", label: t("calendar.mine") },
            { id: "school", label: t("calendar.school") },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setScope(opt.id)}
              aria-pressed={scope === opt.id}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                scope === opt.id ? "bg-[#203A3A] text-white" : "text-slate-600 hover:text-slate-900"
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
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors"
          title={t("calendar.icsHelp")}
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" /> {downloading ? t("calendar.downloading") : t("calendar.downloadIcs")}
        </button>
      )}
    </>
  );

  return (
    <div className="py-4 pb-24 md:pb-8">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 space-y-3">
        <p className="text-xs text-slate-500">
          {activeScope === "school"
            ? t("calendar.schoolDescription")
            : t("calendar.myDescription")}
        </p>
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
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
