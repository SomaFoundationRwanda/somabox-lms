"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, Target, Lock } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, DataTable, EmptyState } from "@/components/layout";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";

export default function RubricsPage() {
  const { SERVER_URL, courseId, userEmail } = useCourse();
  const { t, tf } = useCourseText();
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
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader help="pages.rubrics"
          eyebrow={t("rubrics.eyebrow")}
          title={t("rubrics.title")}
          description={t("rubrics.description")}
          meta={
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> {t("rubrics.readOnly")}
            </span>
          }
        />

        {/* One Section per instantiated rubric; criteria as a table */}
        {rubrics.length === 0 ? (
          <Section title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-[var(--brand-secondary)]" /> {t("rubrics.inAssignments")}</span>}>
            {loading ? (
              <Loader variant="page" size={48} className="min-h-[25vh]" label={t("rubrics.loading")} />
            ) : (
              <EmptyState compact title={t("rubrics.empty")} description={t("rubrics.emptyHelp")} />
            )}
          </Section>
        ) : (
          rubrics.map((r, i) => (
            <Section
              key={r.id}
              divided={i > 0}
              title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-[var(--brand-secondary)]" /> {r.title}</span>}
              description={r.assignment_id ? (
                <Link
                  href={`/course/${courseId}/assignments/${r.assignment_id}`}
                  className="font-semibold text-[var(--brand-secondary)] hover:underline"
                >
                  {tf("rubrics.assignment", { title: r.assignment_title || `#${r.assignment_id}` })}
                </Link>
              ) : null}
            >
              <DataTable
                caption={tf("rubrics.criteriaFor", { title: r.title })}
                rows={(r.criteria || []).map((c, idx) => ({ ...c, _key: c.id ?? idx }))}
                rowKey={(c) => c._key}
                empty={t("rubrics.noCriteria")}
                columns={[
                  {
                    key: "title",
                    header: t("rubrics.criterion"),
                    render: (c) => (
                      <div className="min-w-0 space-y-0.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{c.title}</span>
                        {c.description ? <p className="text-[11px] text-slate-500">{c.description}</p> : null}
                      </div>
                    ),
                  },
                  {
                    key: "outcome",
                    header: t("rubrics.outcome"),
                    render: (c) => c.outcome_code ? (
                      <span
                        className="text-[10px] font-bold text-[var(--brand-secondary)] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full"
                        title={c.outcome_title || undefined}
                      >
                        {c.outcome_code}
                      </span>
                    ) : <span className="text-slate-400">—</span>,
                  },
                  { key: "points", header: t("rubrics.points"), align: "right", render: (c) => <span className="font-bold text-[var(--brand-secondary)] whitespace-nowrap">{tf("common.points", { n: c.points })}</span> },
                ]}
              />
            </Section>
          ))
        )}

        {/* Mastery skeleton reference */}
        <Section
          divided
          title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-[var(--brand-secondary)]" /> {t("rubrics.skeletons")}</span>}
          description={t("rubrics.skeletonsHelp")}
        >
          <DataTable
            caption={t("rubrics.skeletons")}
            rows={outcomes}
            empty={t("syllabus.noOutcomes")}
            columns={[
              {
                key: "outcome",
                header: t("rubrics.outcome"),
                render: (o) => (
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-[var(--brand-secondary)] bg-teal-50 px-2 py-0.5 rounded border border-teal-200 shrink-0">
                      {o.code || `OUT-${o.id}`}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{o.title}</span>
                  </div>
                ),
              },
              { key: "exceeds", header: t("rubrics.exceeds"), align: "center", render: () => tf("common.points", { n: 4 }) },
              { key: "meets", header: t("rubrics.meets"), align: "center", render: () => tf("common.points", { n: 3 }) },
              { key: "approaching", header: t("rubrics.approaching"), align: "center", render: () => tf("common.points", { n: 2 }) },
              { key: "below", header: t("rubrics.below"), align: "center", render: () => t("rubrics.onePoint") },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
