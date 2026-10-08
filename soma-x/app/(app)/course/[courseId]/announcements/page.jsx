"use client";

import { useState } from "react";
import { Pin, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { PageHeader, List } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useCourseText } from "@/components/course/useCourseText";

export default function AnnouncementsPage() {
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { t, fmtDate } = useCourseText();
  const { data: announcements, loading, error, refetch } = useCourseSection("announcements");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });

  const create = async () => {
    if (!form.title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title.trim(), body: form.body }),
    });
    setForm({ title: "", body: "" });
    setCreating(false);
    refetch();
  };

  const togglePin = async (a) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/announcements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !a.pinned }),
    });
    refetch();
  };

  const sorted = Array.isArray(announcements)
    ? [...announcements].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
      })
    : announcements;

  return (
    <div>
      <Breadcrumbs sectionKey="announcements" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="pages.announcements"
          title={t("nav.announcements")}
          actions={isTeacher ? (
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {t("announcements.new")}
            </Button>
          ) : null}
        />

        {creating ? (
          <div className="space-y-2">
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={t("common.title")} aria-label={t("announcements.titleLabel")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]" />
            <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={3} placeholder={t("announcements.message")} aria-label={t("announcements.messageLabel")} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-xs font-medium text-slate-500 px-3 py-2">{t("common.cancel")}</button>
              <button onClick={create} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">{t("discussions.post")}</button>
            </div>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={sorted} onRetry={refetch} emptyMessage={t("announcements.empty")}>
          {(list) => (
            <List label={t("nav.announcements")}>
              {list.map((a) => (
                <li key={a.id} className={`px-3 py-3 ${a.pinned ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {a.pinned ? <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label={t("announcements.pinned")} /> : null}
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{a.title}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{fmtDate(a.created_at)}</span>
                  </div>
                  {a.body ? <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">{a.body}</p> : null}
                  <div className="flex items-center gap-2 mt-1.5">
                    {!a.published && isTeacher ? <span className="text-[10px] font-bold uppercase text-amber-600">{t("common.unpublished")}</span> : null}
                    {isTeacher ? (
                      <button onClick={() => togglePin(a)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-700">
                        {a.pinned ? t("announcements.unpin") : t("announcements.pin")}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </List>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
