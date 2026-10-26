"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCourse } from "@/context/CourseContext";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List } from "@/components/layout";
import { useItemOpened } from "@/lib/usage";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";

export default function DiscussionThreadPage() {
  const { courseId, discussionId } = useParams();
  useItemOpened("discussion", discussionId, courseId);
  const { userEmail, isTeacher, isObserver } = useCourse();
  const { t, tf } = useCourseText();
  const queryClient = useQueryClient();
  const threadKey = queryKeys.courseSection(courseId, `discussions/${discussionId}`);
  const thread = useQuery({
    queryKey: threadKey,
    queryFn: () => apiFetch(`/courses/${courseId}/discussions/${discussionId}`),
    enabled: !!courseId && !!discussionId && !!userEmail,
  });
  const discussion = thread.data || null;
  const loading = thread.isPending;
  const [reply, setReply] = useState("");
  const [pointsInput, setPointsInput] = useState("");
  const [savingGraded, setSavingGraded] = useState(false);
  const [gradedError, setGradedError] = useState("");
  const [replyError, setReplyError] = useState("");

  useEffect(() => {
    if (discussion) setPointsInput(discussion.points_possible ? String(discussion.points_possible) : "");
  }, [discussion?.points_possible]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => queryClient.invalidateQueries({ queryKey: threadKey });

  const toggleGraded = async () => {
    setSavingGraded(true);
    setGradedError("");
    try {
      await apiFetch(`/courses/${courseId}/discussions/${discussionId}`, {
        method: "PATCH",
        json: { graded: !discussion.graded, pointsPossible: Number(pointsInput) || 0 },
      });
      // Grading a discussion adds or removes its assignment in the weeks and gradebook.
      queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
    } catch (err) {
      setGradedError(err?.body?.message || t("discussions.updateFailed"));
      load();
    }
    setSavingGraded(false);
  };

  const postReply = async () => {
    if (!reply.trim()) return;
    setReplyError("");
    try {
      await apiFetch(`/courses/${courseId}/discussions/${discussionId}/replies`, { method: "POST", json: { body: reply.trim() } });
      setReply("");
      queryClient.invalidateQueries({ queryKey: queryKeys.assignmentSummary });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    } catch (err) {
      setReplyError(getErrorMessage(err, t));
    }
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
                  className="w-28 text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]"
                />
              ) : null}
              <button
                onClick={toggleGraded}
                disabled={savingGraded}
                className="text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg px-3 py-1.5 disabled:opacity-50"
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

          {isObserver ? null : <div className="mt-3 flex items-center gap-2">
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("discussions.replyPlaceholder")} aria-label={t("discussions.replyPlaceholder")} className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-primary)]" />
            <button onClick={postReply} className="text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg px-3 py-2">{t("discussions.reply")}</button>
          </div>}
          {replyError ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{replyError}</p> : null}
        </Section>
      </div>
    </div>
  );
}
