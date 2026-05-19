"use client"

import { Suspense } from "react"
import { useContext, useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Clock, Star, X } from "lucide-react"
import DataContext from "@/context/DataContext"

function formatDateTime(value) {
  if (!value) return "—"
  try {
    // SQLite CURRENT_TIMESTAMP returns UTC strings without a timezone indicator
    // (e.g. "2026-04-30 23:17:00"). Normalise to ISO 8601 UTC so the browser
    // converts to local time correctly instead of treating the value as local.
    const normalized =
      typeof value === "string" && !value.endsWith("Z") && !value.includes("+")
        ? value.replace(" ", "T") + "Z"
        : value
    return new Date(normalized).toLocaleString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

function getQuestionsForStep(step) {
  const metadata = step?.metadata || {}
  const questions = Array.isArray(metadata.questions) ? metadata.questions : []

  if (questions.length > 0) {
    return questions.map((question, index) => ({
      prompt: String(question.prompt || `Question ${index + 1}`).trim(),
      questionType: String(question.questionType || "open"),
      options: Array.isArray(question.options) ? question.options : [],
      totalPoints: question.totalPoints != null && question.totalPoints !== "" ? Number(question.totalPoints) : null,
    }))
  }

  const fallbackPrompt = String(step?.body || "").trim()
  return fallbackPrompt
    ? [{ prompt: fallbackPrompt, questionType: String(metadata.questionType || "open"), options: Array.isArray(metadata.options) ? metadata.options : [], totalPoints: null }]
    : []
}

function GradeModal({ question, answerValue, existingFeedback, onSave, onClose, loading, error }) {
  const [awardedPoints, setAwardedPoints] = useState(
    existingFeedback?.awarded_points != null ? String(existingFeedback.awarded_points) : ""
  )
  const [totalPoints, setTotalPoints] = useState(
    existingFeedback?.possible_points != null
      ? String(existingFeedback.possible_points)
      : question?.totalPoints != null
        ? String(question.totalPoints)
        : ""
  )
  const [commentText, setCommentText] = useState(
    existingFeedback?.comment_text ? String(existingFeedback.comment_text) : ""
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-700 shadow-xl p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 pr-8">{question.prompt}</p>
        <div className="mt-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-2">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Student answer</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {answerValue || <span className="italic text-slate-400">No answer provided</span>}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-slate-700 dark:text-slate-200">
              Points awarded
              <input
                type="number"
                value={awardedPoints}
                onChange={(e) => setAwardedPoints(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:border-[#2E8282] transition-colors"
                min="0"
                placeholder="0"
                autoFocus
              />
            </label>
            <label className="block text-sm text-slate-700 dark:text-slate-200">
              Out of
              <input
                type="number"
                value={totalPoints}
                onChange={(e) => setTotalPoints(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:border-[#2E8282] transition-colors"
                min="0"
                placeholder="e.g. 10"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-700 dark:text-slate-200">
            Comment <span className="text-slate-400 font-normal">(optional)</span>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows="3"
              className="mt-1.5 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:border-[#2E8282] transition-colors resize-none"
              placeholder="Optional feedback for this question"
            />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={() => onSave(awardedPoints, totalPoints, commentText)}
            disabled={loading}
            className="w-full inline-flex items-center justify-center rounded-xl bg-[#2E8282] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#1f6767] disabled:opacity-50 transition-colors"
          >
            {loading ? "Saving…" : "Save Grade"}
          </button>
        </div>
      </div>
    </div>
  )
}

function LessonReviewPage() {
  const { SERVER_URL, unshiftString } = useContext(DataContext)
  const params = useParams()
  const searchParams = useSearchParams()

  const classId = params?.classId
  const lessonId = params?.lessonId
  const studentEmail = searchParams?.get("studentEmail") || ""

  const [submissions, setSubmissions] = useState([])
  const [submissionsLoading, setSubmissionsLoading] = useState(true)
  const [submissionsError, setSubmissionsError] = useState("")
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null)
  const [selectedDetails, setSelectedDetails] = useState(null)
  const [studentProgress, setStudentProgress] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Modal state — only one question grading dialog open at a time
  const [openGradingKey, setOpenGradingKey] = useState(null)
  const [modalGradeLoading, setModalGradeLoading] = useState(false)
  const [modalGradeError, setModalGradeError] = useState("")

  // Pending modal context (which step/question is being graded)
  const [modalContext, setModalContext] = useState(null) // { stepId, questionIndex, question, answerValue }

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("al")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  const buildFeedbackKey = (stepId, questionIndex) => `${stepId}:${questionIndex}`

  const questionFeedbackByKey = useMemo(() => {
    const map = {}
    for (const feedback of Array.isArray(selectedDetails?.feedback) ? selectedDetails.feedback : []) {
      if (feedback?.step_id != null && feedback?.question_index != null) {
        const key = buildFeedbackKey(feedback.step_id, feedback.question_index)
        map[key] = feedback
      }
    }
    return map
  }, [selectedDetails?.feedback])

  // Total possible points from lesson question definitions
  const definedTotalPoints = useMemo(() => {
    if (!selectedDetails?.steps) return null
    let total = 0
    let any = false
    for (const step of selectedDetails.steps) {
      if (step.step_type !== "question") continue
      for (const q of getQuestionsForStep(step)) {
        if (q.totalPoints != null) {
          total += q.totalPoints
          any = true
        }
      }
    }
    return any ? total : null
  }, [selectedDetails?.steps])

  const getSubmissionQueryString = () => {
    const query = new URLSearchParams({ teacherEmail })
    if (studentEmail) query.set("scholarEmail", studentEmail)
    return query.toString()
  }

  const refreshSubmissionData = async () => {
    if (!SERVER_URL || !teacherEmail || !lessonId || !selectedSubmissionId) return

    const [submissionsRes, detailsRes] = await Promise.all([
      fetch(`${SERVER_URL}/classes/lessons/${lessonId}/submissions?${getSubmissionQueryString()}`),
      fetch(`${SERVER_URL}/classes/submissions/${selectedSubmissionId}/details?teacherEmail=${encodeURIComponent(teacherEmail)}`),
    ])

    if (submissionsRes.ok) {
      const data = await submissionsRes.json()
      if (Array.isArray(data)) setSubmissions(data)
    }

    if (detailsRes.ok) {
      const data = await detailsRes.json()
      setSelectedDetails(data)
    }
  }

  const openGradeModal = (stepId, questionIndex, question, answerValue) => {
    const key = buildFeedbackKey(stepId, questionIndex)
    setModalContext({ stepId, questionIndex, question, answerValue })
    setModalGradeError("")
    setOpenGradingKey(key)
  }

  const closeGradeModal = () => {
    setOpenGradingKey(null)
    setModalContext(null)
    setModalGradeError("")
  }

  const handleModalSave = async (awardedPointsStr, totalPointsStr, commentTextStr) => {
    if (!selectedSubmissionId || !teacherEmail || !SERVER_URL || !modalContext) return

    const { stepId, questionIndex } = modalContext

    setModalGradeError("")
    setModalGradeLoading(true)

    try {
      const awarded = awardedPointsStr !== "" ? Number(awardedPointsStr) : null
      const total = totalPointsStr !== "" ? Number(totalPointsStr) : null
      const comment = String(commentTextStr || "").trim()

      if (awarded === null && !comment) {
        setModalGradeError("Enter a grade or a comment before saving")
        return
      }

      if (awarded !== null && (Number.isNaN(awarded) || awarded < 0)) {
        setModalGradeError("Enter a valid grade (0 or greater)")
        return
      }

      if (awarded !== null && total === null) {
        setModalGradeError("Enter the total points this question is out of")
        return
      }

      if (total !== null && (Number.isNaN(total) || total < 0)) {
        setModalGradeError("Enter a valid total (0 or greater)")
        return
      }

      if (awarded !== null && total !== null && awarded > total) {
        setModalGradeError("Points awarded cannot exceed total points")
        return
      }

      const payload = {
        teacherEmail,
        stepId,
        questionIndex,
        commentText: comment,
        awardedPoints: awarded,
        totalPoints: total,
      }

      const response = await fetch(`${SERVER_URL}/classes/submissions/${selectedSubmissionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const json = await response.json().catch(() => ({}))
        setModalGradeError(json.message || "Unable to save grade")
        return
      }

      await refreshSubmissionData()
      closeGradeModal()
    } catch (err) {
      console.error(err)
      setModalGradeError("Unable to save grade")
    } finally {
      setModalGradeLoading(false)
    }
  }

  useEffect(() => {
    if (!SERVER_URL || !teacherEmail || !lessonId) return
    const loadSubmissions = async () => {
      setSubmissionsLoading(true)
      setSubmissionsError("")
      setStudentProgress(null)
      try {
        const query = new URLSearchParams({ teacherEmail })
        if (studentEmail) query.set("scholarEmail", studentEmail)
        const res = await fetch(`${SERVER_URL}/classes/lessons/${lessonId}/submissions?${query.toString()}`)
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          setSubmissionsError(json.message || "Unable to load submissions")
          setSubmissions([])
          return
        }
        const data = await res.json()
        setSubmissions(data)
        if (data.length > 0) {
          setSelectedSubmissionId((prev) => prev || data[0]?.id)
        } else {
          setSelectedSubmissionId(null)
        }

        if (studentEmail) {
          const progressRes = await fetch(
            `${SERVER_URL}/classes/${classId}/lessons/${lessonId}/student-progress?teacherEmail=${encodeURIComponent(teacherEmail)}`
          )
          if (progressRes.ok) {
            const progressJson = await progressRes.json()
            const student = Array.isArray(progressJson?.students)
              ? progressJson.students.find(
                  (s) => String(s.scholar_email || "").toLowerCase() === String(studentEmail).toLowerCase()
                )
              : null
            setStudentProgress(student)
          }
        }
      } catch (err) {
        console.error(err)
        setSubmissionsError("Failed to load submissions")
      } finally {
        setSubmissionsLoading(false)
      }
    }
    loadSubmissions()
  }, [SERVER_URL, teacherEmail, lessonId, studentEmail, classId])

  useEffect(() => {
    if (!SERVER_URL || !teacherEmail || !selectedSubmissionId) {
      setSelectedDetails(null)
      return
    }
    const loadDetails = async () => {
      setDetailsLoading(true)
      try {
        const res = await fetch(
          `${SERVER_URL}/classes/submissions/${selectedSubmissionId}/details?teacherEmail=${encodeURIComponent(teacherEmail)}`
        )
        if (!res.ok) {
          setSelectedDetails(null)
          return
        }
        const json = await res.json()
        setSelectedDetails(json)
      } catch (err) {
        console.error(err)
        setSelectedDetails(null)
      } finally {
        setDetailsLoading(false)
      }
    }
    loadDetails()
  }, [SERVER_URL, teacherEmail, selectedSubmissionId])

  const selectedSubmission = submissions.find((row) => row.id === selectedSubmissionId)
  const selectedStudentName = selectedDetails?.submission?.scholarName || selectedSubmission?.scholar_name || selectedSubmission?.scholar_email

  const questionSteps = selectedDetails?.steps?.filter((step) => step.step_type === "question") ?? []

  return (
    <div>
      {openGradingKey && modalContext && (
        <GradeModal
          question={modalContext.question}
          answerValue={modalContext.answerValue}
          existingFeedback={questionFeedbackByKey[openGradingKey]}
          onSave={handleModalSave}
          onClose={closeGradeModal}
          loading={modalGradeLoading}
          error={modalGradeError}
        />
      )}

      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <Link href={`/teacher/classes/${classId}/lessons/${lessonId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to lesson
          </Link>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Grade Student Submissions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Review each question and grade student answers.</p>
        </div>
      </div>

      {submissionsLoading ? (
        <p className="text-sm text-slate-400">Loading submissions…</p>
      ) : submissionsError ? (
        <p className="text-sm text-red-500">{submissionsError}</p>
      ) : submissions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0f1318] p-5">
          <p className="text-sm text-slate-500">
            No submissions found for this lesson{studentEmail ? ` from ${studentEmail}` : ""}.
          </p>
          {studentProgress && (
            <div className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50 p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Student status</p>
              <p className="text-sm text-slate-500 mt-2">
                This student is currently <span className="font-medium text-slate-800 dark:text-slate-100">{studentProgress.status.replace("_", " ")}</span>.
              </p>
              {studentProgress.updated_at && (
                <p className="text-sm text-slate-400 mt-1">Last updated {formatDateTime(studentProgress.updated_at)}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
          {/* Student list */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0f1318] overflow-hidden self-start">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700/50">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Submissions</p>
              <p className="text-xs text-slate-400 mt-1">Click a student to review their answers.</p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700/50">
              {submissions.map((submission) => (
                <button
                  key={submission.id}
                  type="button"
                  onClick={() => {
                    setSelectedSubmissionId(submission.id)
                    closeGradeModal()
                  }}
                  className={`w-full text-left px-4 py-4 flex items-start gap-3 transition-colors ${submission.id === selectedSubmissionId ? "bg-slate-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-900/50"}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{submission.scholar_name || submission.scholar_email}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Submitted {formatDateTime(submission.submitted_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {submission.grade !== null && submission.grade !== undefined
                        ? `${submission.grade} / ${submission.total_points || "—"}`
                        : "Ungraded"}
                    </p>
                    {submission.graded_at && (
                      <p className="text-xs text-slate-400 mt-0.5">Graded</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Submission detail */}
          <div className="space-y-4">
            {detailsLoading ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0f1318] p-5">
                <p className="text-sm text-slate-400">Loading submission details…</p>
              </div>
            ) : selectedDetails ? (
              <>
                {/* Student header */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0f1318] px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-[0.18em]">Student</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5">{selectedStudentName}</p>
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>{formatDateTime(selectedDetails.submission.submittedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {selectedDetails.grades
                          ? `Grade: ${selectedDetails.grades.grade} / ${definedTotalPoints ?? selectedDetails.grades.total_points}`
                          : "Not yet graded"}
                      </span>
                    </div>
                    {selectedDetails.grades?.graded_at && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Star className="w-4 h-4 shrink-0" />
                        <span>Last graded {formatDateTime(selectedDetails.grades.graded_at)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Questions */}
                {questionSteps.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0f1318] p-5">
                    <p className="text-sm text-slate-500">No question steps found in this lesson.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questionSteps.map((step) => {
                      const stepResponses = Array.isArray(selectedDetails.responses?.[step.id])
                        ? selectedDetails.responses[step.id]
                        : []
                      const questions = getQuestionsForStep(step)

                      return questions.map((question, questionIndex) => {
                        const response = stepResponses.find((item) => Number(item.questionIndex) === questionIndex) || {}
                        const answerValue = question.questionType === "multiple_choice"
                          ? response.selectedOption || response.responseText
                          : response.responseText || response.selectedOption

                        const key = buildFeedbackKey(step.id, questionIndex)
                        const existingFeedback = questionFeedbackByKey[key]
                        const isGraded = existingFeedback?.awarded_points != null

                        return (
                          <div
                            key={key}
                            className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0f1318] p-5"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Question {questionIndex + 1}</p>
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{question.prompt}</p>
                              </div>
                              {isGraded && (
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Score</p>
                                  <p className="text-sm font-semibold text-[#2E8282]">{existingFeedback.awarded_points} pts</p>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 px-3 py-2.5">
                              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Student answer</p>
                              <p className="text-sm text-slate-700 dark:text-slate-200">
                                {answerValue || <span className="italic text-slate-400">No answer provided</span>}
                              </p>
                            </div>

                            {question.questionType === "multiple_choice" && question.options.length > 0 && (
                              <p className="text-xs text-slate-400 mt-2">Options: {question.options.join(", ")}</p>
                            )}

                            {existingFeedback?.comment_text && (
                              <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 px-3 py-2">
                                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Feedback</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300">{existingFeedback.comment_text}</p>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => openGradeModal(step.id, questionIndex, question, answerValue)}
                              className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-700 text-white px-3 py-2 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                            >
                              {isGraded ? "Edit Grade" : "Grade Question"}
                            </button>
                          </div>
                        )
                      })
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-[#0f1318] p-5">
                <p className="text-sm text-slate-500">Select a student from the left to review their submission.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function LessonReviewPageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400 p-4">Loading...</p>}>
      <LessonReviewPage />
    </Suspense>
  )
}
