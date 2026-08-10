"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function AnnouncementsPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: announcements, loading, error, refetch } = useCourseSection("announcements");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });

  const create = async () => {
    if (!form.title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, title: form.title.trim(), body: form.body }),
    });
    setForm({ title: "", body: "" });
    setCreating(false);
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="announcements" />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Announcements</h1>
          {isTeacher ? (
            <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2">
              <Plus className="w-3.5 h-3.5" /> New Announcement
            </button>
          ) : null}
        </div>

        {creating ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={3} placeholder="Message" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <button onClick={create} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Post</button>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error && (!announcements || announcements.length === 0) ? <EmptyState message="No announcements yet." /> : null}

        <div className="space-y-3">
          {(announcements || []).map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">{a.title}</p>
                <span className="text-xs text-slate-400">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              {a.body ? <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{a.body}</p> : null}
              {!a.published && isTeacher ? <span className="text-[10px] font-bold uppercase text-amber-600">Unpublished</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
