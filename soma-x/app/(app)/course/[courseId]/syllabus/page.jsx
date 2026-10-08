"use client";

import { useEffect, useState } from "react";
import { Calendar, Target, Award } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseText } from "@/components/course/useCourseText";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, DataTable } from "@/components/layout";
import { formatRange } from "@/lib/dates";

export default function SyllabusPage() {
  const { SERVER_URL, courseId, userEmail, course } = useCourse();
  const { t, tf, tOr, weekLabel, fmtDate } = useCourseText();
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
    ? fmtDate(course.start_date, { year: "numeric", month: "long", day: "numeric" })
    : t("syllabus.noStartDate");

  return (
    <div>
      <Breadcrumbs sectionKey="syllabus" />
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader help="pages.syllabus"
          eyebrow={t("syllabus.eyebrow")}
          title={course?.title || t("syllabus.title")}
          meta={
            <span>
              {t("syllabus.startDate")} <strong>{startDateStr}</strong> · {t("syllabus.duration")} <strong>{tf("syllabus.weeks", { n: course?.length_weeks || 4 })}</strong>
            </span>
          }
        />

        {/* 1. Course Outcomes */}
        <Section title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-[#0D9488]" /> {t("syllabus.outcomes")}</span>}>
          {outcomes.length === 0 ? (
            <p className="text-xs text-slate-500">{t("syllabus.noOutcomes")}</p>
          ) : (
            <List label={t("syllabus.outcomes")}>
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
        <Section title={<span className="flex items-center gap-2"><Award className="w-4 h-4 text-[#0D9488]" /> {t("syllabus.gradingTitle")}</span>}>
          <DataTable
            caption={t("syllabus.gradingScale")}
            rowKey={(r) => r.grade}
            rows={[{ grade: "A", range: "90 - 100%" },{ grade: "B", range: "80 - 89%" },{ grade: "C", range: "70 - 79%" },{ grade: "D", range: "60 - 69%" },{ grade: "F", range: "< 60%" }]}
            columns={[
              { key: "grade", header: t("syllabus.grade"), className: "font-bold text-slate-900 dark:text-white" },
              { key: "range", header: t("quiz.score"), className: "text-slate-600 dark:text-slate-400" },
            ]}
          />
        </Section>

        {/* 3. Weekly module schedule */}
        <Section title={<span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-[#0D9488]" /> {t("syllabus.schedule")}</span>}>
          {modules.length === 0 ? (
            <p className="text-xs text-slate-500">{loading ? t("syllabus.loadingSchedule") : t("syllabus.noSchedule")}</p>
          ) : (
            <div className="space-y-6">
              {modules.map((m) => (
                <div key={m.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#0D9488] bg-teal-50 px-2.5 py-0.5 rounded-md border border-teal-200">
                      {weekLabel(m)}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{m.title}</h3>
                    {m.kind !== "unassigned" && (
                      <span className="text-xs text-slate-500">{m.startDate ? formatRange(m.startDate, m.endDate) : t("home.noDatesYet")}</span>
                    )}
                  </div>
                  {m.description && <p className="text-xs text-slate-600 dark:text-slate-400">{m.description}</p>}

                  {(m.items || []).length > 0 && (
                    <List label={tf("modules.itemsIn", { title: m.title })}>
                      {m.items.map((item) => (
                        <li key={item.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 shrink-0">
                            {tOr(`items.${item.item_type}`, item.item_type)}
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
