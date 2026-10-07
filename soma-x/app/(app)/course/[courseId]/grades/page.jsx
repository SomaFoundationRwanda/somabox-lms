"use client";

import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, DataTable, EmptyState } from "@/components/layout";

export default function GradesPage() {
  const { data, loading, error, refetch } = useCourseSection("grades");

  return (
    <div>
      <Breadcrumbs sectionKey="grades" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader title="Grades" />

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-rose-700">{error}</p>
            <button onClick={refetch} className="text-xs font-semibold text-rose-700 hover:text-rose-900">Retry</button>
          </div>
        ) : !data ? (
          <EmptyState compact title="No grade data available." />
        ) : data.role === "student" ? (
          !data.grades || data.grades.length === 0 ? (
            <EmptyState compact title="No graded work yet." />
          ) : (
            <DataTable
              caption="Your grades"
              rows={data.grades}
              rowKey={(g) => `${g.kind}-${g.id}`}
              columns={[
                { key: "title", header: "Item", className: "text-slate-700 dark:text-slate-200" },
                {
                  key: "status",
                  header: "Status",
                  render: (g) => (
                    <span className="text-[10px] font-semibold uppercase text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                      {g.grade != null ? "Graded" : "Submitted / pending"}
                    </span>
                  ),
                },
                {
                  key: "grade",
                  header: "Grade",
                  align: "right",
                  render: (g) => (
                    <span className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {g.grade != null ? `${g.grade}${g.pointsPossible ? ` / ${g.pointsPossible}` : ""}` : "—"}
                    </span>
                  ),
                },
              ]}
            />
          )
        ) : data.role === "teacher" ? (
          !data.grid || data.grid.length === 0 ? (
            <EmptyState compact title="No students enrolled yet." />
          ) : !data.assignments || data.assignments.length === 0 ? (
            <EmptyState compact title="No graded assignments yet" description="Create one from the Assignments tab." />
          ) : (
            <DataTable
              caption="Gradebook"
              rows={data.grid}
              rowKey={(row) => row.email}
              columns={[
                {
                  key: "fullName",
                  header: "Student",
                  className: "font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-950",
                },
                ...data.assignments.map((a, idx) => ({
                  key: `a-${a.id}`,
                  header: <span className="whitespace-nowrap">{a.title}</span>,
                  align: "center",
                  className: "text-slate-600 dark:text-slate-400",
                  render: (row) => {
                    // Same positional pairing as before: grades are in the same order as assignments.
                    const g = row.assignmentGrades[idx];
                    if (!g) return "—";
                    return g.grade != null ? g.grade : g.status === "submitted" ? <span className="text-amber-600 text-xs">Submitted</span> : "—";
                  },
                })),
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
