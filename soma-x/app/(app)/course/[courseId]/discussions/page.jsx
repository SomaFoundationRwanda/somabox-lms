"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function DiscussionsListPage() {
  const { SERVER_URL, courseId, userEmail } = useCourse();
  const { data: discussions, loading, error, refetch } = useCourseSection("discussions");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });

  const create = async () => {
    if (!form.title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/discussions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail, title: form.title.trim(), body: form.body }),
    });
    setForm({ title: "", body: "" });
    setCreating(false);
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="discussions" />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Discussions</h1>
          <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2">
            <Plus className="w-3.5 h-3.5" /> New Discussion
          </button>
        </div>

        {creating ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={3} placeholder="Start the discussion..." className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <button onClick={create} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Post</button>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error && (!discussions || discussions.length === 0) ? <EmptyState message="No discussions yet." /> : null}

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {(discussions || []).map((d) => (
            <Link key={d.id} href={`/course/${courseId}/discussions/${d.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 truncate">{d.title}</span>
              </div>
              <span className="text-xs text-slate-400 shrink-0">{d.replyCount} repl{d.replyCount === 1 ? "y" : "ies"}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
