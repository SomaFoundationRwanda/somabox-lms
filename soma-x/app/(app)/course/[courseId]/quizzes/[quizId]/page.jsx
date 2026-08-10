"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";

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
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/quizzes/${quizId}?userEmail=${encodeURIComponent(userEmail)}`);
    const payload = await res.json();
    if (res.ok) setQuiz(payload);
    setLoading(false);
  };

  useEffect(() => { if (SERVER_URL && userEmail) load(); }, [SERVER_URL, userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/quizzes/${quizId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail, answers }),
    });
    const payload = await res.json();
    if (res.ok) setSubmitted(payload.score);
    load();
  };

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading...</p></div>;
  if (!quiz) return <div className="p-6"><p className="text-sm text-rose-600">Quiz not found.</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="quizzes" itemName={quiz.title} />
      <div className="p-4 md:p-6 space-y-4 max-w-3xl">
        <h1 className="text-lg font-bold text-slate-900">{quiz.title}</h1>
        {quiz.description ? <p className="text-sm text-slate-600">{quiz.description}</p> : null}

        {submitted !== null ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Submitted! Score: {submitted}
          </div>
        ) : null}

        {isTeacher ? (
          <div className="space-y-4">
            {(quiz.questions || []).map((q, idx) => (
              <div key={q.id || idx} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {idx + 1}. {q.prompt} <span className="text-xs text-slate-400 font-normal">({q.points} pts)</span>
                </p>
                {q.question_type === "multiple_choice" ? (
                  <ul className="mt-1.5 space-y-1">
                    {(Array.isArray(q.options) ? q.options : []).map((opt, i) => {
                      const text = getOptionText(opt);
                      const id = getOptionId(opt, i);
                      const isCorrect = q.correctOption === id || q.correctOption === text || (typeof opt === "object" && q.correctOption === opt.id);
                      return (
                        <li
                          key={i}
                          className={`text-xs px-2 py-1 rounded ${
                            isCorrect ? "bg-emerald-100 text-emerald-800 font-semibold" : "text-slate-600"
                          }`}
                        >
                          {text} {isCorrect ? " ✓" : ""}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Open response</p>
                )}
              </div>
            ))}
            <div className="pt-2">
              <h2 className="text-sm font-bold text-slate-800 mb-2">Submissions ({(quiz.submissions || []).length})</h2>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {(quiz.submissions || []).map((s) => (
                  <div key={s.scholar_email} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-700">{s.fullName}</span>
                    <span className="font-semibold text-slate-800">{s.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : quiz.mySubmission ? (
          <div className="rounded-xl border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-slate-800">Already submitted</p>
            <p className="text-slate-600 mt-1">Score: {quiz.mySubmission.score}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(quiz.questions || []).map((q, idx) => (
              <div key={q.id || idx} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">{idx + 1}. {q.prompt}</p>
                {q.question_type === "multiple_choice" ? (
                  <div className="mt-1.5 space-y-1">
                    {(Array.isArray(q.options) ? q.options : []).map((opt, i) => {
                      const text = getOptionText(opt);
                      const id = getOptionId(opt, i);
                      const isChecked = answers[q.id] === id || answers[q.id] === text;
                      return (
                        <label key={i} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
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
                    rows={2}
                    className="mt-1.5 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#203A3A]"
                  />
                )}
              </div>
            ))}
            <button onClick={submit} className="text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-4 py-2 transition-colors">
              Submit Quiz
            </button>
          </div>
        )}

        <PrevNextNav
          courseId={courseId}
          itemType="quiz"
          contentRefId={quizId}
        />
      </div>
    </div>
  );
}
