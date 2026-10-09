"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, List, ListRow, EmptyState } from "@/components/layout";
import { ExplainerText } from "@/components/help/Explainer";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";

export default function QuizzesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { t, tf, fmtDate } = useCourseText();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const quizRes = await fetch(`${SERVER_URL}/courses/${courseId}/quizzes`);
      if (quizRes.ok) setQuizzes(await quizRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [SERVER_URL, courseId, userEmail]);

  return (
    <div>
      <Breadcrumbs sectionKey="quizzes" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <PageHeader help="pages.quizzes"
          title={t("nav.quizzes")}
          description={t("lists.quizzesDescription")}
          actions={isTeacher ? (
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t("lists.addFromModules")}
            </Link>
          ) : null}
        />

        {quizzes.length === 0 ? (
          loading ? <Loader variant="page" size={48} className="min-h-[25vh]" label={t("lists.loadingQuizzes")} /> : <EmptyState compact title={t("lists.noQuizzes")} description={<ExplainerText k="pages.quizzes" />} />
        ) : (
          <List label={t("nav.quizzes")}>
            {quizzes.map((q) => (
              <ListRow
                key={q.id}
                icon={<HelpCircle className="w-4 h-4 text-[var(--brand-secondary)]" />}
                title={q.title}
                href={`/course/${courseId}/quizzes/${q.id}`}
                subtitle={`${tf((q.questionCount || 0) === 1 ? "lists.oneQuestion" : "lists.manyQuestions", { n: q.questionCount || 0 })} · ${q.due_at ? tf("common.dueOn", { date: fmtDate(q.due_at) }) : t("lists.relativeTiming")}`}
                actions={
                  <Link href={`/course/${courseId}/quizzes/${q.id}`} className="text-xs font-semibold text-[var(--brand-secondary)] hover:underline">
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
