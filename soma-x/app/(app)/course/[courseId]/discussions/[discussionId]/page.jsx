"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function DiscussionThreadPage() {
  const { courseId, discussionId } = useParams();
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const [discussion, setDiscussion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [pointsInput, setPointsInput] = useState("");
  const [savingGraded, setSavingGraded] = useState(false);
  const [gradedError, setGradedError] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/discussions/${discussionId}`);
    const payload = await res.json();
    if (res.ok) {
      setDiscussion(payload);
      setPointsInput(payload.points_possible ? String(payload.points_possible) : "");
    }
    setLoading(false);
  };

  const toggleGraded = async () => {
    setSavingGraded(true);
    setGradedError("");
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/discussions/${discussionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        graded: !discussion.graded,
        pointsPossible: Number(pointsInput) || 0,
      }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setGradedError(payload.message || "Failed to update discussion.");
    }
    setSavingGraded(false);
    load();
  };

  useEffect(() => { if (SERVER_URL && userEmail) load(); }, [SERVER_URL, userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const postReply = async () => {
    if (!reply.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/discussions/${discussionId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply.trim() }),
    });
    setReply("");
    load();
  };

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading...</p></div>;
  if (!discussion) return <div className="p-6"><p className="text-sm text-rose-600">Discussion not found.</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="discussions" itemName={discussion.title} />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900">{discussion.title}</h1>
            {discussion.graded ? <span className="text-[10px] font-bold uppercase text-teal-600 bg-teal-50 rounded-full px-1.5 py-0.5">Graded</span> : null}
          </div>
          {discussion.body ? <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{discussion.body}</p> : null}

          {isTeacher ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 p-2.5">
              {!discussion.graded ? (
                <input
                  type="number"
                  min="0"
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  placeholder="Points possible"
                  className="w-28 text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none"
                />
              ) : null}
              <button
                onClick={toggleGraded}
                disabled={savingGraded}
                className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {discussion.graded ? "Remove grading" : "Mark as graded"}
              </button>
              {discussion.graded ? (
                <span className="text-xs text-slate-500">
                  {discussion.points_possible} pt{discussion.points_possible === 1 ? "" : "s"} · syncs to Assignments & Grades
                </span>
              ) : null}
            </div>
          ) : null}
          {isTeacher && gradedError ? (
            <p className="mt-2 text-xs font-semibold text-rose-600">{gradedError}</p>
          ) : null}
        </div>

        <div className="space-y-3">
          {discussion.replies.length === 0 ? (
            <p className="text-sm text-slate-500">No replies yet — be the first.</p>
          ) : (
            discussion.replies.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">{r.authorName}</p>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{r.body}</p>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply..." className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]" />
          <button onClick={postReply} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Reply</button>
        </div>
      </div>
    </div>
  );
}
