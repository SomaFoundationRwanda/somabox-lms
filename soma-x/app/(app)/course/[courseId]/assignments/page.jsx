"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, HelpCircle, MessageSquare, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, List, ListRow, EmptyState } from "@/components/layout";

const KIND_ICONS = { assignment: ClipboardList, quiz: HelpCircle, discussion: MessageSquare };

export default function AssignmentsPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const assignRes = await fetch(`${SERVER_URL}/courses/${courseId}/assignments`);
      if (assignRes.ok) setItems(await assignRes.json());
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
      <Breadcrumbs sectionKey="assignments" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <PageHeader
          title="Assignments"
          description="Assignments belong to module week slots and evaluate tagged outcome mastery."
          actions={isTeacher ? (
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add from Modules
            </Link>
          ) : null}
        />

        {items.length === 0 ? (
          <EmptyState compact title={loading ? "Loading assignments..." : "No assignments created yet."} />
        ) : (
          <List label="Assignments">
            {items.map((item) => {
              const Icon = KIND_ICONS[item.kind] || ClipboardList;
              const href = item.kind === "assignment" ? `/course/${courseId}/assignments/${item.id}`
                : item.kind === "quiz" ? `/course/${courseId}/quizzes/${item.id}`
                : `/course/${courseId}/discussions/${item.id}`;
              return (
                <ListRow
                  key={`${item.kind}-${item.id}`}
                  icon={<Icon className="w-4 h-4 text-[#0D9488]" />}
                  title={item.title}
                  href={href}
                  subtitle={item.dueAt ? `Due ${new Date(item.dueAt).toLocaleDateString()}` : "Week module slot"}
                  meta={item.pointsPossible != null ? <span className="font-semibold text-slate-700 dark:text-slate-300">{item.pointsPossible} pts</span> : null}
                />
              );
            })}
          </List>
        )}
      </div>
    </div>
  );
}
