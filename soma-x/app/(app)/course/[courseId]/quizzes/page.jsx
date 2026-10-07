"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, List, ListRow, EmptyState } from "@/components/layout";

export default function QuizzesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
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
        <PageHeader
          title="Quizzes"
          description="Quizzes are bound to weekly modules and assess tagged outcome baselines."
          actions={isTeacher ? (
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add from Modules
            </Link>
          ) : null}
        />

        {quizzes.length === 0 ? (
          <EmptyState compact title={loading ? "Loading quizzes..." : "No quizzes created yet."} />
        ) : (
          <List label="Quizzes">
            {quizzes.map((q) => (
              <ListRow
                key={q.id}
                icon={<HelpCircle className="w-4 h-4 text-[#0D9488]" />}
                title={q.title}
                href={`/course/${courseId}/quizzes/${q.id}`}
                subtitle={`${q.questionCount || 0} question(s) · ${q.due_at ? `Due ${new Date(q.due_at).toLocaleDateString()}` : "Relative Timing Active"}`}
                actions={
                  <Link href={`/course/${courseId}/quizzes/${q.id}`} className="text-xs font-semibold text-[#0D9488] hover:underline">
                    Open &rarr;
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
