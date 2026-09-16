"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";

function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AssignmentDetailPage() {
  const { courseId, assignmentId } = useParams();
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [grading, setGrading] = useState({});
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}?userEmail=${encodeURIComponent(userEmail)}`);
    const payload = await res.json();
    if (res.ok) setAssignment(payload);
    setLoading(false);
  };

  useEffect(() => { if (SERVER_URL && userEmail) load(); }, [SERVER_URL, userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail, body }),
    });
    load();
  };

  const gradeSubmission = async (scholarEmail) => {
    const grade = grading[scholarEmail];
    if (grade === undefined || grade === "") return;
    await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/grade/${encodeURIComponent(scholarEmail)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, grade: Number(grade) }),
    });
    load();
  };

  const startEditing = () => {
    setEditForm({
      title: assignment.title || "",
      description: assignment.description || "",
      dueAt: toDatetimeLocal(assignment.due_at),
      pointsPossible: assignment.points_possible ?? 100,
      published: !!assignment.published,
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editForm.title.trim()) return;
    setSaving(true);
    try {
      await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherEmail: userEmail,
          title: editForm.title.trim(),
          description: editForm.description,
          dueAt: editForm.dueAt || null,
          pointsPossible: Number(editForm.pointsPossible) || 0,
          published: editForm.published,
        }),
      });
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading...</p></div>;
  if (!assignment) return <div className="p-6"><p className="text-sm text-rose-600">Assignment not found.</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="assignments" itemName={assignment.title} />
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        {editing ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4 bg-white">
            <h2 className="text-sm font-bold text-slate-800">Edit Assignment</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Title</label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                rows={4}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Due date</label>
                <input
                  type="datetime-local"
                  value={editForm.dueAt}
                  onChange={(e) => setEditForm((p) => ({ ...p, dueAt: e.target.value }))}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Points</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.pointsPossible}
                  onChange={(e) => setEditForm((p) => ({ ...p, pointsPossible: e.target.value }))}
                  className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
                />
              </div>
              <label className="flex items-center gap-2 mt-5 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={editForm.published}
                  onChange={(e) => setEditForm((p) => ({ ...p, published: e.target.checked }))}
                />
                Published
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(false)} className="text-xs font-medium text-slate-500 px-3 py-2">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-4 py-2 disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-lg font-bold text-slate-900">{assignment.title}</h1>
              {isTeacher ? (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#203A3A] border border-slate-200 rounded-lg px-2.5 py-1.5 shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleString()}` : "No due date"} · {assignment.points_possible} points
              {!assignment.published && isTeacher ? " · Unpublished" : ""}
            </p>
            {assignment.description ? <p className="text-sm text-slate-700 whitespace-pre-wrap mt-2">{assignment.description}</p> : null}
          </div>
        )}

        {isTeacher ? (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800">Submissions</h2>
            {(assignment.submissions || []).length === 0 ? (
              <p className="text-xs text-slate-500">No submissions yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {assignment.submissions.map((s) => (
                  <div key={s.scholar_email} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{s.fullName}</p>
                      <p className="text-xs text-slate-500 truncate">{s.body || "(no text submitted)"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        placeholder={s.grade ?? "Grade"}
                        value={grading[s.scholar_email] ?? ""}
                        onChange={(e) => setGrading((p) => ({ ...p, [s.scholar_email]: e.target.value }))}
                        className="w-16 text-sm border border-slate-200 rounded-lg px-2 py-1"
                      />
                      <button onClick={() => gradeSubmission(s.scholar_email)} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-2.5 py-1.5">Save</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {assignment.mySubmission ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="font-semibold text-emerald-800">Submitted {new Date(assignment.mySubmission.submitted_at).toLocaleString()}</p>
                {assignment.mySubmission.grade != null ? <p className="text-emerald-700 mt-1">Grade: {assignment.mySubmission.grade} / {assignment.points_possible}</p> : <p className="text-emerald-700 mt-1">Not graded yet</p>}
              </div>
            ) : null}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write your submission..." className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#203A3A]" />
            <button onClick={submit} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-4 py-2">
              {assignment.mySubmission ? "Resubmit" : "Submit"}
            </button>
          </div>
        )}

        <PrevNextNav
          courseId={courseId}
          itemType="assignment"
          contentRefId={assignmentId}
        />
      </div>
    </div>
  );
}
