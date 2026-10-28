"use client";

import Link from "next/link";
import { HelpCircle, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, List, ListRow, EmptyState } from "@/components/layout";
import { ExplainerText } from "@/components/help/Explainer";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";

export default function QuizzesListPage() {
  const { courseId, isTeacher } = useCourse();
  const { t, tf, fmtDate } = useCourseText();
  const section = useCourseSection("quizzes");
  const quizzes = Array.isArray(section.data) ? section.data : [];
  const loading = section.loading;

  return (
    <div>
      <Breadcrumbs sectionKey="quizzes" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <PageHeader help="pages.quizzes"
          title={t("nav.quizzes")}
          actions={isTeacher ? (
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t("lists.addFromModules")}
            </Link>
          ) : null}
        />

        {quizzes.length === 0 ? (
          loading ? <Loader variant="page" size={48} className="min-h-[25vh]" label={t("lists.loadingQuizzes")} /> : <EmptyState compact title={t("lists.noQuizzes")} description={isTeacher ? <ExplainerText k="pages.quizzes" /> : null} />
        ) : (
          <List label={t("nav.quizzes")}>
            {quizzes.map((q) => (
              <ListRow
                key={q.id}
                icon={<HelpCircle className="w-4 h-4 text-brand-fg" />}
                title={q.title}
                href={`/course/${courseId}/quizzes/${q.id}`}
                subtitle={`${tf((q.questionCount || 0) === 1 ? "lists.oneQuestion" : "lists.manyQuestions", { n: q.questionCount || 0 })} · ${q.due_at ? tf("common.dueOn", { date: fmtDate(q.due_at) }) : t("lists.relativeTiming")}`}
                actions={
                  <Link href={`/course/${courseId}/quizzes/${q.id}`} className="text-caption font-semibold text-brand-fg hover:underline">
                    {t("common.open")} &rarr;
                  </Link>
                }
              />
            ))}
          </List>
        )}
      </div>
    </div>
  );
}
