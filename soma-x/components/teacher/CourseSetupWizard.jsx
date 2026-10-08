"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, ChevronRight, Sparkles, Plus, Trash2, ArrowRight, Target, Calendar, BookOpen, Layers } from "lucide-react";
import { moduleWeekLabel } from "@/lib/moduleLabels";
import { isDateString, todayIn } from "@somabox/timeline";
import { formatDate, toDateInput } from "@/lib/dates";
import BaselinePanel from "./BaselinePanel";
import Link from "next/link";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob } from "@/lib/ai";
import { AiStatusNote } from "@/components/ai/AiBits";
import AiJobPanel from "@/components/ai/AiJobPanel";

export default function CourseSetupWizard({ SERVER_URL, courseId, userEmail, course, onCompleted }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openErrors, setOpenErrors] = useState([]);

  // Step 1 State: Setup
  const [setupForm, setSetupForm] = useState({
    title: course?.title || "",
    startDate: toDateInput(course?.start_date) || todayIn(),
    lengthWeeks: course?.length_weeks || 4,
    gradingScale: "A:90, B:80, C:70, D:60, F:<60",
  });

  // Step 2 State: Outcomes
  const [outcomes, setOutcomes] = useState([]);
  const [newOutcomeTitle, setNewOutcomeTitle] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const aiStatus = useAiStatus();
  const [outlineJob, setOutlineJob] = useState(null);
  const [aiStarting, setAiStarting] = useState("");
  const [fillStarted, setFillStarted] = useState({}); // moduleId -> true

  // Step 4 State: Modules
  const [modules, setModules] = useState([]);

  // Fetch initial wizard data
  const loadWizardData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [outRes, modRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes`),
        fetch(`${SERVER_URL}/courses/${courseId}/modules`),
      ]);
      if (outRes.ok) setOutcomes(await outRes.json());
      if (modRes.ok) setModules(await modRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWizardData();
  }, [SERVER_URL, courseId, userEmail]);

  // Step 1: Save Course details & next
  const saveStep1 = async () => {
    if (!isDateString(setupForm.startDate)) {
      setError("Choose a start date.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: setupForm.title,
          startDate: setupForm.startDate,
          lengthWeeks: setupForm.lengthWeeks,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to update course details");
      }
      setStep(2);
    } catch (err) {
      setError(err.message || "Failed to update course details");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Create Outcome
  const createOutcome = async () => {
    if (!newOutcomeTitle.trim()) return;
    setLoading(true);
    try {
      await fetch(`${SERVER_URL}/courses/${courseId}/outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newOutcomeTitle.trim(),
          description: "Core outcome statement",
        }),
      });
      setNewOutcomeTitle("");
      await loadWizardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: AI proposes an outline (outcomes + weeks) as a draft the teacher reviews inline.
  const proposeAiOutcomes = async () => {
    const topic = (aiTopic || setupForm.title).trim();
    if (!topic) { setError("Say what the course is about first."); return; }
    setAiStarting("outline");
    setError("");
    const r = await startAiJob(SERVER_URL, courseId, { kind: "outline", input: { topic, weeks: Number(setupForm.lengthWeeks) || 4 } });
    setAiStarting("");
    if (!r.ok) { setError(r.message); return; }
    setOutlineJob(r.data);
  };

  // Step 4: Create Module
  const addModuleWeek = async (weekOffset) => {
    setLoading(true);
    try {
      // Week 0 is the baseline module and is created by kind, not by offset.
      const body = Number(weekOffset) === 0
        ? { title: "Week 0: Baseline", kind: "baseline" }
        : { title: `Week ${weekOffset}: Module Title`, weekOffset };
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.message || "Failed to add week");
      }
      await loadWizardData();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 4: AI drafts a page, quiz and assignment for a week; they wait in AI drafts.
  const aiFillModule = async (moduleId) => {
    setAiStarting(`fill-${moduleId}`);
    setError("");
    const r = await startAiJob(SERVER_URL, courseId, { kind: "fill_week", moduleId });
    setAiStarting("");
    if (!r.ok) { setError(r.message); return; }
    setFillStarted((m) => ({ ...m, [moduleId]: true }));
  };

  // Step 5: Open Course
  const openCourseFinal = async () => {
    setLoading(true);
    setError("");
    setOpenErrors([]);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/open-course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        onCompleted?.();
      } else {
        const data = await res.json().catch(() => ({}));
        const blocking = Array.isArray(data.blocking) ? data.blocking.map((b) => b.message).filter(Boolean) : [];
        setError(data.message || "This course can't open yet.");
        setOpenErrors(blocking);
      }
    } catch (err) {
      setError("Failed to open course");
    } finally {
      setLoading(false);
    }
  };

  const STEPS = [
    { num: 1, label: "Course Setup" },
    { num: 2, label: "Outcomes" },
    { num: 3, label: "Baseline" },
    { num: 4, label: "Modules Timeline" },
    { num: 5, label: "Syllabus Preview" },
  ];

  return (
    <div className="space-y-0">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#0D9488]">Guided Setup</span>
              <h1 className="text-2xl font-black text-slate-900 mt-1">Setup Your Course Timeline</h1>
            </div>
            <span className="text-xs font-semibold bg-teal-50 text-[#0D9488] border border-teal-200 px-3 py-1.5 rounded-full">
              Step {step} of 5
            </span>
          </div>

          {/* Stepper progress */}
          <div className="grid grid-cols-5 gap-2 mt-6 overflow-x-auto">
            {STEPS.map((s) => (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                aria-current={step === s.num ? "step" : undefined}
                className={`flex flex-col items-start p-2.5 min-w-[5.5rem] rounded-xl border text-left transition-all ${
                  step === s.num
                    ? "bg-[#203A3A] text-white border-[#203A3A] shadow-sm"
                    : s.num < step
                    ? "bg-teal-50 text-teal-800 border-teal-200"
                    : "bg-white text-slate-400 border-slate-200"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  {s.num < step ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" /> : <span>{s.num}.</span>}
                  <span className="truncate">{s.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
            <p>{error}</p>
            {openErrors.length > 0 && (
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {openErrors.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}
          </div>
        ) : null}

        {/* STEP 1: Course Setup */}
        {step === 1 && (
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#0D9488]" /> Step 1: Course Setup & Relative Timing Anchor
            </h2>
            <p className="text-xs text-slate-600">
              Set your course title, start date, and length. All module unlock dates and assignment due dates will be calculated relative to this start date.
            </p>

            <div className="space-y-4 max-w-md pt-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Course Title *</label>
                <input aria-label="Course Title"
                  type="text"
                  value={setupForm.title}
                  onChange={(e) => setSetupForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#0D9488]"
                  placeholder="e.g. Primary 5 Mathematics"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Start Date (Date Anchor) *</label>
                <input aria-label="Start Date (Date Anchor)"
                  type="date"
                  value={setupForm.startDate}
                  onChange={(e) => setSetupForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#0D9488]"
                />
                <p className="text-[11px] text-slate-500 mt-1">Week 1 starts on this date. A Week 0 baseline, if you add one, is the 7 days before it.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Duration (Length in Weeks)</label>
                <input aria-label="Duration (Length in Weeks)"
                  type="number"
                  min={1}
                  max={52}
                  value={setupForm.lengthWeeks}
                  onChange={(e) => setSetupForm((p) => ({ ...p, lengthWeeks: Number(e.target.value) }))}
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-[#0D9488]"
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={saveStep1}
                  disabled={loading || !setupForm.title.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#203A3A] text-white rounded-xl text-sm font-semibold hover:bg-[#182c2c] transition-colors disabled:opacity-50"
                >
                  Continue to Outcomes <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Outcomes */}
        {step === 2 && (
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#0D9488]" /> Step 2: Define Core Learning Outcomes
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Outcomes are the core backbone of your course. Graded assignments & quizzes tag these outcomes to measure student mastery.
                </p>
              </div>

              {aiStatus.allowed ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="What is the course about?"
                    aria-label="Course topic for the AI"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                  />
                  <button
                    onClick={proposeAiOutcomes}
                    disabled={aiStarting === "outline" || (outlineJob && ["queued", "running"].includes(outlineJob.status))}
                    className="flex items-center gap-1 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {aiStarting === "outline" ? "Starting…" : "AI Propose Outcomes"}
                  </button>
                </div>
              ) : null}
            </div>
            <AiStatusNote status={aiStatus} />

            {outlineJob ? (
              <AiJobPanel
                key={outlineJob.id}
                SERVER_URL={SERVER_URL}
                courseId={courseId}
                job={outlineJob}
                label={`Course outline: ${Number(setupForm.lengthWeeks) || 4} weeks`}
                outcomes={outcomes}
                onApproved={() => loadWizardData()}
                onClose={() => setOutlineJob(null)}
              />
            ) : null}

            <div className="flex gap-2 max-w-md pt-2">
              <input aria-label="Enter outcome title (e.g. Can solve linear equations)"
                type="text"
                value={newOutcomeTitle}
                onChange={(e) => setNewOutcomeTitle(e.target.value)}
                placeholder="Enter outcome title (e.g. Can solve linear equations)"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0D9488]"
              />
              <button
                onClick={createOutcome}
                disabled={loading || !newOutcomeTitle.trim()}
                className="px-4 py-2 bg-[#203A3A] text-white rounded-xl text-xs font-semibold hover:bg-[#182c2c] transition-colors"
              >
                Add Outcome
              </button>
            </div>

            {/* List outcomes */}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {outcomes.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 text-center">No outcomes added yet. Use AI proposal or add manually above.</div>
              ) : (
                outcomes.map((o) => (
                  <div key={o.id} className="p-3.5 flex items-start gap-3">
                    <Target className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{o.title}</p>
                      {o.description ? <p className="text-xs text-slate-500 mt-0.5">{o.description}</p> : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-xs font-semibold text-slate-600">Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={outcomes.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#203A3A] text-white rounded-xl text-sm font-semibold hover:bg-[#182c2c] transition-colors disabled:opacity-50"
              >
                Continue to Baseline Assessment <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Baseline Assessment */}
        {step === 3 && (
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#0D9488]" /> Step 3: Week 0 Baseline Diagnostic Assessment
            </h2>
            <p className="text-xs text-slate-600">
              A short, ungraded check before Week 1. Each question is tagged with an outcome, and each learner&apos;s
              starting point per outcome is calculated from their answers. Build it from outcome-tagged quiz questions,
              then approve it, or skip it with a recorded reason.
            </p>

            <BaselinePanel
              SERVER_URL={SERVER_URL}
              courseId={courseId}
              isDraft={!course?.lifecycle || course.lifecycle === "draft"}
              onChanged={loadWizardData}
              compact
            />

            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-xs font-semibold text-slate-600">Back</button>
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#203A3A] text-white rounded-xl text-sm font-semibold hover:bg-[#182c2c] transition-colors"
              >
                Continue to Modules Timeline <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Modules Timeline */}
        {step === 4 && (
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-[#0D9488]" /> Step 4: Modules Timeline & Week Slots
                </h2>
                <p className="text-xs text-slate-600">
                  Modules store relative week slots (Week 1, Week 2...). Items inside store relative release and due days.
                </p>
              </div>

              <button
                onClick={() => addModuleWeek(
                  Math.max(0, ...modules.filter((m) => m.kind !== "baseline" && m.kind !== "unassigned").map((m) => Number(m.week_offset) || 0)) + 1
                )}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 px-3.5 py-2 rounded-xl transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Week Slot
              </button>
            </div>

            <AiStatusNote status={aiStatus} />
            <div className="space-y-3 pt-2">
              {modules.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No weekly modules created yet. Click "Add Week Slot" above to create week slots.
                </div>
              ) : (
                modules.map((m) => (
                  <div key={m.id} className="py-3 border-b border-slate-100 last:border-b-0 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-[#0D9488] uppercase tracking-wider">{moduleWeekLabel(m)}</span>
                        <h4 className="text-sm font-bold text-slate-800">{m.title}</h4>
                      </div>

                      {aiStatus.allowed && m.kind !== "unassigned" ? (
                        <button
                          onClick={() => aiFillModule(m.id)}
                          disabled={aiStarting === `fill-${m.id}` || fillStarted[m.id]}
                          className="flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#0D9488]" /> {fillStarted[m.id] ? "AI drafts on the way" : "AI Fill Week (Page + Quiz + Assignment)"}
                        </button>
                      ) : null}
                    </div>
                    {fillStarted[m.id] ? (
                      <p role="status" className="text-xs text-slate-600">
                        Started. The drafts will appear in{" "}
                        <Link href={`/course/${courseId}/ai`} className="font-semibold text-[#0D9488] hover:underline">AI drafts</Link>
                        {" "}in a few minutes. Nothing is added to the week until you approve it there.
                      </p>
                    ) : null}

                    <p className="text-xs text-slate-500">{(m.items || []).length} item(s) in this module</p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 flex justify-between">
              <button onClick={() => setStep(3)} className="px-4 py-2 text-xs font-semibold text-slate-600">Back</button>
              <button
                onClick={() => setStep(5)}
                disabled={modules.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#203A3A] text-white rounded-xl text-sm font-semibold hover:bg-[#182c2c] transition-colors disabled:opacity-50"
              >
                Preview Auto-Built Syllabus <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Syllabus Preview & Open Course */}
        {step === 5 && (
          <div className="bg-white rounded-xl p-4 md:p-6 border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#0D9488]" /> Step 5: Auto-Built Syllabus Preview
            </h2>
            <p className="text-xs text-slate-600">
              Syllabus is generated automatically from course outcomes, weekly modules, relative dates, and grading weights.
            </p>

            <div className="pt-4 border-t border-slate-100 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">{setupForm.title}</h3>
                <p className="text-xs text-slate-500">Starts: {formatDate(setupForm.startDate) || "Not set"} · Duration: {setupForm.lengthWeeks} Weeks</p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-1">Learning Outcomes ({outcomes.length})</h4>
                <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5">
                  {outcomes.map((o) => (
                    <li key={o.id}>{o.title}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-slate-500 mb-1">Weekly Timeline ({modules.length} Modules)</h4>
                <div className="space-y-1">
                  {modules.map((m) => (
                    <div key={m.id} className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 flex justify-between">
                      <span className="font-semibold">{m.title}</span>
                      <span className="text-slate-400">{moduleWeekLabel(m)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center">
              <button onClick={() => setStep(4)} className="px-4 py-2 text-xs font-semibold text-slate-600">Back</button>
              <button
                onClick={openCourseFinal}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-[#0D9488] text-white rounded-xl text-sm font-bold hover:bg-teal-700 transition-colors shadow-sm"
              >
                Open Course & Launch Weekly Loop <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
