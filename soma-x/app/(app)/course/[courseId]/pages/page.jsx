"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Layers } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function PagesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const [pages, setPages] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [pageRes, modRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/pages`),
        fetch(`${SERVER_URL}/courses/${courseId}/modules`),
      ]);

      if (pageRes.ok) setPages(await pageRes.json());
      if (modRes.ok) {
        const mods = await modRes.json();
        setModules(mods);
        if (mods.length > 0) setSelectedModuleId(mods[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [SERVER_URL, courseId, userEmail]);

  const createPage = async () => {
    if (!title.trim() || !selectedModuleId) return;
    try {
      await fetch(`${SERVER_URL}/courses/${courseId}/modules/${selectedModuleId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: "page", title: title.trim() }),
      });
      setTitle("");
      setCreating(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <Breadcrumbs sectionKey="pages" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#0D9488]" /> Course Reading & Study Pages
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Pages provide readings and study content bound to module week slots.
            </p>
          </div>
          {isTeacher ? (
            <button
              onClick={() => setCreating((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-xl px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Page
            </button>
          ) : null}
        </div>

        {/* CREATION FORM WITH REQUIRED MODULE BINDING */}
        {creating && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800">Add Page to Module Slot</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">Page Title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Introduction to Cell Division"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Target Module *</label>
                <select
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none"
                >
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      Week {m.week_offset || 1}: {m.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-xs font-semibold text-slate-500 px-3 py-2">Cancel</button>
              <button onClick={createPage} disabled={!title.trim() || !selectedModuleId} className="text-xs font-bold text-white bg-[#0D9488] rounded-xl px-4 py-2">
                Create Page
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
          {pages.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No pages created yet.</div>
          ) : (
            pages.map((p) => (
              <Link key={p.id} href={`/course/${courseId}/pages/${p.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-[#0D9488] shrink-0" />
                  <span className="text-sm font-bold text-slate-900 truncate">{p.title}</span>
                </div>
                <span className="text-xs font-semibold text-[#0D9488] shrink-0 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
                  Read Page &rarr;
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
