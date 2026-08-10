"use client";

import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function GradesPage() {
  const { data, loading, error, refetch } = useCourseSection("grades");

  return (
    <div>
      <Breadcrumbs sectionKey="grades" />
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-900">Grades</h1>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-rose-700">{error}</p>
            <button onClick={refetch} className="text-xs font-semibold text-rose-700 hover:text-rose-900">Retry</button>
          </div>
        ) : !data ? (
          <EmptyState message="No grade data available." />
        ) : data.role === "student" ? (
          !data.grades || data.grades.length === 0 ? (
            <EmptyState message="No graded work yet." />
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {data.grades.map((g) => (
                <div key={`${g.kind}-${g.id}`} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm text-slate-700">{g.title}</span>
                    <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">
                      {g.grade != null ? "Graded" : "Submitted / pending"}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">
                    {g.grade != null ? `${g.grade}${g.pointsPossible ? ` / ${g.pointsPossible}` : ""}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : data.role === "teacher" ? (
          !data.grid || data.grid.length === 0 ? (
            <EmptyState message="No students enrolled yet." />
          ) : !data.assignments || data.assignments.length === 0 ? (
            <EmptyState message="No graded assignments yet — create one from the Assignments tab." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 px-2 text-xs font-bold text-slate-500 uppercase sticky left-0 bg-white">Student</th>
                    {data.assignments.map((a) => (
                      <th key={a.id} className="pb-2 px-2 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">{a.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.grid.map((row) => (
                    <tr key={row.email}>
                      <td className="py-2 px-2 text-sm font-medium text-slate-700 sticky left-0 bg-white whitespace-nowrap">{row.fullName}</td>
                      {row.assignmentGrades.map((g) => (
                        <td key={g.assignmentId} className="py-2 px-2 text-sm text-slate-600 text-center">
                          {g.grade != null ? g.grade : g.status === "submitted" ? <span className="text-amber-600 text-xs">Submitted</span> : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <EmptyState message="No grade data available." />
        )}
      </div>
    </div>
  );
}
