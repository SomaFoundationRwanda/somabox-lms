"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { Button } from "@/components/ui/button";

export default function PagesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: pages, loading, error, refetch } = useCourseSection("pages");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  const create = async () => {
    if (!title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, title: title.trim(), published: true }),
    });
    setTitle("");
    setCreating(false);
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="pages" />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Pages</h1>
          {isTeacher ? (
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Page
            </Button>
          ) : null}
        </div>

        {creating ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <button onClick={create} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Create</button>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={pages} onRetry={refetch} emptyMessage="No pages yet.">
          {(list) => (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {list.map((p) => (
                <Link key={p.id} href={`/course/${courseId}/pages/${p.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:text-[#203A3A]">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{p.title}</span>
                  {!p.published && isTeacher ? <span className="text-[10px] font-bold uppercase text-amber-600 ml-auto">Unpublished</span> : null}
                </Link>
              ))}
            </div>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
