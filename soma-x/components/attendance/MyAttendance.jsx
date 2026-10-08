"use client";

import { useCallback, useEffect, useState } from "react";
import { useCourse } from "@/context/CourseContext";
import { PageHeader, Section, List, ListRow, EmptyState } from "@/components/layout";
import { LoadingRows, ErrorNote } from "@/components/insights/bits";
import { formatDate } from "@/lib/dates";
import { useAttendanceText, StatusChip, pct, attended } from "./text";

// A learner's own attendance: encouraging words, their sessions, no class comparison.
// A session where they weren't marked shows as "Not marked", never as absent.
export default function MyAttendance() {
  const { SERVER_URL, courseId } = useCourse();
  const { tx, txn } = useAttendanceText();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!SERVER_URL || !courseId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/attendance/me`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || tx("loadFailed"));
      setData(payload);
    } catch (err) {
      setError(err.message || tx("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [SERVER_URL, courseId, tx]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const counted = s?.counted || 0;
  const rate = s?.rate;
  const cheer = rate == null ? null : rate >= 0.9 ? tx("cheerHigh") : rate >= 0.75 ? tx("cheerMid") : tx("cheerLow");

  return (
    <div className="space-y-8">
      <PageHeader title={tx("myTitle")} description={tx("myDescription")} />
      {loading && !data ? (
        <LoadingRows />
      ) : error ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <>
          <Section>
            {counted > 0 ? (
              <div className="space-y-1">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{txn("youAttended", counted, { a: attended(s) })}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {tx("yourRate", { pct: pct(rate) })} {cheer}
                </p>
                {s.excused ? <p className="text-xs text-slate-500">{txn("excusedNote", s.excused)}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">{tx("myNothingYet")}</p>
            )}
          </Section>

          <Section title={tx("mySessions")}>
            {sessions.length === 0 ? (
              <EmptyState compact title={tx("myNoSessions")} />
            ) : (
              <List label={tx("mySessions")}>
                {sessions.map((x, i) => (
                  <ListRow
                    key={`${x.date}-${x.title}-${i}`}
                    title={x.title}
                    subtitle={[formatDate(x.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }), x.note].filter(Boolean).join(" · ")}
                    actions={<StatusChip status={x.status} />}
                  />
                ))}
              </List>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
