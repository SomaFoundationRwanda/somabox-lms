"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle, Plus, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { Button } from "@/components/ui/button";

export default function QuizzesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: quizzes, loading, error, refetch } = useCourseSection("quizzes");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState([{ prompt: "", questionType: "multiple_choice", options: ["", ""], correctOption: "", points: 1 }]);

  const addQuestion = () => setQuestions((p) => [...p, { prompt: "", questionType: "multiple_choice", options: ["", ""], correctOption: "", points: 1 }]);
  const updateQuestion = (idx, patch) => setQuestions((p) => p.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  const removeQuestion = (idx) => setQuestions((p) => p.filter((_, i) => i !== idx));

  const create = async () => {
    if (!title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/quizzes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, title: title.trim(), published: true, questions }),
    });
    setTitle("");
    setQuestions([{ prompt: "", questionType: "multiple_choice", options: ["", ""], correctOption: "", points: 1 }]);
    setCreating(false);
    refetch();
  };

  const remove = async (id) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/quizzes/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail }),
    });
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="quizzes" />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Quizzes</h1>
          {isTeacher ? (
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Quiz
            </Button>
          ) : null}
        </div>

        {creating ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz title" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            {questions.map((q, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input value={q.prompt} onChange={(e) => updateQuestion(idx, { prompt: e.target.value })} placeholder={`Question ${idx + 1}`} className="flex-1 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none" />
                  <button onClick={() => removeQuestion(idx)} className="text-rose-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                {(Array.isArray(q.options) ? q.options : []).map((opt, optIdx) => {
                  const val = typeof opt === "object" && opt !== null ? (opt.text || opt.id || "") : String(opt || "");
                  return (
                    <div key={optIdx} className="flex items-center gap-2 pl-3">
                      <input
                        type="radio"
                        checked={q.correctOption === val && val !== ""}
                        onChange={() => updateQuestion(idx, { correctOption: val })}
                      />
                      <input
                        value={val}
                        onChange={(e) => {
                          const nextOptions = [...q.options];
                          const oldVal = val;
                          nextOptions[optIdx] = typeof opt === "object" && opt !== null ? { ...opt, text: e.target.value } : e.target.value;
                          updateQuestion(idx, { options: nextOptions, correctOption: q.correctOption === oldVal ? e.target.value : q.correctOption });
                        }}
                        placeholder={`Choice ${optIdx + 1}`}
                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none"
                      />
                    </div>
                  );
                })}
                <button onClick={() => updateQuestion(idx, { options: [...q.options, ""] })} className="text-xs font-semibold text-[#203A3A] hover:underline pl-3">+ Add choice</button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button onClick={addQuestion} className="text-xs font-semibold text-[#203A3A] hover:underline">+ Add question</button>
              <button onClick={create} className="ml-auto text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Create Quiz</button>
            </div>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={quizzes} onRetry={refetch} emptyMessage="No quizzes yet.">
          {(list) => (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {list.map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/course/${courseId}/quizzes/${q.id}`} className="flex items-center gap-2 text-sm text-slate-700 hover:text-[#203A3A] min-w-0">
                    <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{q.title}</span>
                    <span className="text-xs text-slate-400 shrink-0">({q.questionCount} question{q.questionCount === 1 ? "" : "s"})</span>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    {q.myScore != null ? <span className="text-xs font-semibold text-emerald-600">Score: {q.myScore}</span> : null}
                    {isTeacher ? <button onClick={() => remove(q.id)} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
