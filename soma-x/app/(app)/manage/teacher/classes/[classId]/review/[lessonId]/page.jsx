"use client";

import { useContext, useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle, Star } from "lucide-react";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import HeaderSection from "@/components/ui/HeaderSection";
import Typography from "@/components/ui/Typography";
import { Button } from "@/components/ui/button";
import Input from "@/components/ui/input";

export default function GradeLessonPage() {
  const { authenticated, unshiftString, SERVER_URL } = useContext(DataContext);
  const router = useRouter();
  const params = useParams();
  const classId = String(params?.classId || "");
  const lessonId = String(params?.lessonId || "");

  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [submissionDetails, setSubmissionDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [answerFeedbackDrafts, setAnswerFeedbackDrafts] = useState({});
  const [answerAutosaveStates, setAnswerAutosaveStates] = useState({});
  const answerAutosaveTimersRef = useRef({});

  const formatTime = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds || 0)));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  const formatDate = (value, includeTime = false) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    const options = includeTime
      ? {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC"
        }
      : {
          year: "numeric",
          month: "short",
          day: "2-digit",
          timeZone: "UTC"
        };

    return new Intl.DateTimeFormat("en-US", options).format(date);
  };

  const getStepQuestions = (step) => {
    const metadata = step?.metadata && typeof step.metadata === "object" ? step.metadata : {};
    const metadataQuestions = Array.isArray(metadata.questions) ? metadata.questions : [];

    if (metadataQuestions.length > 0) {
      return metadataQuestions.map((question, questionIndex) => ({
        questionIndex,
        prompt: String(question?.prompt || `Question ${questionIndex + 1}`),
        questionType: question?.questionType === "multiple_choice" ? "multiple_choice" : "open",
      }));
    }

    const fallbackPrompt = String(step?.body || "").trim();
    if (!fallbackPrompt) return [];

    return [{
      questionIndex: 0,
      prompt: fallbackPrompt,
      questionType: metadata?.questionType === "multiple_choice" ? "multiple_choice" : "open",
    }];
  };

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  const buildFeedbackKey = (stepId, questionIndex) => `${stepId ?? "general"}:${questionIndex ?? "general"}`;

  const overallGradeLabel = useMemo(() => {
    const grade = submissionDetails?.grades?.grade ?? selectedSubmission?.grade;
    const total = submissionDetails?.grades?.total_points ?? selectedSubmission?.total_points;
    if (grade === null || grade === undefined || total === null || total === undefined) {
      return "Not graded";
    }
    return `${grade}/${total}`;
  }, [submissionDetails, selectedSubmission]);

  const savedFeedbackByKey = useMemo(() => {
    const items = Array.isArray(submissionDetails?.feedback) ? submissionDetails.feedback : [];
    const next = {};

    items
      .filter((item) => String(item?.teacher_email || "").trim().toLowerCase() === teacherEmail)
      .forEach((item) => {
        const key = buildFeedbackKey(item?.step_id ?? null, item?.question_index ?? null);
        next[key] = {
          id: item?.id,
          commentText: String(item?.comment_text || ""),
          awardedPoints: item?.awarded_points === null || item?.awarded_points === undefined ? "" : String(item.awarded_points),
          totalPoints: item?.possible_points === null || item?.possible_points === undefined ? "" : String(item.possible_points),
        };
      });

    return next;
  }, [submissionDetails, teacherEmail]);

  useEffect(() => {
    if (!authenticated || !teacherEmail || !classId || !lessonId || !SERVER_URL) return;

    const loadSubmissions = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${SERVER_URL}/classes/lessons/${lessonId}/submissions?teacherEmail=${encodeURIComponent(teacherEmail)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || "Failed to load submissions");
        }

        setSubmissions(Array.isArray(payload) ? payload : []);
      } catch (error) {
        console.error("Load submissions failed:", error);
      } finally {
        setLoading(false);
      }
    };

    if (authenticated) {
      loadSubmissions();
    }
  }, [authenticated, SERVER_URL, classId, lessonId, teacherEmail]);

  const loadSubmissionDetails = async (submissionId) => {
    if (!SERVER_URL || !teacherEmail) return;

    try {
      setLoadingDetails(true);
      setSubmissionDetails(null);
      setAnswerFeedbackDrafts({});

      const response = await fetch(
        `${SERVER_URL}/classes/submissions/${submissionId}/details?teacherEmail=${encodeURIComponent(teacherEmail)}`
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Failed to load submission details");
      }

      setSubmissionDetails(payload);

      const feedbackItems = Array.isArray(payload?.feedback) ? payload.feedback : [];
      const teacherFeedback = feedbackItems.filter(
        (item) => String(item?.teacher_email || "").trim().toLowerCase() === teacherEmail
      );

      const initialAnswerDrafts = {};
      teacherFeedback
        .filter((item) => item?.step_id !== null && item?.step_id !== undefined && item?.question_index !== null && item?.question_index !== undefined)
        .forEach((item) => {
          const key = buildFeedbackKey(item.step_id, item.question_index);
          initialAnswerDrafts[key] = {
            commentText: String(item?.comment_text || ""),
            awardedPoints: item?.awarded_points === null || item?.awarded_points === undefined ? "" : String(item.awarded_points),
            totalPoints: item?.possible_points === null || item?.possible_points === undefined ? "" : String(item.possible_points),
          };
        });
      setAnswerFeedbackDrafts(initialAnswerDrafts);
    } catch (error) {
      console.error("Load details failed:", error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSelectSubmission = (submission) => {
    setSelectedSubmission(submission);
    loadSubmissionDetails(submission.id);
  };

  const upsertFeedback = async ({ commentText, stepId = null, questionIndex = null, awardedPoints = null, totalPointsValue = null }) => {
    if (!selectedSubmission || !SERVER_URL || !teacherEmail) return;

    const response = await fetch(
      `${SERVER_URL}/classes/submissions/${selectedSubmission.id}/feedback`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherEmail,
          commentText,
          stepId,
          questionIndex,
          awardedPoints,
          totalPoints: totalPointsValue,
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to save feedback");
    }

    const payload = await response.json();
    const saved = payload?.feedback;

    if (saved) {
      setSubmissionDetails((prev) => {
        if (!prev) return prev;
        const existing = Array.isArray(prev.feedback) ? prev.feedback : [];
        const withoutReplaced = existing.filter((item) => Number(item.id) !== Number(saved.id));
        return {
          ...prev,
          grades: payload?.grades || prev.grades,
          feedback: [saved, ...withoutReplaced],
        };
      });
    }

    setSubmissions((prev) => prev.map((sub) => (
      sub.id === selectedSubmission.id
        ? {
            ...sub,
            grade: payload?.grades?.grade ?? null,
            total_points: payload?.grades?.total_points ?? null,
          }
        : sub
    )));
  };

  useEffect(() => {
    if (!selectedSubmission || !SERVER_URL || !teacherEmail) return;

    Object.entries(answerFeedbackDrafts).forEach(([key, draft]) => {
      const [rawStepId, rawQuestionIndex] = key.split(":");
      const stepId = Number(rawStepId);
      const questionIndex = Number(rawQuestionIndex);
      if (Number.isNaN(stepId) || Number.isNaN(questionIndex)) return;

      const draftComment = String(draft?.commentText || "").trim();
      const draftAwarded = String(draft?.awardedPoints || "").trim();
      const draftTotal = String(draft?.totalPoints || "").trim();

      if (!draftComment) return;

      const saved = savedFeedbackByKey[key] || { commentText: "", awardedPoints: "", totalPoints: "" };
      const savedComment = String(saved.commentText || "").trim();
      const savedAwarded = String(saved.awardedPoints || "").trim();
      const savedTotal = String(saved.totalPoints || "").trim();

      if (draftComment === savedComment && draftAwarded === savedAwarded && draftTotal === savedTotal) return;

      if (answerAutosaveTimersRef.current[key]) {
        clearTimeout(answerAutosaveTimersRef.current[key]);
      }

      setAnswerAutosaveStates((prev) => ({ ...prev, [key]: "pending" }));
      answerAutosaveTimersRef.current[key] = setTimeout(async () => {
        try {
          setAnswerAutosaveStates((prev) => ({ ...prev, [key]: "saving" }));
          await upsertFeedback({
            commentText: draftComment,
            stepId,
            questionIndex,
            awardedPoints: draftAwarded === "" ? null : Number(draftAwarded),
            totalPointsValue: draftTotal === "" ? null : Number(draftTotal),
          });
          setAnswerAutosaveStates((prev) => ({ ...prev, [key]: "saved" }));
        } catch (error) {
          console.error("Autosave answer feedback failed:", error);
          setAnswerAutosaveStates((prev) => ({ ...prev, [key]: "error" }));
        }
      }, 700);
    });

    return () => {
      Object.values(answerAutosaveTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      answerAutosaveTimersRef.current = {};
    };
  }, [answerFeedbackDrafts, selectedSubmission, SERVER_URL, teacherEmail, savedFeedbackByKey]);

  if (!authenticated) {
    return <Unauthorized />;
  }

  return (
    <div className="min-h-screen flex-1 bg-gradient-to-br from-slate-50 to-slate-100">
      <HeaderSection
        title="Grade Submissions"
        subtitle="Review student responses and assign grades"
        breadcrumbs={[
          { label: "Classes", href: "/manage/teacher/classes" },
          { label: "Class", href: `/manage/teacher/classes/${classId}` },
          { label: "Review", href: `/manage/teacher/classes/${classId}/review` },
          { label: "Grade", active: true }
        ]}
      />

      <main className="flex-1 py-6 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          <Button
            onClick={() => router.back()}
            className="mb-6 gap-2"
            variant="ghost"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Submissions List */}
            <div className="bg-white rounded-xl border border-slate-200 h-fit">
              <div className="p-4 border-b border-slate-200">
                <Typography variant="h5">
                  Submissions ({submissions.length})
                </Typography>
              </div>

              {loading ? (
                <div className="p-4 text-center">
                  <Typography variant="body" color="muted">
                    Loading...
                  </Typography>
                </div>
              ) : submissions.length === 0 ? (
                <div className="p-4 text-center">
                  <Typography variant="body" color="muted">
                    No submissions yet
                  </Typography>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
                  {submissions.map((submission) => (
                    <button
                      key={submission.id}
                      onClick={() => handleSelectSubmission(submission)}
                      className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${
                        selectedSubmission?.id === submission.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <div className="font-medium text-sm truncate">
                        {submission.scholar_name || submission.scholar_email}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Submitted:{" "}
                        {formatDate(submission.submitted_at)}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {submission.grade !== null ? (
                          <div className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded text-xs">
                            <Star className="w-3 h-3" />
                            {submission.grade}/{submission.total_points}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs">
                            <AlertCircle className="w-3 h-3" />
                            Not graded
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details and Grading Panel */}
            <div className="lg:col-span-2">
              {loadingDetails ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <Typography variant="body" color="muted">
                    Loading submission details...
                  </Typography>
                </div>
              ) : submissionDetails ? (
                <div className="space-y-6">
                  {/* Submission Info */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <Typography variant="h5" className="mb-4">
                      {submissionDetails.submission.lessonTitle}
                    </Typography>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <Typography variant="body" color="muted">
                          Student Name
                        </Typography>
                        <Typography variant="body" className="font-medium">
                          {submissionDetails.submission.scholarName || submissionDetails.submission.scholarEmail}
                        </Typography>
                      </div>
                      <div>
                        <Typography variant="body" color="muted">
                          Submitted At
                        </Typography>
                        <Typography variant="body" className="font-medium">
                          {formatDate(submissionDetails.submission.submittedAt, true)}
                        </Typography>
                      </div>
                      <div>
                        <Typography variant="body" color="muted">
                          Overall Grade
                        </Typography>
                        <Typography variant="body" className="font-medium">
                          {overallGradeLabel}
                        </Typography>
                      </div>
                    </div>
                  </div>

                  {/* Student Responses */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <Typography variant="h5" className="mb-4">
                      Student Responses
                    </Typography>
                    <div className="space-y-4">
                      {submissionDetails.steps.map((step) => (
                        <div key={step.id} className="border-l-4 border-blue-500 pl-4">
                          <Typography variant="body" className="font-medium mb-2">
                            {step.title || `Step ${step.step_order}`}
                          </Typography>
                          {step.step_type === "question" ? (
                            <div className="space-y-3">
                              {(getStepQuestions(step).length > 0
                                ? getStepQuestions(step)
                                : (submissionDetails.responses?.[step.id] || []).map((response, index) => ({
                                    questionIndex: Number(response.questionIndex ?? index),
                                    prompt: `Question ${index + 1}`,
                                  }))
                              ).map((question, idx) => {
                                const response = (submissionDetails.responses?.[step.id] || []).find(
                                  (item) => Number(item.questionIndex) === Number(question.questionIndex)
                                );
                                const answer = response?.selectedOption || response?.responseText || "No response";
                                const feedbackKey = `${step.id}:${question.questionIndex}`;
                                const answerFeedback = (submissionDetails.feedback || []).filter(
                                  (fb) => Number(fb.step_id) === Number(step.id)
                                    && Number(fb.question_index) === Number(question.questionIndex)
                                );

                                return (
                                  <div key={`${step.id}-${question.questionIndex}-${idx}`} className="bg-slate-50 p-3 rounded">
                                    <div className="text-sm text-slate-600 mb-1">
                                      Question {Number(question.questionIndex) + 1}
                                    </div>
                                    <div className="text-sm mb-1">
                                      {question.prompt}
                                    </div>
                                    <div className="text-sm font-medium">
                                      {answer}
                                    </div>

                                    {answerFeedback.length > 0 ? (
                                      <div className="mt-2 space-y-2">
                                        {answerFeedback.map((fb) => (
                                          <div key={fb.id} className="rounded bg-blue-50 border border-blue-100 p-2">
                                            <Typography variant="body" className="text-sm">
                                              {fb.comment_text}
                                            </Typography>
                                            <Typography variant="body" color="muted" className="text-xs mt-1">
                                              {formatDate(fb.created_at, true)}
                                            </Typography>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}

                                    <div className="mt-3 space-y-2">
                                      <textarea
                                        value={answerFeedbackDrafts[feedbackKey]?.commentText || ""}
                                        onChange={(event) => setAnswerFeedbackDrafts((prev) => ({
                                          ...prev,
                                          [feedbackKey]: {
                                            commentText: event.target.value,
                                            awardedPoints: prev[feedbackKey]?.awardedPoints || "",
                                            totalPoints: prev[feedbackKey]?.totalPoints || "",
                                          },
                                        }))}
                                        placeholder="Add feedback for this answer..."
                                        className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                        rows="2"
                                      />
                                      <div className="grid grid-cols-2 gap-2">
                                        <Input
                                          id={`awarded-${feedbackKey}`}
                                          variant="number"
                                          value={answerFeedbackDrafts[feedbackKey]?.awardedPoints || ""}
                                          onChange={(value) => setAnswerFeedbackDrafts((prev) => ({
                                            ...prev,
                                            [feedbackKey]: {
                                              commentText: prev[feedbackKey]?.commentText || "",
                                              awardedPoints: value,
                                              totalPoints: prev[feedbackKey]?.totalPoints || "",
                                            },
                                          }))}
                                          placeholder="Awarded"
                                        />
                                        <Input
                                          id={`total-${feedbackKey}`}
                                          variant="number"
                                          value={answerFeedbackDrafts[feedbackKey]?.totalPoints || ""}
                                          onChange={(value) => setAnswerFeedbackDrafts((prev) => ({
                                            ...prev,
                                            [feedbackKey]: {
                                              commentText: prev[feedbackKey]?.commentText || "",
                                              awardedPoints: prev[feedbackKey]?.awardedPoints || "",
                                              totalPoints: value,
                                            },
                                          }))}
                                          placeholder="Total"
                                        />
                                      </div>
                                      <Typography variant="body" color="muted" className="text-xs">
                                        {answerAutosaveStates[feedbackKey] === "saving"
                                          ? "Autosaving..."
                                          : answerAutosaveStates[feedbackKey] === "saved"
                                            ? "Saved"
                                            : answerAutosaveStates[feedbackKey] === "error"
                                              ? "Autosave failed"
                                              : ""}
                                      </Typography>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : step.step_type === "content" ? (
                            (() => {
                              const checkpoints = Array.isArray(step?.metadata?.videoCheckpoints)
                                ? step.metadata.videoCheckpoints
                                : [];
                              const checkpointResponsesByIndex = submissionDetails?.checkpointResponses?.[step.id] || {};

                              if (checkpoints.length === 0) {
                                return (
                                  <Typography variant="body" color="muted" className="text-sm">
                                    Content step - {step.title}
                                  </Typography>
                                );
                              }

                              return (
                                <div className="space-y-3">
                                  {checkpoints.map((checkpoint, checkpointIndex) => {
                                    const questions = Array.isArray(checkpoint?.questions) ? checkpoint.questions : [];
                                    const responses = Array.isArray(checkpointResponsesByIndex?.[checkpointIndex])
                                      ? checkpointResponsesByIndex[checkpointIndex]
                                      : [];

                                    if (questions.length === 0) return null;

                                    return (
                                      <div key={`checkpoint-${step.id}-${checkpointIndex}`} className="bg-slate-50 p-3 rounded space-y-2">
                                        <Typography variant="body" color="muted" className="text-xs font-medium">
                                          {checkpoint?.isEndOfVideo ? "End of Video" : `Timestamp ${formatTime(checkpoint?.atSecond || 0)}`}
                                        </Typography>

                                        {questions.map((question, questionIndex) => {
                                          const encodedQuestionIndex = (checkpointIndex + 1) * 1000 + questionIndex;
                                          const response = responses.find((item) => Number(item.questionIndex) === questionIndex);
                                          const answer = response?.selectedOption || response?.responseText || "No response";
                                          const feedbackKey = `${step.id}:${encodedQuestionIndex}`;
                                          const answerFeedback = (submissionDetails.feedback || []).filter(
                                            (fb) => Number(fb.step_id) === Number(step.id)
                                              && Number(fb.question_index) === Number(encodedQuestionIndex)
                                          );

                                          return (
                                            <div key={`video-answer-${step.id}-${checkpointIndex}-${questionIndex}`} className="bg-white p-3 rounded border border-slate-200">
                                              <div className="text-sm text-slate-600 mb-1">
                                                Question {questionIndex + 1}
                                              </div>
                                              <div className="text-sm mb-1">
                                                {String(question?.prompt || "")}
                                              </div>
                                              <div className="text-sm font-medium">
                                                {answer}
                                              </div>

                                              {answerFeedback.length > 0 ? (
                                                <div className="mt-2 space-y-2">
                                                  {answerFeedback.map((fb) => (
                                                    <div key={fb.id} className="rounded bg-blue-50 border border-blue-100 p-2">
                                                      <Typography variant="body" className="text-sm">
                                                        {fb.comment_text}
                                                      </Typography>
                                                      {fb.awarded_points !== null && fb.possible_points !== null ? (
                                                        <Typography variant="body" className="text-xs text-blue-700 mt-1">
                                                          Grade: {fb.awarded_points}/{fb.possible_points}
                                                        </Typography>
                                                      ) : null}
                                                      <Typography variant="body" color="muted" className="text-xs mt-1">
                                                        {formatDate(fb.created_at, true)}
                                                      </Typography>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : null}

                                              <div className="mt-3 space-y-2">
                                                <textarea
                                                  value={answerFeedbackDrafts[feedbackKey]?.commentText || ""}
                                                  onChange={(event) => setAnswerFeedbackDrafts((prev) => ({
                                                    ...prev,
                                                    [feedbackKey]: {
                                                      commentText: event.target.value,
                                                      awardedPoints: prev[feedbackKey]?.awardedPoints || "",
                                                      totalPoints: prev[feedbackKey]?.totalPoints || "",
                                                    },
                                                  }))}
                                                  placeholder="Add feedback for this answer..."
                                                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                  rows="2"
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                  <Input
                                                    id={`awarded-${feedbackKey}`}
                                                    variant="number"
                                                    value={answerFeedbackDrafts[feedbackKey]?.awardedPoints || ""}
                                                    onChange={(value) => setAnswerFeedbackDrafts((prev) => ({
                                                      ...prev,
                                                      [feedbackKey]: {
                                                        commentText: prev[feedbackKey]?.commentText || "",
                                                        awardedPoints: value,
                                                        totalPoints: prev[feedbackKey]?.totalPoints || "",
                                                      },
                                                    }))}
                                                    placeholder="Awarded"
                                                  />
                                                  <Input
                                                    id={`total-${feedbackKey}`}
                                                    variant="number"
                                                    value={answerFeedbackDrafts[feedbackKey]?.totalPoints || ""}
                                                    onChange={(value) => setAnswerFeedbackDrafts((prev) => ({
                                                      ...prev,
                                                      [feedbackKey]: {
                                                        commentText: prev[feedbackKey]?.commentText || "",
                                                        awardedPoints: prev[feedbackKey]?.awardedPoints || "",
                                                        totalPoints: value,
                                                      },
                                                    }))}
                                                    placeholder="Total"
                                                  />
                                                </div>
                                                <Typography variant="body" color="muted" className="text-xs">
                                                  {answerAutosaveStates[feedbackKey] === "saving"
                                                    ? "Autosaving..."
                                                    : answerAutosaveStates[feedbackKey] === "saved"
                                                      ? "Saved"
                                                      : answerAutosaveStates[feedbackKey] === "error"
                                                        ? "Autosave failed"
                                                        : ""}
                                                </Typography>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <Typography variant="body" color="muted">
                    Select a submission to view details
                  </Typography>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
