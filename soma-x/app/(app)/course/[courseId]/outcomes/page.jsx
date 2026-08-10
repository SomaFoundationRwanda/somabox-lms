"use client";

import { Target } from "lucide-react";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function OutcomesPage() {
  const { data: outcomes, loading } = useCourseSection("outcomes");

  return (
    <div>
      <Breadcrumbs sectionKey="outcomes" />
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-900">Outcomes</h1>
        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {!loading && (!outcomes || outcomes.length === 0) ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <Target className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">Coming soon</p>
            <p className="text-xs text-slate-400 mt-1">Learning outcome tracking and mastery reports aren't wired up yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {outcomes.map((o) => (
              <div key={o.id} className="px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-700">{o.title}</p>
                {o.description ? <p className="text-xs text-slate-500 mt-0.5">{o.description}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
