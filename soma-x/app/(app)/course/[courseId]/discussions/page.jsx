"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { Button } from "@/components/ui/button";

export default function DiscussionsListPage() {
  const { SERVER_URL, courseId } = useCourse();
  const { data: discussions, loading, error, refetch } = useCourseSection("discussions");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });

  const create = async () => {
    if (!form.title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/discussions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title.trim(), body: form.body }),
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
          <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Discussion
          </Button>
        </div>

        {creating ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={3} placeholder="Start the discussion..." className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-xs font-medium text-slate-500 px-3 py-2">Cancel</button>
              <button onClick={create} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Post</button>
            </div>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={discussions} onRetry={refetch} emptyMessage="No discussions yet.">
          {(list) => (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {list.map((d) => (
                <Link key={d.id} href={`/course/${courseId}/discussions/${d.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-700 truncate">{d.title}</span>
                    {d.graded ? <span className="text-[10px] font-bold uppercase text-teal-600 bg-teal-50 rounded-full px-1.5 py-0.5 shrink-0">Graded</span> : null}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{d.replyCount} repl{d.replyCount === 1 ? "y" : "ies"}</span>
                </Link>
              ))}
            </div>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
