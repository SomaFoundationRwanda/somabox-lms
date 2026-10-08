"use client";

import Link from "next/link";
import { Clock, TrendingUp } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, DataTable, EmptyState } from "@/components/layout";
import { formatDate } from "@/lib/dates";

const fmtNum = (n) => (n == null ? "" : Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2).replace(/\.?0+$/, ""));

function columnHref(courseId, col) {
  if (col.type === "quiz") return `/course/${courseId}/quizzes/${col.id}`;
  // Graded discussions are backed by an assignment: its id is the column id.
  return `/course/${courseId}/assignments/${col.id}`;
}

function LateMarker() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700" title="Submitted late">
      <Clock className="w-3 h-3" aria-hidden="true" /> Late
    </span>
  );
}

function SubmittedBadge() {
  return (
    <span className="text-[10px] font-semibold uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
      Submitted
    </span>
  );
}

// One gradebook cell: pct (big) + points/possible (small), "—" when nothing was handed in.
function GradeCell({ cell, pointsPossible }) {
  if (!cell || cell.status === "not_submitted") {
    return <span className="text-slate-400" aria-label="Not submitted">—</span>;
  }
  if (cell.status === "submitted") {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <SubmittedBadge />
        {cell.late ? <LateMarker /> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className="font-semibold text-slate-800 dark:text-slate-100">{cell.pct != null ? `${fmtNum(cell.pct)}%` : "—"}</span>
      <span className="text-[11px] text-slate-500 whitespace-nowrap">
        {fmtNum(cell.points)}{pointsPossible ? ` / ${fmtNum(pointsPossible)}` : ""}
      </span>
      {cell.late ? <LateMarker /> : null}
    </span>
  );
}

function TypeLabel({ col }) {
  const label = col.type === "quiz" ? "Quiz" : col.discussion ? "Discussion" : "Assignment";
  return (
    <span className={`text-[11px] font-bold uppercase tracking-wide ${col.type === "quiz" ? "text-indigo-600" : "text-slate-400"}`}>
      {label}
    </span>
  );
}

export default function GradesPage() {
  const { courseId } = useCourse();
  const { data, loading, error, refetch } = useCourseSection("grades");
  const columns = Array.isArray(data?.columns) ? data.columns : [];

  return (
    <div>
      <Breadcrumbs sectionKey="grades" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader help="pages.grades"
          title="Grades"
          meta={data?.role === "student" && data.averagePct != null ? (
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Your average: <strong className="text-[#0D9488]">{fmtNum(data.averagePct)}%</strong>
            </span>
          ) : data?.role === "student" ? (
            <span>Your average: No data yet</span>
          ) : null}
          actions={data?.role === "student" ? (
            <Link
              href={`/course/${courseId}/progress`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488] border border-teal-200 dark:border-teal-900 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded-lg px-3 py-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> My progress
            </Link>
          ) : null}
        />

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-rose-700">{error}</p>
            <button onClick={refetch} className="text-xs font-semibold text-rose-700 hover:text-rose-900">Retry</button>
          </div>
        ) : !data ? (
          <EmptyState compact title="No grade data available." />
        ) : data.role === "student" ? (
          columns.length === 0 ? (
            <EmptyState compact title="No graded work yet." />
          ) : (
            <Section>
              <DataTable
                caption="Your grades"
                rows={columns}
                rowKey={(c) => c.key}
                columns={[
                  {
                    key: "title",
                    header: "Item",
                    render: (c) => (
                      <div className="min-w-[10rem]">
                        <Link href={columnHref(courseId, c)} className="font-medium text-slate-800 dark:text-slate-100 hover:text-[#0D9488] hover:underline">
                          {c.title}
                        </Link>
                        <div><TypeLabel col={c} /></div>
                      </div>
                    ),
                  },
                  {
                    key: "due",
                    header: "Due",
                    className: "whitespace-nowrap text-slate-500",
                    render: (c) => (c.dueDate ? formatDate(c.dueDate) : "—"),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (c) => {
                      const cell = data.cells?.[c.key];
                      const status = cell?.status || "not_submitted";
                      return (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <span className={`text-[10px] font-semibold uppercase rounded-full px-1.5 py-0.5 whitespace-nowrap ${
                            status === "graded" ? "bg-teal-50 text-teal-800" : status === "submitted" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {status === "graded" ? "Graded" : status === "submitted" ? "Submitted" : "Not submitted"}
                          </span>
                          {cell?.late ? <LateMarker /> : null}
                        </span>
                      );
                    },
                  },
                  {
                    key: "score",
                    header: "Score",
                    align: "right",
                    render: (c) => {
                      const cell = data.cells?.[c.key];
                      if (!cell || cell.status !== "graded") return <span className="text-slate-400">—</span>;
                      return (
                        <span className="inline-flex flex-col items-end leading-tight whitespace-nowrap">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{cell.pct != null ? `${fmtNum(cell.pct)}%` : "—"}</span>
                          <span className="text-[11px] text-slate-500">{fmtNum(cell.points)}{c.pointsPossible ? ` / ${fmtNum(c.pointsPossible)}` : ""}</span>
                        </span>
                      );
                    },
                  },
                  {
                    key: "feedback",
                    header: "Feedback",
                    hideOnMobile: true,
                    className: "text-xs text-slate-600 dark:text-slate-400 max-w-xs",
                    render: (c) => data.cells?.[c.key]?.feedback || "",
                  },
                ]}
              />
            </Section>
          )
        ) : data.role === "teacher" ? (
          !data.rows || data.rows.length === 0 ? (
            <EmptyState compact title="No learners enrolled yet." />
          ) : columns.length === 0 ? (
            <EmptyState compact title="No graded work yet" description="Create an assignment or graded quiz to start the gradebook." />
          ) : (
            <DataTable
              caption="Gradebook"
              rows={data.rows}
              rowKey={(row) => row.email}
              columns={[
                {
                  key: "fullName",
                  header: "Learner",
                  className: "sticky left-0 z-10 bg-white dark:bg-slate-950 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shadow-[1px_0_0_0_rgb(226,232,240)] dark:shadow-[1px_0_0_0_rgb(30,41,59)]",
                  render: (row) => row.fullName || row.email,
                },
                ...columns.map((col) => ({
                  key: col.key,
                  align: "center",
                  className: "min-w-[7rem] normal-case",
                  header: (
                    <span className="flex flex-col items-center gap-0.5 normal-case tracking-normal">
                      <Link
                        href={columnHref(courseId, col)}
                        className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-[#0D9488] hover:underline line-clamp-2 max-w-[10rem]"
                        title={col.title}
                      >
                        {col.title}
                      </Link>
                      <span className="flex items-center gap-1">
                        <TypeLabel col={col} />
                        {col.dueDate ? <span className="text-[10px] font-normal text-slate-400 whitespace-nowrap">{formatDate(col.dueDate, { day: "numeric", month: "short" })}</span> : null}
                      </span>
                      {col.pointsPossible ? <span className="text-[10px] font-normal text-slate-400">{fmtNum(col.pointsPossible)} pts</span> : null}
                    </span>
                  ),
                  render: (row) => <GradeCell cell={row.cells?.[col.key]} pointsPossible={col.pointsPossible} />,
                })),
                {
                  key: "average",
                  header: "Average",
                  align: "right",
                  className: "font-bold whitespace-nowrap",
                  render: (row) => (row.averagePct != null ? `${fmtNum(row.averagePct)}%` : <span className="text-slate-400">—</span>),
                },
              ]}
            />
          )
        ) : (
          <EmptyState compact title="No grade data available." />
        )}
      </div>
    </div>
  );
}
