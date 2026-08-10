"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";

export default function AssignmentDetailPage() {
  const { courseId, assignmentId } = useParams();
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [grading, setGrading] = useState({});

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

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading...</p></div>;
  if (!assignment) return <div className="p-6"><p className="text-sm text-rose-600">Assignment not found.</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="assignments" itemName={assignment.title} />
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <h1 className="text-lg font-bold text-slate-900">{assignment.title}</h1>
        <p className="text-xs text-slate-500">
          {assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleString()}` : "No due date"} · {assignment.points_possible} points
        </p>
        {assignment.description ? <p className="text-sm text-slate-700 whitespace-pre-wrap">{assignment.description}</p> : null}

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
