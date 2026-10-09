"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable, EmptyState } from "@/components/layout";
import { formatDate } from "@/lib/dates";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import Loader from "@/components/ui/Loader";

// Every course on this box, for admins (GET /courses/all).
export default function AllCourses({ serverUrl }) {
  const { t } = useLanguage();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!serverUrl) return;
    (async () => {
      try {
        const res = await fetch(`${serverUrl}/courses/all`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || t("admin.courses.loadFailed"));
        setCourses(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [serverUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!courses) return <Loader variant="page" size={48} className="min-h-[8rem]" />;
  if (courses.length === 0) {
    return <EmptyState compact title={t("admin.courses.emptyTitle")} description={t("admin.courses.emptyText")} />;
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
        placeholder={t("admin.courses.searchPlaceholder")}
        aria-label={t("admin.courses.searchLabel")}
        className="w-full sm:w-72 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-secondary)]"
      />
      <DataTable
        caption={t("admin.courses.caption")}
        rows={rows}
        empty={t("admin.courses.noMatch")}
        columns={[
          {
            key: "title",
            header: t("admin.courses.colCourse"),
            render: (c) => (
              <div className="min-w-0">
                <Link href={`/course/${c.id}/home`} className="font-semibold text-slate-900 hover:text-[var(--brand-secondary)] hover:underline">{c.title}</Link>
                <div className="text-xs text-slate-500">{fill(t("admin.courses.code"), { code: c.id })}{c.grade ? ` · ${c.grade}` : ""}</div>
              </div>
            ),
          },
          { key: "teachers", header: t("admin.courses.colTeacher"), hideOnMobile: true, render: (c) => <span className="text-xs text-slate-600">{c.teachers || "—"}</span> },
          { key: "lifecycle", header: t("admin.courses.colStatus"), render: (c) => <span className="text-xs font-semibold text-slate-700">{t(`admin.courses.lifecycle.${["draft", "open", "closed", "archived"].includes(c.lifecycle) ? c.lifecycle : "draft"}`)}</span> },
          { key: "learners", header: t("admin.courses.colLearners"), align: "right" },
          { key: "start_date", header: t("admin.courses.colStarts"), hideOnMobile: true, render: (c) => <span className="text-xs text-slate-600">{c.start_date ? formatDate(c.start_date) : t("admin.common.notSet")}</span> },
        ]}
      />
    </div>
  );
}
