"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, HelpCircle, MessageSquare, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

const KIND_ICONS = { assignment: ClipboardList, quiz: HelpCircle, discussion: MessageSquare };

export default function AssignmentsPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: items, loading, error, refetch } = useCourseSection("assignments");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", dueAt: "", pointsPossible: 100 });

  const createAssignment = async () => {
    if (!form.title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, title: form.title.trim(), dueAt: form.dueAt || null, pointsPossible: Number(form.pointsPossible) || 100, published: true }),
    });
    setForm({ title: "", dueAt: "", pointsPossible: 100 });
    setCreating(false);
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="assignments" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Assignments</h1>
          {isTeacher ? (
            <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2">
              <Plus className="w-3.5 h-3.5" /> Add Assignment
            </button>
          ) : null}
        </div>

        {creating ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Assignment title" className="flex-1 min-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <input type="datetime-local" value={form.dueAt} onChange={(e) => setForm((p) => ({ ...p, dueAt: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-3 py-2" />
            <input type="number" min="0" value={form.pointsPossible} onChange={(e) => setForm((p) => ({ ...p, pointsPossible: e.target.value }))} placeholder="Points" className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2" />
            <button onClick={createAssignment} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Create</button>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Loading assignments...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error && (!items || items.length === 0) ? <EmptyState message="No assignments, quizzes, or graded discussions yet." /> : null}

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {(items || []).map((item) => {
            const Icon = KIND_ICONS[item.kind] || ClipboardList;
            const href = item.kind === "assignment" ? `/course/${courseId}/assignments/${item.id}`
              : item.kind === "quiz" ? `/course/${courseId}/quizzes/${item.id}`
              : `/course/${courseId}/discussions/${item.id}`;
            return (
              <Link key={`${item.kind}-${item.id}`} href={href} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.dueAt ? `Due ${new Date(item.dueAt).toLocaleString()}` : "No due date"}
                      {!item.published && isTeacher ? " · Unpublished" : ""}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-500 shrink-0">{item.pointsPossible != null ? `${item.pointsPossible} pts` : ""}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
