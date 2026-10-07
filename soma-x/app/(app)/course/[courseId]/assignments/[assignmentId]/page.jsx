"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil, Target, Clock, Lock, CalendarClock } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, EmptyState } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import RubricSection, { RubricTable } from "@/components/course/grading/RubricSection";
import SubmissionGrader, { LateBadge } from "@/components/course/grading/SubmissionGrader";
import { fmtPoints, pctOf } from "@/lib/rubric";
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
  const [rubric, setRubric] = useState(null);
  const [people, setPeople] = useState([]);
  const [extraLearner, setExtraLearner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitResult, setSubmitResult] = useState(null);
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadData = async () => {
    if (!SERVER_URL || !courseId || !assignmentId) return;
    try {
      setLoading(true);
      const [assignRes, modRes, outRes, itemOutRes, rubricRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}`),
        fetch(`${SERVER_URL}/courses/${courseId}/modules`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes`),
        fetch(`${SERVER_URL}/courses/${courseId}/item-outcomes`),
        fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/rubric`),
      ]);

      if (assignRes.ok) setAssignment(await assignRes.json());
      if (rubricRes.ok) setRubric(await rubricRes.json().catch(() => null));
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

  // Teachers can grade a learner who has no submission (e.g. oral work).
  useEffect(() => {
    if (!isTeacher || !SERVER_URL || !courseId) return;
    let cancelled = false;
    fetch(`${SERVER_URL}/courses/${courseId}/people`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => { if (!cancelled) setPeople(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isTeacher, SERVER_URL, courseId]);

  const submitAssignment = async () => {
    setSubmitError("");
    setSubmitResult(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: submissionBody }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fallback = { CLOSED: "This assignment is closed.", NOT_OPEN_YET: "This assignment is not open yet." }[payload.code];
        setSubmitError(payload.message || fallback || "Could not submit the assignment.");
      } else {
        setSubmitResult(payload);
        setSubmissionBody("");
        showToast(payload.late ? "Submitted late" : "Submitted", payload.late ? "warning" : "success");
      }
      loadData();
    } catch (err) {
      setSubmitError(err.message || "Could not submit the assignment.");
    } finally {
      setSubmitting(false);
    }
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
  const submissions = Array.isArray(assignment.submissions) ? assignment.submissions : [];
  const rubricSignature = rubric ? `${rubric.id}:${(rubric.criteria || []).map((c) => c.id).join(",")}` : "none";
  const submittedEmails = new Set(submissions.map((x) => String(x.scholar_email).toLowerCase()));
  const learnersWithout = people.filter((p) => p.role === "student" && p.status === "active" && !submittedEmails.has(String(p.email).toLowerCase()));
  const extraPerson = extraLearner ? learnersWithout.find((p) => p.email === extraLearner) : null;
  const extraRow = extraPerson ? { scholar_email: extraPerson.email, fullName: extraPerson.fullName, grade: null, feedback: "", rubricScores: [] } : null;
  const mine = assignment.mySubmission || null;
  const myScores = Object.fromEntries((mine?.rubricScores || []).map((r) => [r.criterion_id, r]));
  const deadlines = assignment.deadlines || {};
  const editModuleStart = editForm ? modules.find((m) => Number(m.id) === Number(editForm.moduleId))?.startDate || null : null;

  return (
    <div>
      <Breadcrumbs sectionKey="assignments" itemName={assignment.title} />
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">

        {/* Header: flat band, not a card */}
        <PageHeader
          title={assignment.title}
          meta={
            <>
              <span className="text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
                Module: {currentModule ? `${moduleWeekLabel(currentModule)} - ${currentModule.title}` : "Not in a module"}
              </span>
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> {dueText}
              </span>
            </>
          }
          actions={isTeacher && !editing ? (
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Assignment
            </button>
          ) : null}
        >
          {/* Outcome Tags */}
          <div className="flex items-center gap-2 flex-wrap pt-2">
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
        </PageHeader>

        {/* EDIT FORM (If Teacher Editing) */}
        {editing ? (
          <Section title="Edit assignment flow & parameters">
            <div className="space-y-5">
              <div>
                <label htmlFor="assignment-title" className="block text-xs font-bold text-slate-700 mb-1">Title *</label>
                <input
                  id="assignment-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0D9488]"
                />
              </div>

              {/* Module & relative timing */}
              <div>
                <label htmlFor="assignment-module" className="block text-xs font-bold text-slate-700 mb-1">Tied Module Week *</label>
                <select
                  id="assignment-module"
                  value={editForm.moduleId}
                  onChange={(e) => setEditForm((p) => ({ ...p, moduleId: Number(e.target.value) }))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none"
                >
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {moduleWeekLabel(m)}: {m.title}
                    </option>
                  ))}
                </select>
              </div>

              <ScheduleFields
                values={editForm.schedule}
                onChange={(schedule) => setEditForm((p) => ({ ...p, schedule }))}
                moduleStartDate={editModuleStart}
              />

              {/* Outcome Selection */}
              <fieldset className="space-y-2">
                <legend className="block text-xs font-bold text-slate-700 mb-1">Tagged Course Outcomes (Mandatory for Publish)</legend>
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
              </fieldset>

              <div>
                <label htmlFor="assignment-instructions" className="block text-xs font-bold text-slate-700 mb-1">Instructions</label>
                <textarea
                  id="assignment-instructions"
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  rows={4}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>

              {saveError && (
                <p className="text-xs font-semibold text-rose-600">{saveError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditing(false)} className="text-xs font-semibold text-slate-500 px-4 py-2">Cancel</button>
                <button onClick={saveEdit} disabled={saving} className="text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 px-5 py-2.5 rounded-lg">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </Section>
        ) : (
          /* DISPLAY VIEW (BOTH TEACHER & STUDENT) */
          <>
            <Section title="Assignment instructions">
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{assignment.description || "Complete the problem set and submit your response below."}</p>
            </Section>

            {isTeacher ? (
              <>
                <RubricSection
                  SERVER_URL={SERVER_URL}
                  courseId={courseId}
                  assignmentId={assignmentId}
                  rubric={rubric}
                  outcomes={outcomes}
                  taggedOutcomes={itemOutcomes}
                  pointsPossible={assignment.points_possible}
                  onChange={(next) => { setRubric(next); loadData(); }}
                />

                <Section
                  divided
                  title="Submissions"
                  description={rubric ? "Open a submission to score it against the rubric." : "Open a submission to enter a grade."}
                >
                  {submissions.length === 0 && !extraRow ? (
                    <EmptyState compact title="No submissions yet." />
                  ) : (
                    <List label="Submissions">
                      {extraRow ? (
                        <SubmissionGrader
                          key={`extra-${extraRow.scholar_email}-${rubricSignature}`}
                          SERVER_URL={SERVER_URL}
                          courseId={courseId}
                          assignmentId={assignmentId}
                          submission={extraRow}
                          rubric={rubric}
                          pointsPossible={assignment.points_possible}
                          defaultOpen
                          onSaved={() => { setExtraLearner(""); loadData(); }}
                        />
                      ) : null}
                      {submissions.map((s) => (
                        <SubmissionGrader
                          key={`${s.scholar_email}-${s.graded_at || ""}-${s.grade ?? ""}-${rubricSignature}`}
                          SERVER_URL={SERVER_URL}
                          courseId={courseId}
                          assignmentId={assignmentId}
                          submission={s}
                          rubric={rubric}
                          pointsPossible={assignment.points_possible}
                          onSaved={loadData}
                        />
                      ))}
                    </List>
                  )}

                  {learnersWithout.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <div>
                        <label htmlFor="grade-without-submission" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          Grade a learner without a submission
                        </label>
                        <select
                          id="grade-without-submission"
                          value={extraLearner}
                          onChange={(e) => setExtraLearner(e.target.value)}
                          className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 max-w-full"
                        >
                          <option value="">Choose a learner…</option>
                          {learnersWithout.map((p) => (
                            <option key={p.email} value={p.email}>{p.fullName || p.email}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}
                </Section>
              </>
            ) : (
              <>
                {rubric ? (
                  <Section divided title="Rubric" description={`Your work is scored on these criteria and converted to a grade out of ${fmtPoints(assignment.points_possible)}.`}>
                    <RubricTable rubric={rubric} scores={mine?.grade != null ? myScores : undefined} />
                  </Section>
                ) : null}

                <Section divided title="Your submission">
                  <div className="space-y-4">
                    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {deadlines.releaseDate ? <div className="flex gap-1"><dt className="font-semibold">Opens</dt><dd>{formatDate(deadlines.releaseDate)}</dd></div> : null}
                      {deadlines.dueDate ? <div className="flex gap-1"><dt className="font-semibold">Due</dt><dd>{formatDate(deadlines.dueDate)}</dd></div> : null}
                      {deadlines.closeDate ? <div className="flex gap-1"><dt className="font-semibold">Closes</dt><dd>{formatDate(deadlines.closeDate)}</dd></div> : null}
                      {!deadlines.releaseDate && !deadlines.dueDate && !deadlines.closeDate ? <div>No deadlines set.</div> : null}
                    </dl>

                    {mine ? (
                      <div className="border-l-4 border-teal-500 pl-3 py-1 space-y-1">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-2">
                          {mine.submitted_at ? `Submitted ${new Date(mine.submitted_at).toLocaleString()}` : "Graded without a submission"}
                          {mine.is_late ? <LateBadge /> : null}
                        </p>
                        {mine.grade != null ? (
                          <p className="text-sm font-bold text-slate-900 dark:text-white">
                            Grade: {fmtPoints(mine.grade)} / {fmtPoints(assignment.points_possible)}
                            {pctOf(mine.grade, assignment.points_possible) != null ? ` (${fmtPoints(pctOf(mine.grade, assignment.points_possible))}%)` : ""}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500">Not graded yet.</p>
                        )}
                        {mine.feedback ? (
                          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap"><span className="font-semibold">Feedback:</span> {mine.feedback}</p>
                        ) : null}
                      </div>
                    ) : null}

                    {submitResult?.late ? (
                      <p role="status" className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Submitted after the due date: it is marked late.
                      </p>
                    ) : null}

                    {deadlines.notOpenYet ? (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <CalendarClock className="w-4 h-4 text-slate-400" /> Opens on {formatDate(deadlines.releaseDate) || deadlines.releaseDate}.
                      </p>
                    ) : deadlines.isClosed ? (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-slate-400" /> This assignment is closed.
                      </p>
                    ) : (
                      <>
                        {deadlines.isLate ? (
                          <p className="text-xs font-semibold text-amber-800">The due date has passed. You can still submit, but it will be marked late.</p>
                        ) : null}
                        <textarea
                          value={submissionBody}
                          onChange={(e) => setSubmissionBody(e.target.value)}
                          rows={6}
                          placeholder="Write your response here..."
                          aria-label="Your assignment response"
                          className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg p-4 outline-none focus:border-[#0D9488]"
                        />
                      </>
                    )}

                    {submitError ? <p role="alert" className="text-xs font-semibold text-rose-600">{submitError}</p> : null}

                    <button
                      onClick={submitAssignment}
                      disabled={submitting || deadlines.notOpenYet || deadlines.isClosed}
                      className="px-6 py-2.5 bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-[#0D9488] text-white font-bold text-xs rounded-lg transition-colors"
                    >
                      {submitting ? "Submitting..." : mine?.submitted_at ? "Resubmit assignment" : "Submit assignment"}
                    </button>
                  </div>
                </Section>
              </>
            )}
          </>
        )}

        <PrevNextNav courseId={courseId} itemType="assignment" contentId={assignmentId} />
      </div>
    </div>
  );
}
