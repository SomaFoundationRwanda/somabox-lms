"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List } from "@/components/layout";
import { useItemOpened } from "@/lib/usage";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";

export default function DiscussionThreadPage() {
  const { courseId, discussionId } = useParams();
  useItemOpened("discussion", discussionId, courseId);
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const { t, tf } = useCourseText();
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
      setGradedError(payload.message || t("discussions.updateFailed"));
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

  if (loading) return <Loader variant="page" />;
  if (!discussion) return <div className="p-6"><p className="text-sm text-rose-600">{t("discussions.notFound")}</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="discussions" itemName={discussion.title} />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="items.discussion"
          title={discussion.title}
          meta={discussion.graded ? <span className="text-[10px] font-bold uppercase text-teal-600 bg-teal-50 rounded-full px-1.5 py-0.5">{t("quizKinds.graded")}</span> : null}
        >
          {discussion.body ? <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 whitespace-pre-wrap">{discussion.body}</p> : null}
        </PageHeader>

        {isTeacher ? (
          <Section title={t("discussions.grading")}>
            <div className="flex flex-wrap items-center gap-2">
              {!discussion.graded ? (
                <input
                  type="number"
                  min="0"
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  placeholder={t("editors.pointsPossible")}
                  aria-label={t("editors.pointsPossible")}
                  className="w-28 text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                />
              ) : null}
              <button
                onClick={toggleGraded}
                disabled={savingGraded}
                className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {discussion.graded ? t("discussions.removeGrading") : t("discussions.markGraded")}
              </button>
              {discussion.graded ? (
                <span className="text-xs text-slate-500">
                  {tf("common.points", { n: discussion.points_possible })} · {t("discussions.syncs")}
                </span>
              ) : null}
            </div>
            {gradedError ? (
              <p className="mt-2 text-xs font-semibold text-rose-600">{gradedError}</p>
            ) : null}
          </Section>
        ) : null}

        <Section title={tf("discussions.repliesCount", { n: discussion.replies.length })}>
          {discussion.replies.length === 0 ? (
            <p className="text-sm text-slate-500">{t("discussions.noReplies")}</p>
          ) : (
            <List label={t("discussions.replies")}>
              {discussion.replies.map((r) => (
                <li key={r.id} className="px-3 py-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{r.authorName}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">{r.body}</p>
                </li>
              ))}
            </List>
          )}

          <div className="mt-3 flex items-center gap-2">
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("discussions.replyPlaceholder")} aria-label={t("discussions.replyPlaceholder")} className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]" />
            <button onClick={postReply} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">{t("discussions.reply")}</button>
          </div>
        </Section>
      </div>
    </div>
  );
}
