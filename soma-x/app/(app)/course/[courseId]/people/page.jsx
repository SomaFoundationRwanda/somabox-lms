"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { PageHeader, DataTable } from "@/components/layout";

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
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader
          title="People"
          actions={isTeacher ? (
            <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2">
              <Plus className="w-3.5 h-3.5" /> Add Person
            </button>
          ) : null}
        />

        {adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email address" aria-label="Email address" className="flex-1 min-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]" />
            <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} aria-label="Role" className="text-sm border border-slate-200 rounded-lg px-2 py-2">
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={addPerson} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Add</button>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter by role">
          {["all", ...ROLE_OPTIONS].map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)} aria-pressed={roleFilter === r} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${roleFilter === r ? "bg-[#203A3A] text-white border-[#203A3A]" : "border-slate-200 text-slate-600"}`}>
              {r}
            </button>
          ))}
        </div>

        <AsyncListState loading={loading} error={error} data={filtered} onRetry={refetch} emptyMessage="No one here yet.">
          {(list) => (
            <DataTable
              caption="Course members"
              rows={list}
              columns={[
                { key: "fullName", header: "Name", className: "font-medium text-slate-700 dark:text-slate-200" },
                { key: "email", header: "Email", hideOnMobile: true, className: "text-slate-600 dark:text-slate-400" },
                { key: "role", header: "Role", className: "capitalize text-slate-600 dark:text-slate-400" },
                { key: "status", header: "Status", className: "capitalize text-slate-600 dark:text-slate-400" },
                ...(isTeacher ? [{
                  key: "manage",
                  header: "Manage",
                  align: "right",
                  render: (person) => (
                    <button onClick={() => removePerson(person.id)} aria-label={`Remove ${person.fullName}`} className="p-1.5 rounded-md hover:bg-slate-100 text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ),
                }] : []),
              ]}
            />
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
