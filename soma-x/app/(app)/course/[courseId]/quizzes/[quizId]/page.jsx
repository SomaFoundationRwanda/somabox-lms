"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { HelpCircle, Target, Sparkles, CheckCircle2, Clock } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";
import { moduleWeekLabel } from "@/lib/moduleLabels";

function getOptionText(opt) {
  if (opt === null || opt === undefined) return "";
  if (typeof opt === "object") return opt.text || opt.label || opt.id || "";
  return String(opt);
}

function getOptionId(opt, idx) {
  if (opt === null || opt === undefined) return String(idx);
  if (typeof opt === "object") return opt.id || opt.text || String(idx);
  return String(opt);
}

export default function QuizDetailPage() {
  const { courseId, quizId } = useParams();
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const [quiz, setQuiz] = useState(null);
  const [modules, setModules] = useState([]);
  const [itemOutcomes, setItemOutcomes] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!SERVER_URL || !courseId || !quizId) return;
    try {
      setLoading(true);
      const [quizRes, modRes, itemOutRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/quizzes/${quizId}`),
        fetch(`${SERVER_URL}/courses/${courseId}/modules`),
        fetch(`${SERVER_URL}/courses/${courseId}/item-outcomes`),
      ]);

      if (quizRes.ok) setQuiz(await quizRes.json());
      if (modRes.ok) setModules(await modRes.json());
      if (itemOutRes.ok) {
        const allTags = await itemOutRes.json();
        const myTags = allTags.filter(t => t.item_type === 'quiz' && Number(t.item_id) === Number(quizId));
        setItemOutcomes(myTags);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [SERVER_URL, courseId, quizId, userEmail]);

  const submitQuiz = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubmitted(payload.score);
      } else {
        setSubmitError(payload.message || "Failed to submit quiz.");
      }
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading quiz...</p></div>;
  if (!quiz) return <div className="p-6"><p className="text-sm text-rose-600">Quiz not found.</p></div>;

  const currentModule = quiz.module || modules.find(m => m.id === quiz.module_id) || null;
  const attemptsAllowed = quiz.attempts_allowed ?? null;
  const attemptsUsed = Number(quiz.attemptsUsed || 0);
  const noAttemptsLeft = quiz.attemptsRemaining === 0;

  return (
    <div>
      <Breadcrumbs sectionKey="quizzes" itemName={quiz.title} />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        
        {/* Header Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
              Module: {currentModule ? `${moduleWeekLabel(currentModule)} - ${currentModule.title}` : "Not in a module"}
            </span>
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Due: Day {quiz.due_day ?? 7}
            </span>
          </div>

          <h1 className="text-2xl font-black text-slate-900">{quiz.title}</h1>
          {quiz.description && <p className="text-xs text-slate-600">{quiz.description}</p>}

          {/* Outcome Tags */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-[#0D9488]" /> Target Outcomes Assessed:
            </span>
            {itemOutcomes.length === 0 && quiz.kind === "practice" ? (
              <span className="text-xs text-slate-400">Practice quiz (not graded)</span>
            ) : itemOutcomes.length === 0 ? (
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

        {submitted !== null ? (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-bold text-teal-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#0D9488]" /> Quiz Submitted Successfully! Score: {submitted} Points
          </div>
        ) : null}

        {/* QUESTIONS LIST (FOR STUDENT TAKING OR TEACHER PREVIEW) */}
        <div className="space-y-4">
          {(quiz.questions || []).map((q, idx) => (
            <div key={q.id || idx} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Question {idx + 1}: {q.prompt}
                </h3>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  {q.points} pts
                </span>
              </div>

              {q.question_type === "multiple_choice" ? (
                <div className="space-y-2 pt-1">
                  {(Array.isArray(q.options) ? q.options : []).map((opt, i) => {
                    const text = getOptionText(opt);
                    const id = getOptionId(opt, i);
                    const isChecked = answers[q.id] === id || answers[q.id] === text;
                    return (
                      <label key={i} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 cursor-pointer hover:bg-slate-100 transition-colors">
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={isChecked}
                          onChange={() => setAnswers((p) => ({ ...p, [q.id]: id || text }))}
                        />
                        <span>{text}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                  rows={3}
                  placeholder="Write your open answer..."
                  className="w-full text-xs border border-slate-200 rounded-xl p-3 outline-none focus:border-[#0D9488]"
                />
              )}
            </div>
          ))}

          {!isTeacher && (
            <div className="pt-2 flex flex-col items-end gap-2">
              <span className="text-xs font-semibold text-slate-500">
                {attemptsAllowed == null
                  ? "Unlimited attempts"
                  : noAttemptsLeft
                  ? `All ${attemptsAllowed} attempt(s) used`
                  : `Attempt ${attemptsUsed + 1} of ${attemptsAllowed}`}
              </span>
              {noAttemptsLeft && (
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                  You&apos;ve used all your attempts for this quiz.
                </p>
              )}
              {submitError && <p className="text-xs font-semibold text-rose-600">{submitError}</p>}
              <button
                onClick={submitQuiz}
                disabled={noAttemptsLeft || submitting}
                className="px-6 py-2.5 bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-[#0D9488] text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
              >
                {submitting ? "Submitting..." : "Submit Quiz Answers"}
              </button>
            </div>
          )}
        </div>

        <PrevNextNav courseId={courseId} itemType="quiz" contentId={quizId} />
      </div>
    </div>
  );
}
