"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, Target, CheckCircle2, Lock } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function RubricsPage() {
  const { SERVER_URL, courseId, userEmail } = useCourse();
  const [rubrics, setRubrics] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRubricLibrary = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [rubRes, outRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/rubrics`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes`),
      ]);
      if (rubRes.ok) setRubrics(await rubRes.json());
      if (outRes.ok) setOutcomes(await outRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRubricLibrary();
  }, [SERVER_URL, courseId, userEmail]);

  return (
    <div>
      <Breadcrumbs sectionKey="rubrics" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0D9488]">Rubric Library</span>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> Read-Only View
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-0.5">Course Rubrics Library</h1>
            <p className="text-xs text-slate-500 mt-1">
              Rubrics are instantiated directly within assignment forms from course learning outcome mastery levels.
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Each rubric belongs to one assignment — edit it from that assignment.
            </p>
          </div>
        </div>

        {/* Instantiated Assignment Rubrics */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-[#0D9488]" /> Instantiated Rubrics in Assignments
          </h2>

          {rubrics.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
              No assignment rubrics instantiated yet. Create or edit an assignment to instantiate a rubric from tagged outcomes.
            </div>
          ) : (
            rubrics.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900">{r.title}</h3>
                    {r.assignment_id ? (
                      <Link
                        href={`/course/${courseId}/assignments/${r.assignment_id}`}
                        className="text-xs font-semibold text-[#0D9488] hover:underline"
                      >
                        Assignment: {r.assignment_title || `#${r.assignment_id}`}
                      </Link>
                    ) : null}
                  </div>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                    Instantiated Rubric
                  </span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl bg-slate-50/50">
                  {(r.criteria || []).length === 0 ? (
                    <p className="p-3 text-xs text-slate-400 italic">No criteria yet.</p>
                  ) : (r.criteria || []).map((c, idx) => (
                    <div key={c.id ?? idx} className="p-3 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{c.title}</span>
                          {c.outcome_code ? (
                            <span
                              className="text-[10px] font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full"
                              title={c.outcome_title || undefined}
                            >
                              {c.outcome_code}
                            </span>
                          ) : null}
                        </div>
                        {c.description ? <p className="text-[11px] text-slate-500">{c.description}</p> : null}
                      </div>
                      <span className="font-bold text-[#0D9488] bg-white px-2.5 py-1 rounded border border-slate-200 shrink-0">
                        {c.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Mastery Skeleton Reference Library */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-[#0D9488]" /> Course Outcome Mastery Criteria Skeletons
          </h2>
          <p className="text-xs text-slate-500">
            These outcome mastery level criteria serve as the skeleton when instantiating new assignment rubrics:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {outcomes.map((o) => (
              <div key={o.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="text-[10px] font-bold text-[#0D9488] bg-white px-2 py-0.5 rounded border border-teal-200">
                  {o.code || `OUT-${o.id}`}
                </span>
                <h4 className="text-xs font-bold text-slate-800">{o.title}</h4>
                <div className="text-[11px] text-slate-600 pt-1 space-y-0.5">
                  <div className="flex justify-between"><span>Exceeds Mastery:</span><span className="font-bold">4 pts</span></div>
                  <div className="flex justify-between"><span>Meets Mastery:</span><span className="font-bold">3 pts</span></div>
                  <div className="flex justify-between"><span>Approaching:</span><span className="font-bold">2 pts</span></div>
                  <div className="flex justify-between"><span>Below Mastery:</span><span className="font-bold">1 pt</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
