"use client";

import { useEffect, useState } from "react";
import { BookOpen, Calendar, Target, Layers, Award } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function SyllabusPage() {
  const { SERVER_URL, courseId, userEmail, course } = useCourse();
  const [modules, setModules] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSyllabusData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [modRes, outRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/modules`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes`),
      ]);
      if (modRes.ok) setModules(await modRes.json());
      if (outRes.ok) setOutcomes(await outRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSyllabusData();
  }, [SERVER_URL, courseId, userEmail]);

  const startDateStr = course?.start_date
    ? new Date(course.start_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "Week 0 (Start Date Not Set)";

  return (
    <div>
      <Breadcrumbs sectionKey="syllabus" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#0D9488]">Auto-Generated Course Syllabus</span>
            <h1 className="text-2xl font-black text-slate-900 mt-0.5">{course?.title || "Course Syllabus"}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Start Date: <strong>{startDateStr}</strong> · Duration: <strong>{course?.length_weeks || 4} Weeks</strong>
            </p>
          </div>
        </div>

        {/* 1. Course Outcomes Overview */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-[#0D9488]" /> Course Learning Outcomes
          </h2>
          {outcomes.length === 0 ? (
            <p className="text-xs text-slate-500">No outcomes defined yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {outcomes.map((o) => (
                <div key={o.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-[#0D9488] bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    {o.code || `OUT-${o.id}`}
                  </span>
                  <p className="text-xs font-bold text-slate-800">{o.title}</p>
                  {o.description && <p className="text-[11px] text-slate-500">{o.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Grading Weights & Rubrics Structure */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-[#0D9488]" /> Grading Scale & Assessment Policy
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block font-bold text-slate-900 text-sm">A</span>
              <span className="text-slate-500">90 - 100%</span>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block font-bold text-slate-900 text-sm">B</span>
              <span className="text-slate-500">80 - 89%</span>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block font-bold text-slate-900 text-sm">C</span>
              <span className="text-slate-500">70 - 79%</span>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block font-bold text-slate-900 text-sm">D</span>
              <span className="text-slate-500">60 - 69%</span>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="block font-bold text-slate-900 text-sm">F</span>
              <span className="text-slate-500">&lt; 60%</span>
            </div>
          </div>
        </div>

        {/* 3. Auto-Built Course Schedule */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#0D9488]" /> Weekly Module Schedule
          </h2>

          <div className="space-y-4">
            {modules.length === 0 ? (
              <p className="text-xs text-slate-500">No weekly modules scheduled yet.</p>
            ) : (
              modules.map((m) => (
                <div key={m.id} className="p-4 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0D9488] bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                      Week {m.week_offset || 1} Slot
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{m.title}</h3>
                  {m.description && <p className="text-xs text-slate-600">{m.description}</p>}

                  {/* Module items */}
                  {(m.items || []).length > 0 && (
                    <div className="pt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl bg-slate-50/50">
                      {m.items.map((item) => (
                        <div key={item.id} className="p-2.5 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span className="capitalize text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {item.item_type}
                            </span>
                            {item.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
