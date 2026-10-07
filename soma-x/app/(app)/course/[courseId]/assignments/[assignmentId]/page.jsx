"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil, Target, CheckCircle2, Award, Calendar, Layers, Clock } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";
import { moduleWeekLabel } from "@/lib/moduleLabels";
import { formatDate } from "@/lib/dates";
import ScheduleFields, { initialScheduleValues, scheduleError, schedulePayload } from "@/components/course/modules/editors/ScheduleFields";

const itemDaysOf = (item) => ({ release_day: item.release_day, due_day: item.due_day, close_day: item.close_day });

export default function AssignmentDetailPage() {
  const { courseId, assignmentId } = useParams();
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const [assignment, setAssignment] = useState(null);
  const [modules, setModules] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [itemOutcomes, setItemOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submissionBody, setSubmissionBody] = useState("");
  const [grading, setGrading] = useState({});
  const [feedback, setFeedback] = useState({});
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadData = async () => {
    if (!SERVER_URL || !courseId || !assignmentId) return;
    try {
      setLoading(true);
      const [assignRes, modRes, outRes, itemOutRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}`),
        fetch(`${SERVER_URL}/courses/${courseId}/modules`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes`),
        fetch(`${SERVER_URL}/courses/${courseId}/item-outcomes`),
      ]);

      if (assignRes.ok) setAssignment(await assignRes.json());
      if (modRes.ok) setModules(await modRes.json());
      if (outRes.ok) setOutcomes(await outRes.json());
      if (itemOutRes.ok) {
        const allTags = await itemOutRes.json();
        const myTags = allTags.filter(t => t.item_type === 'assignment' && Number(t.item_id) === Number(assignmentId));
        setItemOutcomes(myTags);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [SERVER_URL, courseId, assignmentId, userEmail]);

  const submitAssignment = async () => {
    await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: submissionBody }),
    });
    loadData();
  };

  const gradeSubmission = async (scholarEmail) => {
    const gradeVal = grading[scholarEmail];
    const fbVal = feedback[scholarEmail] || "";
    if (gradeVal === undefined || gradeVal === "") return;
    await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/grade/${encodeURIComponent(scholarEmail)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: Number(gradeVal), feedback: fbVal }),
    });
    loadData();
  };

  // The assignment's module listing carries its day offsets and resolved dates.
  const listing = modules
    .flatMap((m) => (Array.isArray(m.items) ? m.items : []))
    .find((i) => i.item_type === "assignment" && Number(i.content_id) === Number(assignmentId)) || null;

  const startEditing = () => {
    setEditForm({
      title: assignment.title || "",
      description: assignment.description || "",
      moduleId: assignment.module?.id ?? assignment.module_id ?? "",
      schedule: initialScheduleValues(listing ? itemDaysOf(listing) : null),
      pointsPossible: assignment.points_possible ?? 100,
      published: !!assignment.published,
      selectedOutcomeIds: itemOutcomes.map(o => o.outcome_id),
      rubricDraft: assignment.rubric_draft || `Rubric (Instantiated from Outcomes):\n- Exceeds Mastery (4 pts): Complete accuracy and clear reasoning.\n- Meets Mastery (3 pts): Correct application with minor errors.\n- Approaching Mastery (2 pts): Partial understanding.\n- Below Mastery (1 pt): Needs targeted reteaching.`
    });
    setSaveError("");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editForm.title.trim()) return;
    const timingError = scheduleError(editForm.schedule);
    if (timingError) { setSaveError(timingError); return; }
    setSaving(true);
    setSaveError("");
    try {
      const saveOutcomes = async () => {
        if (!editForm.selectedOutcomeIds) return true;
        const res = await fetch(`${SERVER_URL}/courses/${courseId}/item-outcomes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemType: "assignment",
            itemId: Number(assignmentId),
            outcomeIds: editForm.selectedOutcomeIds
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setSaveError(payload.message || "Failed to update outcome tags.");
          return false;
        }
        return true;
      };

      const saveAssignment = async () => {
        const res = await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editForm.title.trim(),
            description: editForm.description,
            moduleId: editForm.moduleId,
            ...schedulePayload(editForm.schedule),
            pointsPossible: Number(editForm.pointsPossible) || 100,
            published: editForm.published,
            rubricDraft: editForm.rubricDraft
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setSaveError(payload.message || "Failed to save assignment.");
          return false;
        }
        return true;
      };

      // Publishing requires an outcome tag, and removing the last tag from a
      // published item is rejected — so order the two writes accordingly.
      const ok = editForm.published
        ? (await saveOutcomes()) && (await saveAssignment())
        : (await saveAssignment()) && (await saveOutcomes());
      if (!ok) {
        loadData();
        return;
      }

      setEditing(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading assignment details...</p></div>;
  if (!assignment) return <div className="p-6"><p className="text-sm text-rose-600">Assignment not found.</p></div>;

  const currentModule = assignment.module || modules.find(m => m.id === assignment.module_id) || null;
  const dueText = listing?.dueDate
    ? `Due ${formatDate(listing.dueDate)}${listing.closeDate ? ` · Closes ${formatDate(listing.closeDate)}` : ""}`
    : listing && listing.due_day != null
      ? `Due: Day ${listing.due_day}`
      : assignment.due_at
        ? `Due ${new Date(assignment.due_at).toLocaleDateString()}`
        : "No due date";
  const editModuleStart = editForm ? modules.find((m) => Number(m.id) === Number(editForm.moduleId))?.startDate || null : null;

  return (
    <div>
      <Breadcrumbs sectionKey="assignments" itemName={assignment.title} />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">

        {/* Header Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
                Module: {currentModule ? `${moduleWeekLabel(currentModule)} - ${currentModule.title}` : "Not in a module"}
              </span>
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> {dueText}
              </span>
            </div>

            {isTeacher && !editing && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Assignment
              </button>
            )}
          </div>

          <h1 className="text-2xl font-black text-slate-900">{assignment.title}</h1>

          {/* Outcome Tags */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-[#0D9488]" /> Target Outcomes:
            </span>
            {itemOutcomes.length === 0 ? (
              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                ⚠️ Missing Outcome Tag
              </span>
            ) : (
              itemOutcomes.map((t) => (
                <span key={t.outcome_id} className="text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  {t.outcome_code}: {t.outcome_title}
                </span>
              ))
            )}
          </div>
        </div>

        {/* EDIT FORM (If Teacher Editing) */}
        {editing ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">Edit Assignment Flow & Parameters</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Title *</label>
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#0D9488]"
                />
              </div>

              {/* Module & relative timing */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tied Module Week *</label>
                  <select
                    value={editForm.moduleId}
                    onChange={(e) => setEditForm((p) => ({ ...p, moduleId: Number(e.target.value) }))}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none"
                  >
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {moduleWeekLabel(m)}: {m.title}
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              <ScheduleFields
                values={editForm.schedule}
                onChange={(schedule) => setEditForm((p) => ({ ...p, schedule }))}
                moduleStartDate={editModuleStart}
              />

              {/* Outcome Selection */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-slate-700">Tagged Course Outcomes (Mandatory for Publish)</label>
                <div className="space-y-1">
                  {outcomes.map((o) => {
                    const isChecked = editForm.selectedOutcomeIds.includes(o.id);
                    return (
                      <label key={o.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm(p => ({ ...p, selectedOutcomeIds: [...p.selectedOutcomeIds, o.id] }));
                            } else {
                              setEditForm(p => ({ ...p, selectedOutcomeIds: p.selectedOutcomeIds.filter(id => id !== o.id) }));
                            }
                          }}
                        />
                        <span><strong>{o.code || `OUT-${o.id}`}</strong>: {o.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Instructions</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  rows={4}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>

              {/* Rubric Draft */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assignment Rubric Criteria</label>
                <textarea
                  value={editForm.rubricDraft}
                  onChange={(e) => setEditForm((p) => ({ ...p, rubricDraft: e.target.value }))}
                  rows={4}
                  className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2 outline-none"
                />
              </div>

              {saveError && (
                <p className="text-xs font-semibold text-rose-600">{saveError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditing(false)} className="text-xs font-semibold text-slate-500 px-4 py-2">Cancel</button>
                <button onClick={saveEdit} disabled={saving} className="text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 px-5 py-2.5 rounded-xl">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* DISPLAY VIEW (BOTH TEACHER & STUDENT) */
          <div className="space-y-6">
            {/* Description */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-2">
              <h3 className="text-sm font-bold text-slate-900">Assignment Instructions</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{assignment.description || "Complete the problem set and submit your response below."}</p>
            </div>

            {/* INSTANTIATED RUBRIC BREAKDOWN (STUDENT & TEACHER VISIBLE) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#0D9488]" /> Instantiated Outcome Rubric ({assignment.points_possible} pts)
              </h3>
              <p className="text-xs text-slate-500">
                Your work will be evaluated against these 4 mastery levels:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-1">
                  <span className="text-xs font-bold text-teal-900 block">Exceeds Mastery (4 pts)</span>
                  <p className="text-[11px] text-teal-700">Flawless solution with multi-step logical reasoning.</p>
                </div>
                <div className="p-3 bg-teal-50/60 border border-teal-200 rounded-xl space-y-1">
                  <span className="text-xs font-bold text-teal-900 block">Meets Mastery (3 pts)</span>
                  <p className="text-[11px] text-teal-700">Accurate execution with minor minor calculation errors.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-xs font-bold text-slate-800 block">Approaching (2 pts)</span>
                  <p className="text-[11px] text-slate-600">Partial understanding; needs additional scaffolding.</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-xs font-bold text-slate-800 block">Below Mastery (1 pt)</span>
                  <p className="text-[11px] text-slate-600">Struggling with core concepts; requires reteaching.</p>
                </div>
              </div>
            </div>

            {/* TEACHER SUBMISSIONS VIEW WITH AI GRADING ASSIST */}
            {isTeacher ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900">Student Submissions & Rubric Scoring</h3>
                {(assignment.submissions || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No student submissions received yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {assignment.submissions.map((s) => (
                      <div key={s.scholar_email} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{s.fullName}</p>
                            <p className="text-xs text-slate-500">Submitted: {new Date(s.submitted_at).toLocaleString()}</p>
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-mono">
                          {s.body || "(No submission body)"}
                        </div>

                        <div className="flex items-center gap-3 pt-1">
                          <input
                            type="number"
                            placeholder="Grade"
                            value={grading[s.scholar_email] ?? (s.grade ?? "")}
                            onChange={(e) => setGrading((p) => ({ ...p, [s.scholar_email]: e.target.value }))}
                            className="w-24 text-xs border border-slate-200 rounded-xl px-3 py-2"
                          />
                          <input
                            type="text"
                            placeholder="Qualitative feedback suggestion..."
                            value={feedback[s.scholar_email] ?? (s.feedback ?? "")}
                            onChange={(e) => setFeedback((p) => ({ ...p, [s.scholar_email]: e.target.value }))}
                            className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2"
                          />
                          <button onClick={() => gradeSubmission(s.scholar_email)} className="text-xs font-bold text-white bg-[#0D9488] px-4 py-2 rounded-xl">
                            Save Grade
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* STUDENT SUBMISSION SECTION */
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900">Your Submission</h3>

                {assignment.mySubmission ? (
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl space-y-1">
                    <p className="text-xs font-bold text-teal-900">Submitted: {new Date(assignment.mySubmission.submitted_at).toLocaleString()}</p>
                    {assignment.mySubmission.grade != null ? (
                      <p className="text-sm font-bold text-teal-800">Grade: {assignment.mySubmission.grade} / {assignment.points_possible} pts</p>
                    ) : (
                      <p className="text-xs text-teal-700">Status: Ungraded (Pending Teacher Rubric Review)</p>
                    )}
                    {assignment.mySubmission.feedback && (
                      <p className="text-xs text-teal-800 pt-1">Teacher Feedback: "{assignment.mySubmission.feedback}"</p>
                    )}
                  </div>
                ) : null}

                <textarea
                  value={submissionBody}
                  onChange={(e) => setSubmissionBody(e.target.value)}
                  rows={6}
                  placeholder="Write your detailed assignment response here..."
                  className="w-full text-sm border border-slate-200 rounded-2xl p-4 outline-none focus:border-[#0D9488]"
                />

                <button
                  onClick={submitAssignment}
                  className="px-6 py-2.5 bg-[#0D9488] hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
                >
                  {assignment.mySubmission ? "Resubmit Assignment" : "Submit Assignment"}
                </button>
              </div>
            )}
          </div>
        )}

        <PrevNextNav courseId={courseId} itemType="assignment" contentId={assignmentId} />
      </div>
    </div>
  );
}
