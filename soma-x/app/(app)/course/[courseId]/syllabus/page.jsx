"use client";

import { useEffect, useState } from "react";
import { Calendar, Target, Award } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { moduleWeekLabel } from "@/lib/moduleLabels";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, DataTable } from "@/components/layout";
import { formatRange } from "@/lib/dates";

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
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader
          eyebrow="Auto-generated course syllabus"
          title={course?.title || "Course Syllabus"}
          meta={
            <span>
              Start Date: <strong>{startDateStr}</strong> · Duration: <strong>{course?.length_weeks || 4} Weeks</strong>
            </span>
          }
        />

        {/* 1. Course Outcomes */}
        <Section title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-[#0D9488]" /> Course Learning Outcomes</span>}>
          {outcomes.length === 0 ? (
            <p className="text-xs text-slate-500">No outcomes defined yet.</p>
          ) : (
            <List label="Course learning outcomes">
              {outcomes.map((o) => (
                <li key={o.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="text-[10px] font-bold text-[#0D9488] bg-teal-50 px-2 py-0.5 rounded border border-teal-200 shrink-0 mt-0.5">
                    {o.code || `OUT-${o.id}`}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.title}</p>
                    {o.description && <p className="text-xs text-slate-500 mt-0.5">{o.description}</p>}
                  </div>
                </li>
              ))}
            </List>
          )}
        </Section>

        {/* 2. Grading scale */}
        <Section title={<span className="flex items-center gap-2"><Award className="w-4 h-4 text-[#0D9488]" /> Grading Scale & Assessment Policy</span>}>
          <DataTable
            caption="Grading scale"
            rowKey={(r) => r.grade}
            rows={[{ grade: "A", range: "90 - 100%" },{ grade: "B", range: "80 - 89%" },{ grade: "C", range: "70 - 79%" },{ grade: "D", range: "60 - 69%" },{ grade: "F", range: "< 60%" }]}
            columns={[
              { key: "grade", header: "Grade", className: "font-bold text-slate-900 dark:text-white" },
              { key: "range", header: "Score", className: "text-slate-600 dark:text-slate-400" },
            ]}
          />
        </Section>

        {/* 3. Weekly module schedule */}
        <Section title={<span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-[#0D9488]" /> Weekly Module Schedule</span>}>
          {modules.length === 0 ? (
            <p className="text-xs text-slate-500">{loading ? "Loading schedule..." : "No weekly modules scheduled yet."}</p>
          ) : (
            <div className="space-y-6">
              {modules.map((m) => (
                <div key={m.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#0D9488] bg-teal-50 px-2.5 py-0.5 rounded-md border border-teal-200">
                      {moduleWeekLabel(m)}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{m.title}</h3>
                    {m.kind !== "unassigned" && (
                      <span className="text-xs text-slate-500">{m.startDate ? formatRange(m.startDate, m.endDate) : "No dates yet"}</span>
                    )}
                  </div>
                  {m.description && <p className="text-xs text-slate-600 dark:text-slate-400">{m.description}</p>}

                  {(m.items || []).length > 0 && (
                    <List label={`Items in ${m.title}`}>
                      {m.items.map((item) => (
                        <li key={item.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                          <span className="capitalize text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 shrink-0">
                            {item.item_type}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{item.title}</span>
                        </li>
                      ))}
                    </List>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
