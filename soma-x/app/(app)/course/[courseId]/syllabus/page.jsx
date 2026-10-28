"use client";

import { Calendar, Target, Award } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { useCourseText } from "@/components/course/useCourseText";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, DataTable } from "@/components/layout";
import { formatRange } from "@/lib/dates";
import Loader from "@/components/ui/Loader";

export default function SyllabusPage() {
  const { course, isTeacher } = useCourse();
  const { t, tf, tOr, weekLabel, fmtDate } = useCourseText();
  // The same kept weeks and outcomes as the Modules and Outcomes pages.
  const modulesQuery = useCourseSection("modules");
  const outcomesQuery = useCourseSection("outcomes");
  const modules = Array.isArray(modulesQuery.data) ? modulesQuery.data : [];
  const outcomes = Array.isArray(outcomesQuery.data) ? outcomesQuery.data : [];
  const loading = modulesQuery.loading || outcomesQuery.loading;

  const startDateStr = course?.start_date
    ? fmtDate(course.start_date, { year: "numeric", month: "long", day: "numeric" })
    : t("syllabus.noStartDate");

  return (
    <div>
      <Breadcrumbs sectionKey="syllabus" />
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader help="pages.syllabus"
          eyebrow={isTeacher ? t("syllabus.eyebrow") : t("syllabus.eyebrowLearner")}
          title={course?.title || t("syllabus.title")}
          meta={
            <span>
              {t("syllabus.startDate")} <strong>{startDateStr}</strong> · {t("syllabus.duration")} <strong>{tf("syllabus.weeks", { n: course?.length_weeks || 4 })}</strong>
            </span>
          }
        />

        {/* 1. Course Outcomes */}
        <Section title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-brand-fg" /> {t("syllabus.outcomes")}</span>}>
          {outcomes.length === 0 ? (
            <p className="text-caption text-fg-subtle">{t("syllabus.noOutcomes")}</p>
          ) : (
            <List label={t("syllabus.outcomes")}>
              {outcomes.map((o) => (
                <li key={o.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="text-caption font-bold text-brand-fg bg-brand-soft px-2 py-0.5 rounded border border-brand/40 shrink-0 mt-0.5">
                    {o.code || `OUT-${o.id}`}
                  </span>
                  <div className="min-w-0">
                    <p className="text-ui font-semibold text-fg">{o.title}</p>
                    {o.description && <p className="text-caption text-fg-subtle mt-0.5">{o.description}</p>}
                  </div>
                </li>
              ))}
            </List>
          )}
        </Section>

        {/* 2. Grading scale */}
        <Section title={<span className="flex items-center gap-2"><Award className="w-4 h-4 text-brand-fg" /> {t("syllabus.gradingTitle")}</span>}>
          <DataTable
            caption={t("syllabus.gradingScale")}
            rowKey={(r) => r.grade}
            rows={[{ grade: "A", range: "90 - 100%" },{ grade: "B", range: "80 - 89%" },{ grade: "C", range: "70 - 79%" },{ grade: "D", range: "60 - 69%" },{ grade: "F", range: "< 60%" }]}
            columns={[
              { key: "grade", header: t("syllabus.grade"), className: "font-bold text-fg" },
              { key: "range", header: t("quiz.score"), className: "text-fg-muted" },
            ]}
          />
        </Section>

        {/* 3. Weekly module schedule */}
        <Section title={<span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-brand-fg" /> {t("syllabus.schedule")}</span>}>
          {modules.length === 0 ? (
            loading ? <Loader variant="page" size={48} className="min-h-[25vh]" label={t("syllabus.loadingSchedule")} /> : <p className="text-caption text-fg-subtle">{t("syllabus.noSchedule")}</p>
          ) : (
            <div className="space-y-6">
              {modules.map((m) => (
                <div key={m.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-caption font-bold text-brand-fg bg-brand-soft px-2.5 py-0.5 rounded-md border border-brand/40">
                      {weekLabel(m)}
                    </span>
                    <h3 className="text-ui font-bold text-fg">{m.title}</h3>
                    {m.kind !== "unassigned" && (
                      <span className="text-caption text-fg-subtle">{m.startDate ? formatRange(m.startDate, m.endDate) : t("home.noDatesYet")}</span>
                    )}
                  </div>
                  {m.description && <p className="text-caption text-fg-muted">{m.description}</p>}

                  {(m.items || []).length > 0 && (
                    <List label={tf("modules.itemsIn", { title: m.title })}>
                      {m.items.map((item) => (
                        <li key={item.id} className="px-3 py-2 flex items-center gap-2 text-caption">
                          <span className="text-caption font-bold text-fg-subtle bg-surface-sunken px-2 py-0.5 rounded border border-line shrink-0">
                            {tOr(`items.${item.item_type}`, item.item_type)}
                          </span>
                          <span className="font-semibold text-fg truncate">{item.title}</span>
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
