"use client";

import { useEffect, useState } from "react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function SyllabusPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data, loading, refetch } = useCourseSection("syllabus");
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");

  useEffect(() => { if (data) setBody(data.body || ""); }, [data]);

  const save = async () => {
    await fetch(`${SERVER_URL}/courses/${courseId}/syllabus`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, body }),
    });
    setEditing(false);
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="syllabus" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-bold text-slate-900">Syllabus</h1>
            {isTeacher ? (
              editing ? (
                <button onClick={save} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-1.5">Save</button>
              ) : (
                <button onClick={() => setEditing(true)} className="text-xs font-semibold text-[#203A3A] hover:underline">Edit</button>
              )
            ) : null}
          </div>
          {loading ? <p className="text-sm text-slate-500">Loading...</p> : editing ? (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#203A3A]" placeholder="Describe the course, expectations, and policies..." />
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{data?.body || "No syllabus written yet."}</p>
          )}
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-800 mb-2">Course Schedule</h2>
          {!data?.schedule || data.schedule.length === 0 ? (
            <p className="text-sm text-slate-500">No due dates scheduled yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {data.schedule.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-sm text-slate-700">{item.title}</span>
                  <span className="text-xs text-slate-500">{new Date(item.due_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
