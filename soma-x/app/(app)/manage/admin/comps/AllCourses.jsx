"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable, EmptyState } from "@/components/layout";
import { formatDate } from "@/lib/dates";
import { courseLifecycleLabel } from "@/lib/moduleLabels";

// Every course on this box, for admins (GET /courses/all).
export default function AllCourses({ serverUrl }) {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!serverUrl) return;
    (async () => {
      try {
        const res = await fetch(`${serverUrl}/courses/all`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Couldn't load courses");
        setCourses(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [serverUrl]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!courses) return <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />;
  if (courses.length === 0) {
    return <EmptyState compact title="No courses yet" description="Courses appear here once a teacher creates one." />;
  }

  const q = filter.trim().toLowerCase();
  const rows = q
    ? courses.filter((c) => [c.title, c.id, c.teachers].some((v) => String(v || "").toLowerCase().includes(q)))
    : courses;

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search by title, code, or teacher"
        aria-label="Search courses"
        className="w-full sm:w-72 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
      />
      <DataTable
        caption="All courses"
        rows={rows}
        empty="No courses match your search."
        columns={[
          {
            key: "title",
            header: "Course",
            render: (c) => (
              <div className="min-w-0">
                <Link href={`/course/${c.id}/home`} className="font-semibold text-slate-900 hover:text-[#0D9488] hover:underline">{c.title}</Link>
                <div className="text-xs text-slate-500">Code {c.id}{c.grade ? ` · ${c.grade}` : ""}</div>
              </div>
            ),
          },
          { key: "teachers", header: "Teacher", hideOnMobile: true, render: (c) => <span className="text-xs text-slate-600">{c.teachers || "—"}</span> },
          { key: "lifecycle", header: "Status", render: (c) => <span className="text-xs font-semibold text-slate-700">{courseLifecycleLabel(c)}</span> },
          { key: "learners", header: "Learners", align: "right" },
          { key: "start_date", header: "Starts", hideOnMobile: true, render: (c) => <span className="text-xs text-slate-600">{c.start_date ? formatDate(c.start_date) : "Not set"}</span> },
        ]}
      />
    </div>
  );
}
