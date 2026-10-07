"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, Target, Lock } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, DataTable, EmptyState } from "@/components/layout";

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
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader help="pages.rubrics"
          eyebrow="Rubric library"
          title="Course rubrics"
          description="Rubrics are instantiated directly within assignment forms from course learning outcome mastery levels. Each rubric belongs to one assignment — edit it from that assignment."
          meta={
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> Read-Only View
            </span>
          }
        />

        {/* One Section per instantiated rubric; criteria as a table */}
        {rubrics.length === 0 ? (
          <Section title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-[#0D9488]" /> Rubrics in assignments</span>}>
            <EmptyState
              compact
              title={loading ? "Loading rubrics..." : "No assignment rubrics instantiated yet."}
              description={loading ? undefined : "Create or edit an assignment to instantiate a rubric from tagged outcomes."}
            />
          </Section>
        ) : (
          rubrics.map((r, i) => (
            <Section
              key={r.id}
              divided={i > 0}
              title={<span className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-[#0D9488]" /> {r.title}</span>}
              description={r.assignment_id ? (
                <Link
                  href={`/course/${courseId}/assignments/${r.assignment_id}`}
                  className="font-semibold text-[#0D9488] hover:underline"
                >
                  Assignment: {r.assignment_title || `#${r.assignment_id}`}
                </Link>
              ) : null}
            >
              <DataTable
                caption={`Criteria for ${r.title}`}
                rows={(r.criteria || []).map((c, idx) => ({ ...c, _key: c.id ?? idx }))}
                rowKey={(c) => c._key}
                empty="No criteria yet."
                columns={[
                  {
                    key: "title",
                    header: "Criterion",
                    render: (c) => (
                      <div className="min-w-0 space-y-0.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{c.title}</span>
                        {c.description ? <p className="text-[11px] text-slate-500">{c.description}</p> : null}
                      </div>
                    ),
                  },
                  {
                    key: "outcome",
                    header: "Outcome",
                    render: (c) => c.outcome_code ? (
                      <span
                        className="text-[10px] font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full"
                        title={c.outcome_title || undefined}
                      >
                        {c.outcome_code}
                      </span>
                    ) : <span className="text-slate-400">—</span>,
                  },
                  { key: "points", header: "Points", align: "right", render: (c) => <span className="font-bold text-[#0D9488] whitespace-nowrap">{c.points} pts</span> },
                ]}
              />
            </Section>
          ))
        )}

        {/* Mastery skeleton reference */}
        <Section
          divided
          title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-[#0D9488]" /> Outcome mastery criteria skeletons</span>}
          description="These outcome mastery level criteria serve as the skeleton when instantiating new assignment rubrics."
        >
          <DataTable
            caption="Outcome mastery criteria skeletons"
            rows={outcomes}
            empty="No outcomes defined yet."
            columns={[
              {
                key: "outcome",
                header: "Outcome",
                render: (o) => (
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-[10px] font-bold text-[#0D9488] bg-teal-50 px-2 py-0.5 rounded border border-teal-200 shrink-0">
                      {o.code || `OUT-${o.id}`}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{o.title}</span>
                  </div>
                ),
              },
              { key: "exceeds", header: "Exceeds", align: "center", render: () => "4 pts" },
              { key: "meets", header: "Meets", align: "center", render: () => "3 pts" },
              { key: "approaching", header: "Approaching", align: "center", render: () => "2 pts" },
              { key: "below", header: "Below", align: "center", render: () => "1 pt" },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
