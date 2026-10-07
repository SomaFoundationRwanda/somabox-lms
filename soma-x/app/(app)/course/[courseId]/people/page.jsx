"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";

const ROLE_OPTIONS = ["teacher", "ta", "student", "observer"];

export default function PeoplePage() {
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { data: people, loading, error, refetch } = useCourseSection("people");
  const [roleFilter, setRoleFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: "", role: "student" });

  const filtered = Array.isArray(people) ? people.filter((p) => roleFilter === "all" || p.role === roleFilter) : people;

  const addPerson = async () => {
    if (!form.email.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.email.trim(), role: form.role }),
    });
    setForm({ email: "", role: "student" });
    setAdding(false);
    refetch();
  };

  const removePerson = async (enrollmentId) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/people/${enrollmentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="people" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-slate-900">People</h1>
          {isTeacher ? (
            <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2">
              <Plus className="w-3.5 h-3.5" /> Add Person
            </button>
          ) : null}
        </div>

        {adding ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email address" className="flex-1 min-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]" />
            <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-2 py-2">
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={addPerson} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Add</button>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", ...ROLE_OPTIONS].map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${roleFilter === r ? "bg-[#203A3A] text-white border-[#203A3A]" : "border-slate-200 text-slate-600"}`}>
              {r}
            </button>
          ))}
        </div>

        <AsyncListState loading={loading} error={error} data={filtered} onRetry={refetch} emptyMessage="No one here yet.">
          {(list) => (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="pb-2 px-2 text-xs font-bold text-slate-500 uppercase">Name</th>
                    <th className="pb-2 px-2 text-xs font-bold text-slate-500 uppercase">Email</th>
                    <th className="pb-2 px-2 text-xs font-bold text-slate-500 uppercase">Role</th>
                    <th className="pb-2 px-2 text-xs font-bold text-slate-500 uppercase">Status</th>
                    {isTeacher ? <th className="pb-2 px-2 text-xs font-bold text-slate-500 uppercase">Manage</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((person) => (
                    <tr key={person.id}>
                      <td className="py-2.5 px-2 text-sm font-medium text-slate-700">{person.fullName}</td>
                      <td className="py-2.5 px-2 text-sm text-slate-600">{person.email}</td>
                      <td className="py-2.5 px-2 text-sm text-slate-600 capitalize">{person.role}</td>
                      <td className="py-2.5 px-2 text-sm text-slate-600 capitalize">{person.status}</td>
                      {isTeacher ? (
                        <td className="py-2.5 px-2">
                          <button onClick={() => removePerson(person.id)} className="p-1.5 rounded-md hover:bg-slate-100 text-rose-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
