"use client";

import { Share2 } from "lucide-react";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function CollaborationsPage() {
  const { data: collaborations, loading } = useCourseSection("collaborations");

  return (
    <div>
      <Breadcrumbs sectionKey="collaborations" />
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-lg font-bold text-slate-900">Collaborations</h1>
        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {!loading && (!collaborations || collaborations.length === 0) ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <Share2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">Coming soon</p>
            <p className="text-xs text-slate-400 mt-1">External collaboration tools (shared docs, whiteboards) aren't wired up yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {collaborations.map((c) => (
              <a key={c.id} href={c.url} target="_blank" rel="noreferrer" className="block px-4 py-2.5 text-sm text-slate-700 hover:text-[#203A3A]">
                {c.title}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
