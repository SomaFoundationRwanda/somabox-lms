"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function PagesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const pageRes = await fetch(`${SERVER_URL}/courses/${courseId}/pages`);
      if (pageRes.ok) setPages(await pageRes.json());
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
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-xl px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add from Modules
            </Link>
          ) : null}
        </div>

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
