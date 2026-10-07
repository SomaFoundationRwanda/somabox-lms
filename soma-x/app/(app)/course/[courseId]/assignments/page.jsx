"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, HelpCircle, MessageSquare, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

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
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#0D9488]" /> Course Assignments
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Assignments belong to module week slots and evaluate tagged outcome mastery.
            </p>
          </div>
          {isTeacher ? (
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-xl px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add from Modules
            </Link>
          ) : null}
        </div>

        {/* ASSIGNMENTS LIST */}
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No assignments created yet.</div>
          ) : (
            items.map((item) => {
              const Icon = KIND_ICONS[item.kind] || ClipboardList;
              const href = item.kind === "assignment" ? `/course/${courseId}/assignments/${item.id}`
                : item.kind === "quiz" ? `/course/${courseId}/quizzes/${item.id}`
                : `/course/${courseId}/discussions/${item.id}`;
              return (
                <Link key={`${item.kind}-${item.id}`} href={href} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-[#0D9488] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{item.title}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                          Week Module Slot
                        </span>
                        {item.dueAt && <span>Due: {new Date(item.dueAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-700 shrink-0 bg-slate-100 px-3 py-1 rounded-full">
                    {item.pointsPossible != null ? `${item.pointsPossible} pts` : ""}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
