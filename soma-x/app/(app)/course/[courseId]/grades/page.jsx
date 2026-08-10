"use client";

import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function GradesPage() {
  const { data, loading, error } = useCourseSection("grades");

  return (
    <div>
      <Breadcrumbs sectionKey="grades" />
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-900">Grades</h1>
        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {data?.role === "student" ? (
          data.grades.length === 0 ? (
            <EmptyState message="No grades yet." />
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {data.grades.map((g) => (
                <div key={`${g.kind}-${g.id}`} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-slate-700">{g.title}</span>
                  <span className="text-sm font-semibold text-slate-800">
                    {g.grade != null ? `${g.grade}${g.pointsPossible ? ` / ${g.pointsPossible}` : ""}` : "Not graded"}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : null}

        {data?.role === "teacher" ? (
          data.grid.length === 0 ? (
            <EmptyState message="No students enrolled yet." />
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
                        <td key={g.assignmentId} className="py-2 px-2 text-sm text-slate-600 text-center">{g.grade ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
