"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Bell, Calendar, CheckCircle2, ChevronLeft,
  MessageSquare, Search, Star,
} from "lucide-react";
import DataContext from "@/context/DataContext";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "ogg", "avi", "mkv", "m4v"]);

function isVideoUrl(url) {
  if (!url) return false;
  const ext = String(url).split("?")[0].split(".").pop().toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function getInitialClearedCheckpoints(checkpoints, checkpointResponsesForStep) {
  const cleared = new Set();
  (checkpoints || []).forEach((cp, cpIdx) => {
    const questions = Array.isArray(cp.questions) ? cp.questions : [];
    if (questions.length === 0) { cleared.add(cpIdx); return; }
    const responses = Array.isArray(checkpointResponsesForStep?.[cpIdx])
      ? checkpointResponsesForStep[cpIdx] : [];
    const allAnswered = questions.every((q, qIdx) => {
      if (q.required === false) return true;
      const response = responses.find((r) => Number(r.questionIndex) === qIdx);
      if (!response) return false;
      return q.questionType === "multiple_choice"
        ? Boolean(String(response.selectedOption || "").trim())
        : Boolean(String(response.responseText || "").trim());
    });
    if (allAnswered) cleared.add(cpIdx);
  });
  return cleared;
}

function parseStepMetadata(step) {
  const raw = step?.metadata;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try { const p = JSON.parse(raw); return p && typeof p === "object" ? p : {}; }
    catch { return {}; }
  }
  return {};
}

function getPageTypeLabel(step) {
  if (!step) return "Page";
  if (step.step_type === "question") return "Questions";
  const metadata = parseStepMetadata(step);
  const ct = String(metadata?.contentType || "").trim().toLowerCase();
  if (ct === "text") return "Text";
  if (ct === "file") return "File";
  if (ct === "video") return "Video";
  if (step.fileUrl) return isVideoUrl(step.fileUrl) ? "Video" : "File";
  return "Text";
}

function getStepQuestions(step) {
  if (!step || step.step_type !== "question") return [];
  const metadata = parseStepMetadata(step);
  const mq = Array.isArray(metadata.questions) ? metadata.questions : [];
  if (mq.length > 0) return mq.map(q => ({ questionType: q?.questionType === "multiple_choice" ? "multiple_choice" : "open", required: q?.required !== false }));
  const fallback = String(step?.body || "").trim();
  if (!fallback) return [];
  return [{ questionType: metadata?.questionType === "multiple_choice" ? "multiple_choice" : "open", required: metadata?.required !== false }];
}

function isQuestionStepComplete(step, answerDrafts) {
  const questions = getStepQuestions(step);
  if (questions.length === 0) return false;
  return questions.every((q, qi) => {
    if (!q.required) return true;
    const draft = answerDrafts?.[`${step.id}:${qi}`] || {};
    return q.questionType === "multiple_choice"
      ? Boolean(String(draft.selectedOption || "").trim())
      : Boolean(String(draft.responseText || "").trim());
  });
}

function isVideoEndCheckpointComplete(step, checkpointResponsesByStep) {
  if (!step?.fileUrl || !isVideoUrl(step.fileUrl)) return true;
  const metadata = parseStepMetadata(step);
  const checkpoints = Array.isArray(metadata.videoCheckpoints) ? metadata.videoCheckpoints : [];
  const endCps = checkpoints.map((cp, i) => ({ cp, i })).filter(({ cp }) => Boolean(cp?.isEndOfVideo));
  if (endCps.length === 0) return true;
  const rbcp = checkpointResponsesByStep?.[step.id] || {};
  return endCps.every(({ cp, i }) => {
    const questions = Array.isArray(cp?.questions) ? cp.questions : [];
    if (questions.length === 0) return true;
    const responses = Array.isArray(rbcp?.[i]) ? rbcp[i] : [];
    return questions.every((q, qi) => {
      if (q?.required === false) return true;
      const r = responses.find(x => Number(x.questionIndex) === qi);
      if (!r) return false;
      return q?.questionType === "multiple_choice" ? Boolean(String(r.selectedOption || "").trim()) : Boolean(String(r.responseText || "").trim());
    });
  });
}

/* ── Badge colors by type ── */
const TYPE_COLORS = {
  Questions: "bg-violet-50 text-violet-600 border-violet-100",
  Video:     "bg-rose-50 text-rose-600 border-rose-100",
  File:      "bg-amber-50 text-amber-600 border-amber-100",
  Text:      "bg-sky-50 text-sky-600 border-sky-100",
  Page:      "bg-slate-100 text-slate-500 border-slate-200",
};

/* ── Question card accent colors (cycles per question index) ── */
const Q_BADGE_COLORS = [
  { bg: "bg-violet-500", header: "bg-violet-50", border: "border-violet-100" },
  { bg: "bg-blue-500",   header: "bg-blue-50",   border: "border-blue-100" },
  { bg: "bg-teal-500",   header: "bg-teal-50",   border: "border-teal-100" },
  { bg: "bg-amber-500",  header: "bg-amber-50",  border: "border-amber-100" },
  { bg: "bg-rose-500",   header: "bg-rose-50",   border: "border-rose-100" },
];

function TypeBadge({ step }) {
  const label = getPageTypeLabel(step);
  const cls = TYPE_COLORS[label] || TYPE_COLORS.Page;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

/* ── Autosave indicator ── */
function AutosaveIndicator({ state }) {
  if (state === "idle") return null;
  const map = {
    pending: { text: "Autosave queued…",   className: "text-slate-400" },
    saving:  { text: "Saving answers…",     className: "text-slate-400" },
    saved:   { text: "Answers saved",       className: "text-green-600" },
    error:   { text: "Autosave failed",     className: "text-red-500" },
  };
  const { text, className } = map[state] || {};
  if (!text) return null;
  return <span className={`text-[10px] font-medium ${className}`}>{text}</span>;
}

/* ─────────────────────────────────────────────────────────────────── */

export default function ScholarLessonDetailPage() {
  const { authenticated, role, unshiftString, SERVER_URL, isDark } = useContext(DataContext);
  const ACCENT = isDark ? "#0D9488" : "#203A3A";
  const params   = useParams();
  const router   = useRouter();
  const lessonId = String(params?.lessonId || "");

  const [loading, setLoading]                         = useState(false);
  const [lesson, setLesson]                           = useState(null);
  const [selectedStepIndex, setSelectedStepIndex]     = useState(0);
  const [maxReachedStepIndex, setMaxReachedStepIndex] = useState(0);
  const [isReading, setIsReading]                     = useState(false);
  const [savingProgress, setSavingProgress]           = useState(false);
  const [savingAnswers, setSavingAnswers]             = useState(false);
  const [answersAutosaveState, setAnswersAutosaveState] = useState("idle");
  const [answerDrafts, setAnswerDrafts]               = useState({});
  const [dirtyQuestionSteps, setDirtyQuestionSteps]   = useState({});
  const [isSubmitted, setIsSubmitted]                 = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [submissionSummary, setSubmissionSummary]     = useState(null);
  const [checkpointResponsesByStep, setCheckpointResponsesByStep] = useState({});
  const [displayName, setDisplayName]                 = useState("");

  // Video player
  const videoRef               = useRef(null);
  const answerAutosaveTimerRef = useRef(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration]       = useState(0);
  const [videoIsPlaying, setVideoIsPlaying]     = useState(false);
  const [activeCheckpoint, setActiveCheckpoint] = useState(null);
  const [checkpointDrafts, setCheckpointDrafts] = useState({});
  const [clearedCheckpoints, setClearedCheckpoints] = useState(new Set());
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);
  const [actionError, setActionError]           = useState("");

  const formatDate = (value, includeTime = false) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const options = includeTime
      ? { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
      : { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" };
    return new Intl.DateTimeFormat("en-US", options).format(date);
  };

  const currentRole = useMemo(() => (role ? unshiftString(role) : ""), [role, unshiftString]);

  const scholarEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  useEffect(() => {
    setDisplayName(unshiftString(localStorage.getItem("un") || ""));
  }, [unshiftString]);

  const initials = displayName
    ? displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    : "S";

  useEffect(() => {
    const loadLesson = async () => {
      if (!SERVER_URL || !lessonId || !scholarEmail) return;
      try {
        setLoading(true);
        const response = await fetch(
          `${SERVER_URL}/classes/lessons/${encodeURIComponent(lessonId)}?scholarEmail=${encodeURIComponent(scholarEmail)}`
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Failed to load lesson");

        setLesson(payload);
        setCheckpointResponsesByStep(payload.checkpointResponsesByStep || {});

        const totalSteps = Array.isArray(payload?.steps) ? payload.steps.length : 0;
        const currentStepFromProgress = Number(payload?.progress?.current_step || 1);
        const boundedStepIndex = totalSteps > 0
          ? Math.max(0, Math.min(currentStepFromProgress - 1, totalSteps - 1)) : 0;
        const progressStatus = String(payload?.progress?.status || "not_started");

        setSelectedStepIndex(boundedStepIndex);
        setMaxReachedStepIndex(boundedStepIndex);
        setIsReading(progressStatus === "in_progress" || progressStatus === "completed");

        const initialDrafts = {};
        const responseByStep = payload?.questionResponsesByStep || {};
        Object.keys(responseByStep).forEach(stepId => {
          const responses = Array.isArray(responseByStep[stepId]) ? responseByStep[stepId] : [];
          responses.forEach(r => {
            initialDrafts[`${stepId}:${r.questionIndex}`] = {
              responseText: r.responseText || "", selectedOption: r.selectedOption || "",
            };
          });
        });
        setAnswerDrafts(initialDrafts);

        const statusResponse = await fetch(
          `${SERVER_URL}/classes/lessons/${encodeURIComponent(lessonId)}/submission-status?scholarEmail=${encodeURIComponent(scholarEmail)}`
        );
        const statusPayload = await statusResponse.json();
        if (statusResponse.ok) {
          setIsSubmitted(statusPayload.isLocked || false);
          setSubmissionSummary(statusPayload);
        }
      } catch (error) {
        console.error("Failed to load lesson details:", error);
      } finally {
        setLoading(false);
      }
    };
    if (authenticated && currentRole === "scholar") loadLesson();
  }, [authenticated, currentRole, SERVER_URL, lessonId, scholarEmail]);

  const selectedStep = useMemo(() => {
    if (!lesson?.steps?.length) return null;
    return lesson.steps[selectedStepIndex] || lesson.steps[0];
  }, [lesson, selectedStepIndex]);

  const selectedStepMetadata = useMemo(() => {
    if (!selectedStep?.metadata) return {};
    if (typeof selectedStep.metadata === "object") return selectedStep.metadata;
    if (typeof selectedStep.metadata === "string") {
      try { const p = JSON.parse(selectedStep.metadata); return p && typeof p === "object" ? p : {}; }
      catch { return {}; }
    }
    return {};
  }, [selectedStep]);

  useEffect(() => {
    if (!selectedStep) return;
    const checkpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
    const responsesForStep = checkpointResponsesByStep[selectedStep.id] || {};
    setClearedCheckpoints(getInitialClearedCheckpoints(checkpoints, responsesForStep));
    setActiveCheckpoint(null);
    setCheckpointDrafts({});
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setVideoIsPlaying(false);
    setActionError("");
  }, [selectedStepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStepQuestions = useMemo(() => {
    if (!selectedStep || selectedStep.step_type !== "question") return [];
    const mq = Array.isArray(selectedStepMetadata.questions) ? selectedStepMetadata.questions : [];
    if (mq.length > 0) {
      return mq.map(q => ({
        prompt: String(q?.prompt || ""),
        questionType: q?.questionType === "multiple_choice" ? "multiple_choice" : "open",
        required: q?.required !== false,
        options: q?.questionType === "multiple_choice"
          ? (Array.isArray(q?.options) ? q.options.map(o => String(o || "")).filter(Boolean) : []) : [],
      }));
    }
    if (selectedStepMetadata.questionType === "multiple_choice") {
      return [{ prompt: String(selectedStep.body || ""), questionType: "multiple_choice", required: selectedStepMetadata.required !== false, options: Array.isArray(selectedStepMetadata.options) ? selectedStepMetadata.options.map(o => String(o || "")).filter(Boolean) : [] }];
    }
    return [{ prompt: String(selectedStep.body || ""), questionType: "open", required: selectedStepMetadata.required !== false, options: [] }];
  }, [selectedStep, selectedStepMetadata]);

  const getAnswerDraft = (stepId, qi) => answerDrafts[`${stepId}:${qi}`] || { responseText: "", selectedOption: "" };

  const updateAnswerDraft = (stepId, qi, patch) => {
    const key = `${stepId}:${qi}`;
    setAnswerDrafts(prev => ({ ...prev, [key]: { ...(prev[key] || { responseText: "", selectedOption: "" }), ...patch } }));
    setDirtyQuestionSteps(prev => ({ ...prev, [stepId]: true }));
    setAnswersAutosaveState("pending");
  };

  const saveStepAnswers = async (step, options = {}) => {
    const { silent = false } = options;
    if (!step || step.step_type !== "question") return;
    const questions = Array.isArray(selectedStepQuestions) ? selectedStepQuestions : [];
    const responsesPayload = questions.map((q, qi) => {
      const draft = getAnswerDraft(step.id, qi);
      return { questionIndex: qi, responseText: q.questionType === "open" ? String(draft.responseText || "") : "", selectedOption: q.questionType === "multiple_choice" ? String(draft.selectedOption || "") : "" };
    });
    try {
      setSavingAnswers(true);
      const response = await fetch(`${SERVER_URL}/classes/lessons/${encodeURIComponent(lessonId)}/responses`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarEmail, stepId: step.id, responses: responsesPayload }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to save question responses");
      setActionError("");
      const savedDrafts = {};
      (Array.isArray(payload.responses) ? payload.responses : []).forEach(r => {
        savedDrafts[`${step.id}:${r.questionIndex}`] = { responseText: r.responseText || "", selectedOption: r.selectedOption || "" };
      });
      setAnswerDrafts(prev => ({ ...prev, ...savedDrafts }));
      setDirtyQuestionSteps(prev => ({ ...prev, [step.id]: false }));
      setAnswersAutosaveState("saved");
    } catch (error) {
      console.error("Failed to save question responses:", error);
      setAnswersAutosaveState("error");
      if (!silent) setActionError(error.message || "Failed to save question responses");
    } finally {
      setSavingAnswers(false);
    }
  };

  useEffect(() => {
    if (!selectedStep || selectedStep.step_type !== "question" || isSubmitted) return;
    if (!dirtyQuestionSteps[selectedStep.id]) return;
    if (answerAutosaveTimerRef.current) clearTimeout(answerAutosaveTimerRef.current);
    answerAutosaveTimerRef.current = setTimeout(async () => {
      try { setAnswersAutosaveState("saving"); await saveStepAnswers(selectedStep, { silent: true }); }
      catch { setAnswersAutosaveState("error"); }
    }, 800);
    return () => { if (answerAutosaveTimerRef.current) clearTimeout(answerAutosaveTimerRef.current); };
  }, [answerDrafts, dirtyQuestionSteps, selectedStep, isSubmitted]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProgress = async (stepNumber) => {
    try {
      setSavingProgress(true);
      const response = await fetch(`${SERVER_URL}/classes/lessons/${encodeURIComponent(lessonId)}/progress`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarEmail, status: "in_progress", currentStep: stepNumber }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to save lesson progress");
      setLesson(prev => (prev ? { ...prev, progress: payload } : prev));
    } catch (error) {
      console.error("Failed to save lesson progress:", error);
    } finally {
      setSavingProgress(false);
    }
  };

  const handleNextPage = async () => {
    if (!lesson?.steps?.length) return;
    if (isSubmitted) { setSelectedStepIndex(Math.min(selectedStepIndex + 1, lesson.steps.length - 1)); return; }
    const currentCheckpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
    const pendingEnd = currentCheckpoints.some((cp, i) => cp?.isEndOfVideo && !clearedCheckpoints.has(i));
    if (selectedStep?.fileUrl && isVideoUrl(selectedStep.fileUrl) && pendingEnd) return;
    if (!isReading) { setIsReading(true); setSelectedStepIndex(0); await saveProgress(1); return; }
    if (selectedStep?.step_type === "question") await saveStepAnswers(selectedStep);
    const next = Math.min(selectedStepIndex + 1, lesson.steps.length - 1);
    setSelectedStepIndex(next);
    setMaxReachedStepIndex(prev => Math.max(prev, next));
    await saveProgress(next + 1);
  };

  const handlePreviousPage = async () => {
    if (!lesson?.steps?.length || !isReading || selectedStepIndex <= 0) return;
    if (isSubmitted) { setSelectedStepIndex(selectedStepIndex - 1); return; }
    if (selectedStep?.step_type === "question") await saveStepAnswers(selectedStep);
    const prev = selectedStepIndex - 1;
    setSelectedStepIndex(prev);
    await saveProgress(prev + 1);
  };

  const handleFinishLesson = async () => {
    if (!lesson?.steps?.length || !isReading) return;
    const currentCheckpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
    const pendingEnd = currentCheckpoints.some((cp, i) => cp?.isEndOfVideo && !clearedCheckpoints.has(i));
    if (selectedStep?.fileUrl && isVideoUrl(selectedStep.fileUrl) && pendingEnd) return;
    if (selectedStep?.step_type === "question") await saveStepAnswers(selectedStep);
    try {
      setSavingProgress(true);
      const response = await fetch(`${SERVER_URL}/classes/lessons/${encodeURIComponent(lessonId)}/progress`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarEmail, status: "completed", currentStep: lesson.steps.length }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to finish lesson");
      setLesson(prev => (prev ? { ...prev, progress: payload } : prev));
      setIsSubmitted(true);
      setShowCompletionModal(true);
    } catch (error) {
      console.error("Failed to finish lesson:", error);
      setActionError(error?.message || "Failed to finish lesson");
    } finally {
      setSavingProgress(false);
    }
  };

  // ── Video checkpoint logic ──────────────────────────────────────────────────

  const handleVideoTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const time = video.currentTime;
    setVideoCurrentTime(time);
    setVideoDuration(video.duration || 0);
    if (activeCheckpoint !== null) return;
    const checkpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (cp.isEndOfVideo) continue;
      if (time >= cp.atSecond && !clearedCheckpoints.has(i)) {
        video.pause(); video.currentTime = cp.atSecond; setVideoCurrentTime(cp.atSecond);
        setActiveCheckpoint({ checkpointIndex: i, checkpoint: cp }); setCheckpointDrafts({}); break;
      }
    }
  };

  const handleVideoEnded = () => {
    setVideoIsPlaying(false);
    if (activeCheckpoint !== null) return;
    const checkpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      if (cp.isEndOfVideo && !clearedCheckpoints.has(i)) { setActiveCheckpoint({ checkpointIndex: i, checkpoint: cp }); setCheckpointDrafts({}); break; }
    }
  };

  const handleVideoSeek = (e) => {
    const video = videoRef.current;
    if (!video || !videoDuration) return;
    const targetTime = (Number(e.target.value) / 100) * videoDuration;
    const currentVideoTime = video.currentTime;
    if (targetTime > currentVideoTime) {
      const checkpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
      let blockAt = null;
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        if (!cp.isEndOfVideo && !clearedCheckpoints.has(i) && cp.atSecond > currentVideoTime && cp.atSecond <= targetTime) {
          if (blockAt === null || cp.atSecond < blockAt) blockAt = cp.atSecond;
        }
      }
      if (blockAt !== null) { video.currentTime = Math.max(0, blockAt - 0.1); setVideoCurrentTime(Math.max(0, blockAt - 0.1)); return; }
    }
    video.currentTime = targetTime; setVideoCurrentTime(targetTime);
  };

  const getCheckpointDraft = (qIdx) => checkpointDrafts[`q${qIdx}`] || { responseText: "", selectedOption: "" };
  const updateCheckpointDraft = (qIdx, patch) => setCheckpointDrafts(prev => ({ ...prev, [`q${qIdx}`]: { ...(prev[`q${qIdx}`] || { responseText: "", selectedOption: "" }), ...patch } }));

  const canContinueCheckpoint = () => {
    if (!activeCheckpoint) return false;
    const questions = Array.isArray(activeCheckpoint.checkpoint.questions) ? activeCheckpoint.checkpoint.questions : [];
    return questions.every((q, qIdx) => {
      if (q.required === false) return true;
      const draft = getCheckpointDraft(qIdx);
      return q.questionType === "multiple_choice" ? Boolean(draft.selectedOption?.trim()) : Boolean(draft.responseText?.trim());
    });
  };

  const handleCheckpointContinue = async () => {
    if (!activeCheckpoint || !canContinueCheckpoint() || savingCheckpoint) return;
    const { checkpointIndex, checkpoint } = activeCheckpoint;
    const questions = Array.isArray(checkpoint.questions) ? checkpoint.questions : [];
    const responses = questions.map((q, qIdx) => {
      const draft = getCheckpointDraft(qIdx);
      return { questionIndex: qIdx, responseText: q.questionType === "open" ? String(draft.responseText || "").trim() : "", selectedOption: q.questionType === "multiple_choice" ? String(draft.selectedOption || "") : "" };
    });
    try {
      setSavingCheckpoint(true);
      await fetch(`${SERVER_URL}/classes/lessons/${encodeURIComponent(lessonId)}/checkpoint-responses`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scholarEmail, stepId: selectedStep.id, checkpointIndex, responses }),
      });
      setCheckpointResponsesByStep(prev => {
        const stepResponses = { ...(prev[selectedStep.id] || {}) };
        stepResponses[checkpointIndex] = responses.map(r => ({ questionIndex: r.questionIndex, responseText: r.responseText, selectedOption: r.selectedOption }));
        return { ...prev, [selectedStep.id]: stepResponses };
      });
      setClearedCheckpoints(prev => new Set([...prev, checkpointIndex]));
      setActiveCheckpoint(null); setCheckpointDrafts({});
      videoRef.current?.play();
    } catch (error) {
      console.error("Failed to save checkpoint responses:", error);
    } finally {
      setSavingCheckpoint(false);
    }
  };

  const navigateToStep = async (stepIndex) => {
    if (!isReading) return;
    if (!isSubmitted && stepIndex > maxReachedStepIndex) return;
    if (isSubmitted) { setSelectedStepIndex(stepIndex); return; }
    if (selectedStep?.step_type === "question") await saveStepAnswers(selectedStep);
    setSelectedStepIndex(stepIndex);
    await saveProgress(stepIndex + 1);
  };

  // All hooks must be called before any conditional return
  const steps      = lesson?.steps || [];
  const totalSteps = steps.length;
  const progressPct = isSubmitted ? 100 : isReading && totalSteps > 0 ? Math.round(((selectedStepIndex + 1) / totalSteps) * 100) : 0;

  const videoCheckpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
  const hasPendingEndVideoQuestions = Boolean(
    selectedStep?.fileUrl && isVideoUrl(selectedStep.fileUrl) &&
    videoCheckpoints.some((cp, i) => cp?.isEndOfVideo && !clearedCheckpoints.has(i))
  );

  const completedStepIds = useMemo(() => {
    const ids = new Set();
    steps.forEach((step, index) => {
      const reached = index <= maxReachedStepIndex;
      if (step?.step_type === "question") { if (isQuestionStepComplete(step, answerDrafts)) ids.add(step.id); return; }
      if (step?.fileUrl && isVideoUrl(step.fileUrl)) { if (isVideoEndCheckpointComplete(step, checkpointResponsesByStep) && reached) ids.add(step.id); return; }
      if (reached) ids.add(step.id);
    });
    return ids;
  }, [steps, maxReachedStepIndex, answerDrafts, checkpointResponsesByStep]);

  const pageLabel = (step) => String(step?.title || "").trim() || getPageTypeLabel(step);

  const selectedVideoCheckpointReviews = useMemo(() => {
    if (!isSubmitted || !selectedStep?.id || !selectedStep?.fileUrl || !isVideoUrl(selectedStep.fileUrl)) return [];
    const checkpoints = Array.isArray(selectedStepMetadata.videoCheckpoints) ? selectedStepMetadata.videoCheckpoints : [];
    const rbcp = checkpointResponsesByStep[selectedStep.id] || {};
    return checkpoints.map((checkpoint, i) => {
      const questions = Array.isArray(checkpoint?.questions) ? checkpoint.questions : [];
      if (questions.length === 0) return null;
      return { checkpoint, checkpointIndex: i, responses: Array.isArray(rbcp?.[i]) ? rbcp[i] : [] };
    }).filter(Boolean);
  }, [isSubmitted, selectedStep, selectedStepMetadata, checkpointResponsesByStep]);

  const selectedQuestionFeedback = useMemo(() => {
    if (!isSubmitted || !selectedStep?.id || selectedStep.step_type !== "question") return [];
    return (Array.isArray(submissionSummary?.feedback) ? submissionSummary.feedback : [])
      .filter(item => Number(item?.step_id) === Number(selectedStep.id) && Number(item?.question_index) < 1000)
      .sort((a, b) => Number(a?.question_index || 0) - Number(b?.question_index || 0));
  }, [isSubmitted, selectedStep, submissionSummary]);

  useEffect(() => {
    if (authenticated && currentRole && currentRole !== "scholar") router.replace("/");
  }, [authenticated, currentRole, router]);

  if (!authenticated || currentRole !== "scholar") return null;

  /* ── Shared top bar ── */
  const TopBar = ({ children }) => (
    <div className="flex items-center justify-between pl-12 pr-4 md:px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-20 rounded-b-[5px]">
      {children}
    </div>
  );

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="min-h-screen pb-24 md:pb-8">
        <TopBar>
          <div className="flex items-center gap-3 min-w-0 animate-pulse flex-1">
            <div className="w-8 h-8 bg-slate-100 rounded-full shrink-0" />
            <div className="space-y-1.5">
              <div className="h-3 w-36 bg-slate-100 rounded-full" />
              <div className="h-2.5 w-20 bg-slate-100 rounded-full hidden sm:block" />
            </div>
          </div>
          <div className="w-8 h-8 bg-slate-100 rounded-full shrink-0 animate-pulse" />
        </TopBar>
        <div className="pt-[10px] max-w-2xl mx-auto px-3 sm:px-4 space-y-3">
          {[160, 80, 120].map((h, i) => (
            <div key={i} className="bg-white border border-slate-100 rounded-[5px] animate-pulse" style={{ height: h }} />
          ))}
        </div>
      </div>
    );
  }

  /* ── Pre-start overview ── */
  if (!isReading) {
    return (
      <div className="min-h-screen pb-24 md:pb-8">
        <TopBar>
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/manage/scholar-dashboard/lessons"
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-[15px] sm:text-[17px] font-black text-slate-900 leading-tight truncate">
                {lesson?.title || "Lesson"}
              </h1>
              {lesson?.className && (
                <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block truncate">
                  {lesson.className}{lesson.classGrade ? ` · ${lesson.classGrade}` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT }}>
            <span className="text-[11px] font-black text-white tracking-wide">{initials}</span>
          </div>
        </TopBar>

        <div className="pt-[10px] max-w-2xl mx-auto px-3 sm:px-4 space-y-3">
          {/* Meta pills */}
          <div className="flex flex-wrap items-center gap-2">
            {lesson?.dueAt && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full">
                <Calendar size={10} />
                Due {formatDate(lesson.dueAt)}
              </span>
            )}
            {totalSteps > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">
                {totalSteps} page{totalSteps !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Lesson card */}
          <div className="bg-white border border-slate-100 rounded-[5px] overflow-hidden">
            {lesson?.description && (
              <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                <p className="text-[12px] sm:text-[13px] text-slate-600 leading-relaxed">{lesson.description}</p>
              </div>
            )}

            {totalSteps > 0 && (
              <div className="p-4">
                <p className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                  {totalSteps} page{totalSteps !== 1 ? "s" : ""} in this lesson
                </p>
                <div className="space-y-0.5">
                  {steps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3 px-2 py-2.5 rounded-[5px] hover:bg-slate-50">
                      <div
                        className="w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center shrink-0"
                      >
                        <span className="text-slate-400 text-[10px] font-bold">{index + 1}</span>
                      </div>
                      <p className="text-[12px] font-semibold text-slate-700 truncate flex-1">{pageLabel(step)}</p>
                      <TypeBadge step={step} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-4 pb-4 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleNextPage}
                disabled={!totalSteps || savingProgress}
                className="w-full h-10 rounded-[5px] text-[13px] font-bold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: ACCENT }}
              >
                {savingProgress ? "Starting…" : "Begin Lesson →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Reading layout ── */
  return (
    <div className="min-h-screen pb-24 md:pb-8">

      {/* ── Completion modal ── */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[5px] border border-slate-100 shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-[15px] font-black text-slate-900">Lesson Completed!</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Great work — your responses are locked in.</p>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12px] text-slate-600 leading-relaxed">
                This lesson has been submitted. You can review all pages and your answers, but no new responses can be entered.
              </p>
            </div>
            <div className="px-5 pb-5 flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowCompletionModal(false)}
                className="h-8 px-4 rounded-[5px] text-[12px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Review Lesson
              </button>
              <button
                type="button"
                onClick={() => router.push("/manage/scholar-dashboard/classes")}
                className="h-8 px-4 rounded-[5px] text-[12px] font-bold text-white transition-opacity"
                style={{ backgroundColor: ACCENT }}
              >
                Return to Classes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <TopBar>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/manage/scholar-dashboard/lessons"
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-[14px] sm:text-[15px] font-black text-slate-900 leading-tight truncate">
              {lesson?.title || "Lesson"}
            </p>
            {lesson?.className && (
              <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block truncate">
                {lesson.className}{lesson.classGrade ? ` · ${lesson.classGrade}` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Progress indicator */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
              {selectedStepIndex + 1} / {totalSteps}
            </span>
            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%`, backgroundColor: isSubmitted ? "#22c55e" : ACCENT }}
              />
            </div>
            <span className={`text-[11px] font-bold ${isSubmitted ? "text-green-600" : ""}`}
              style={!isSubmitted ? { color: ACCENT } : {}}>
              {progressPct}%
            </span>
          </div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT }}>
            <span className="text-[11px] font-black text-white tracking-wide">{initials}</span>
          </div>
        </div>
      </TopBar>

      {/* ── Body ── */}
      <div className="pt-[10px]">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3 items-start">

          {/* ── Step sidebar ── */}
          <aside className="lg:sticky lg:top-[60px] px-3 sm:px-4 lg:px-0 lg:pl-4">
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              {/* Sidebar header */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pages</p>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: isSubmitted ? "#22c55e" : ACCENT }}>
                    {selectedStepIndex + 1} / {totalSteps}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, backgroundColor: isSubmitted ? "#22c55e" : ACCENT }}
                  />
                </div>
              </div>

              {/* Mobile: horizontal pill row */}
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden">
                {steps.map((step, index) => {
                  const isActive = index === selectedStepIndex;
                  const isDone   = completedStepIds.has(step.id);
                  const isLocked = !isSubmitted && index > maxReachedStepIndex;
                  return (
                    <button
                      key={step.id} type="button"
                      onClick={() => navigateToStep(index)} disabled={isLocked}
                      className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold transition-colors"
                      style={isDone ? { backgroundColor: "#22c55e", color: "#fff" } : isActive ? { backgroundColor: ACCENT, color: "#fff" } : undefined}
                      title={pageLabel(step)}
                    >
                      {!isDone && !isActive && (
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold ${index <= maxReachedStepIndex ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-300"}`}>
                          {index + 1}
                        </span>
                      )}
                      {isDone && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      {isActive && !isDone && index + 1}
                    </button>
                  );
                })}
              </div>

              {/* Desktop: vertical step list */}
              <div className="hidden lg:flex flex-col px-2 pb-2">
                {steps.map((step, index) => {
                  const isActive = index === selectedStepIndex;
                  const isDone   = completedStepIds.has(step.id);
                  const isLocked = !isSubmitted && index > maxReachedStepIndex;
                  const typeLabel = getPageTypeLabel(step);

                  return (
                    <button
                      key={step.id} type="button"
                      onClick={() => navigateToStep(index)} disabled={isLocked}
                      className={`flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 ${
                        isActive
                          ? "text-white shadow-sm"
                          : isDone
                          ? "hover:bg-slate-50 cursor-pointer"
                          : !isLocked
                          ? "hover:bg-slate-50 cursor-pointer"
                          : "cursor-default opacity-50"
                      }`}
                      style={isActive ? { backgroundColor: ACCENT } : {}}
                    >
                      {/* Step badge */}
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors ${
                        isDone
                          ? isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                          : isActive
                          ? "bg-white/20 text-white"
                          : index <= maxReachedStepIndex
                          ? "bg-slate-100 text-slate-600"
                          : "border border-slate-200 text-slate-300"
                      }`}>
                        {isDone && !isActive ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : index + 1}
                      </div>

                      {/* Label */}
                      <div className="min-w-0 flex-1">
                        <p className={`text-[12px] font-semibold truncate leading-tight ${
                          isActive ? "text-white" : isDone ? "text-slate-700" : isLocked ? "text-slate-300" : "text-slate-700"
                        }`}>
                          {pageLabel(step)}
                        </p>
                        <p className={`text-[10px] mt-0.5 font-medium ${isActive ? "text-white/50" : isDone ? "text-slate-400" : "text-slate-400"}`}>
                          {isDone && !isActive ? "✓ Done" : typeLabel}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="min-w-0 px-3 sm:px-4 lg:pr-4 lg:pl-0 space-y-3">

            {/* Submission banner */}
            {isSubmitted && (
              <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-[5px] px-4 py-3">
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-green-800">Lesson submitted</p>
                  <p className="text-[11px] text-green-700 mt-0.5">Your responses are locked. Check back for your grade and feedback.</p>
                </div>
                {submissionSummary?.grade !== null && submissionSummary?.grade !== undefined && (
                  <div className="ml-auto shrink-0 flex items-center gap-1 bg-white border border-green-200 rounded-[5px] px-2.5 py-1.5">
                    <Star size={12} className="text-green-600" />
                    <span className="text-[12px] font-black text-green-700">{submissionSummary.grade}/{submissionSummary.totalPoints}</span>
                  </div>
                )}
              </div>
            )}

            {/* Step content card */}
            {selectedStep && (
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">

                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <span className="text-white text-[10px] font-black">{selectedStep.step_order}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-slate-800 truncate">{pageLabel(selectedStep)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {selectedStep.step_type === "question" ? "Answer all questions below" : "Read through this content"}
                    </p>
                  </div>
                  <TypeBadge step={selectedStep} />
                </div>

                {/* Card body */}
                <div className="p-4 sm:p-5 space-y-4">

                  {/* ── File content ── */}
                  {selectedStep.fileUrl ? (
                    <>
                      {isVideoUrl(selectedStep.fileUrl) ? (
                        <>
                          {/* Video player */}
                          <div className="relative rounded-[5px] overflow-hidden bg-black">
                            <video
                              ref={videoRef}
                              src={`${SERVER_URL}${selectedStep.fileUrl}`}
                              className="w-full max-h-[70vh] object-contain"
                              onTimeUpdate={handleVideoTimeUpdate}
                              onLoadedMetadata={handleVideoTimeUpdate}
                              onPlay={() => setVideoIsPlaying(true)}
                              onPause={() => setVideoIsPlaying(false)}
                              onEnded={handleVideoEnded}
                            />

                            {/* Custom controls */}
                            <div className="bg-black/80 px-4 py-2 flex items-center gap-3 text-white">
                              <button
                                type="button"
                                onClick={() => { if (activeCheckpoint !== null) return; videoRef.current?.[videoIsPlaying ? "pause" : "play"](); }}
                                disabled={activeCheckpoint !== null}
                                className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors disabled:opacity-50"
                                aria-label={videoIsPlaying ? "Pause" : "Play"}
                              >
                                {videoIsPlaying ? (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" /></svg>
                                )}
                              </button>
                              <span className="text-[11px] tabular-nums">{formatTime(videoCurrentTime)} / {formatTime(videoDuration)}</span>
                              <div className="relative flex-1">
                                <input type="range" min="0" max="100" step="0.1"
                                  value={videoDuration ? (videoCurrentTime / videoDuration) * 100 : 0}
                                  onChange={handleVideoSeek} disabled={activeCheckpoint !== null}
                                  className="w-full h-1.5 rounded-full appearance-none bg-white/30 cursor-pointer disabled:cursor-not-allowed"
                                />
                                {videoDuration > 0 && videoCheckpoints.map((cp, cpIdx) => {
                                  if (cp.isEndOfVideo) return null;
                                  return (
                                    <div key={cpIdx} title={`Checkpoint ${cpIdx + 1} at ${formatTime(cp.atSecond)}`}
                                      className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white pointer-events-none ${clearedCheckpoints.has(cpIdx) ? "bg-green-400" : "bg-amber-400"}`}
                                      style={{ left: `calc(${(cp.atSecond / videoDuration) * 100}% - 4px)` }}
                                    />
                                  );
                                })}
                              </div>
                            </div>

                            {/* Checkpoint overlay */}
                            {activeCheckpoint !== null && (
                              <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-4">
                                <div className="bg-white rounded-[5px] shadow-2xl w-full max-w-lg p-5 space-y-4 overflow-y-auto max-h-[90%]">
                                  <div className="space-y-1">
                                    <p className="text-[15px] font-black text-slate-900">Comprehension Check</p>
                                    <p className="text-[11px] text-slate-400">Answer below to continue watching. You can rewind and rewatch first.</p>
                                  </div>
                                  {(Array.isArray(activeCheckpoint.checkpoint.questions) ? activeCheckpoint.checkpoint.questions : []).map((q, qIdx) => {
                                    const draft = getCheckpointDraft(qIdx);
                                    return (
                                      <div key={qIdx} className="border border-slate-100 rounded-xl p-3 space-y-2">
                                        <p className="text-[12px] font-bold text-slate-700">
                                          Question {qIdx + 1}{q.required !== false && <span className="text-red-400"> *</span>}
                                        </p>
                                        <p className="text-[12px] text-slate-600">{q.prompt}</p>
                                        {q.questionType === "multiple_choice" ? (
                                          <div className="rounded-[5px] overflow-hidden border border-slate-100">
                                            {(Array.isArray(q.options) ? q.options : []).map((opt, oi) => {
                                              const isSel = draft.selectedOption === opt;
                                              return (
                                                <button key={oi} type="button"
                                                  onClick={() => updateCheckpointDraft(qIdx, { selectedOption: opt, responseText: "" })}
                                                  className={`w-full text-left flex items-center gap-3 px-3 py-2 text-[12px] font-medium transition-colors border-b border-slate-100 last:border-b-0 ${isSel ? "text-white" : "text-slate-600 hover:bg-slate-50"}`}
                                                  style={isSel ? { backgroundColor: ACCENT } : {}}
                                                >
                                                  <span className="w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center" style={isSel ? { borderColor: "rgba(255,255,255,0.6)" } : { borderColor: "#cbd5e1" }}>
                                                    {isSel && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                  </span>
                                                  {opt}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <textarea value={draft.responseText}
                                            onChange={e => updateCheckpointDraft(qIdx, { responseText: e.target.value, selectedOption: "" })}
                                            className="w-full min-h-[80px] rounded-[5px] border border-slate-200 bg-slate-50 p-3 text-[12px] resize-none focus:outline-none focus:border-slate-300"
                                            placeholder="Type your response"
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                  <div className="flex items-center gap-2 pt-1">
                                    <button type="button"
                                      onClick={handleCheckpointContinue}
                                      disabled={!canContinueCheckpoint() || savingCheckpoint}
                                      className="h-9 px-4 rounded-[5px] text-[12px] font-bold text-white disabled:opacity-50 transition-opacity"
                                      style={{ backgroundColor: ACCENT }}
                                    >
                                      {savingCheckpoint ? "Saving…" : "Continue Watching"}
                                    </button>
                                    <button type="button"
                                      onClick={() => {
                                        if (videoRef.current && activeCheckpoint) {
                                          const base = activeCheckpoint.checkpoint.isEndOfVideo ? (videoDuration || 0) : (activeCheckpoint.checkpoint.atSecond || 0);
                                          const t = Math.max(0, base - 10);
                                          videoRef.current.currentTime = t; setVideoCurrentTime(t); setActiveCheckpoint(null); videoRef.current.play();
                                        }
                                      }}
                                      className="text-[11px] text-slate-400 hover:text-slate-600 underline underline-offset-2"
                                    >
                                      Rewind 10s
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {hasPendingEndVideoQuestions && (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-[5px] px-3 py-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                              <p className="text-[11px] text-amber-800 font-medium">
                                End-of-video questions required — complete them to unlock Next.
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        /* Non-video file */
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Document</p>
                          <iframe
                            src={`${SERVER_URL}${selectedStep.fileUrl}`}
                            title={selectedStep.title || `Page ${selectedStep.step_order} document`}
                            className="w-full h-[500px] rounded-[5px] border border-slate-200 bg-white"
                          />
                          <a href={`${SERVER_URL}${selectedStep.fileUrl}`} target="_blank" rel="noreferrer"
                            className="text-[11px] font-semibold underline underline-offset-2"
                            style={{ color: ACCENT }}
                          >
                            Open in new tab →
                          </a>
                          {selectedStepMetadata.uploadDescription && (
                            <p className="text-[12px] text-slate-600">{selectedStepMetadata.uploadDescription}</p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Text content */
                    <p className="text-[13px] text-slate-700 leading-relaxed">{selectedStep.body}</p>
                  )}

                  {/* ── Questions ── */}
                  {selectedStep.step_type === "question" && (
                    <div className="space-y-3">
                      {selectedStepQuestions.map((question, qi) => {
                        const draft    = getAnswerDraft(selectedStep.id, qi);
                        const comments = isSubmitted
                          ? selectedQuestionFeedback.filter(item => Number(item?.question_index) === qi)
                          : [];
                        const qColor = Q_BADGE_COLORS[qi % Q_BADGE_COLORS.length];
                        return (
                          <div key={`q-${selectedStep.id}-${qi}`}
                            className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm"
                          >
                            {/* Question header */}
                            <div className={`px-4 py-3 ${qColor.header} border-b ${qColor.border} flex items-center gap-2`}>
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-black text-white ${qColor.bg}`}>
                                {qi + 1}
                              </div>
                              <p className="text-[11px] font-bold text-slate-700">
                                Question {qi + 1}
                                {question.required !== false && <span className="text-red-400"> *</span>}
                              </p>
                            </div>

                            <div className="p-4 space-y-3">
                              <p className="text-[13px] text-slate-700 leading-relaxed">{question.prompt}</p>

                              {question.questionType === "multiple_choice" ? (
                                <div className="rounded-xl overflow-hidden border border-slate-100">
                                  {question.options.map((opt, oi) => {
                                    const isSelected = draft.selectedOption === opt;
                                    return (
                                      <button key={`opt-${selectedStep.id}-${qi}-${oi}`} type="button"
                                        onClick={() => updateAnswerDraft(selectedStep.id, qi, { selectedOption: opt, responseText: "" })}
                                        disabled={isSubmitted}
                                        className={`w-full text-left px-4 py-2.5 text-[12px] font-medium transition-colors flex items-center gap-3 border-b border-slate-100 last:border-b-0 disabled:cursor-not-allowed ${
                                          isSelected ? "text-white" : "text-slate-600 hover:bg-slate-50"
                                        }`}
                                        style={isSelected ? { backgroundColor: ACCENT } : {}}
                                      >
                                        <span
                                          className="w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
                                          style={isSelected ? { borderColor: "rgba(255,255,255,0.6)" } : { borderColor: "#cbd5e1" }}
                                        >
                                          {isSelected && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                          )}
                                        </span>
                                        {opt}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <textarea value={draft.responseText}
                                  onChange={e => updateAnswerDraft(selectedStep.id, qi, { responseText: e.target.value, selectedOption: "" })}
                                  className="w-full min-h-[100px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700 resize-none focus:outline-none focus:border-slate-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                  placeholder="Type your response here…"
                                  disabled={isSubmitted}
                                />
                              )}

                              {/* Feedback (submitted state) */}
                              {isSubmitted && (
                                <div className="pt-3 border-t border-slate-100 space-y-2">
                                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400">Feedback</p>
                                  {comments.length > 0 ? comments.map(comment => (
                                    <div key={`fb-${comment.id}`}
                                      className="rounded-[5px] border border-blue-100 bg-blue-50 px-3 py-2.5 space-y-1"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        {comment.awarded_points !== null && comment.possible_points !== null && (
                                          <span className="inline-flex items-center gap-1 bg-white border border-green-200 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                            <Star size={9} strokeWidth={2.5} />
                                            {comment.awarded_points}/{comment.possible_points}
                                          </span>
                                        )}
                                        <span className="text-[9px] text-slate-400 ml-auto">{formatDate(comment.created_at, true)}</span>
                                      </div>
                                      <p className="text-[12px] text-slate-700 leading-relaxed">{comment.comment_text}</p>
                                    </div>
                                  )) : (
                                    <p className="text-[11px] text-slate-400">No feedback yet.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Video checkpoint review (submitted) ── */}
                  {isSubmitted && selectedStep?.fileUrl && isVideoUrl(selectedStep.fileUrl) && selectedVideoCheckpointReviews.length > 0 && (
                    <div className="border border-slate-100 rounded-[5px] overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-[11px] font-black text-slate-700">Your Checkpoint Answers</p>
                      </div>
                      <div className="p-4 space-y-3">
                        {selectedVideoCheckpointReviews.map(({ checkpoint, checkpointIndex, responses }) => (
                          <div key={`vcp-${selectedStep.id}-${checkpointIndex}`}
                            className="border border-slate-100 rounded-xl p-3 space-y-2"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              {checkpoint?.isEndOfVideo ? "End of Video" : `At ${formatTime(checkpoint?.atSecond || 0)}`}
                            </p>
                            {(Array.isArray(checkpoint?.questions) ? checkpoint.questions : []).map((q, qi) => {
                              const resp = responses.find(r => Number(r.questionIndex) === qi);
                              const answer = q?.questionType === "multiple_choice" ? String(resp?.selectedOption || "").trim() : String(resp?.responseText || "").trim();
                              const encIdx = (checkpointIndex + 1) * 1000 + qi;
                              const cpComments = (Array.isArray(submissionSummary?.feedback) ? submissionSummary.feedback : [])
                                .filter(item => Number(item?.step_id) === Number(selectedStep.id) && Number(item?.question_index) === encIdx);
                              return (
                                <div key={`vca-${selectedStep.id}-${checkpointIndex}-${qi}`} className="space-y-2 pt-2 border-t border-slate-100 first:border-t-0 first:pt-0">
                                  <p className="text-[12px] font-semibold text-slate-700">Q{qi + 1}: {String(q?.prompt || "")}</p>
                                  <p className="text-[12px] text-slate-500 bg-slate-50 border border-slate-100 rounded-[5px] px-3 py-2">
                                    {answer || "No response"}
                                  </p>
                                  {cpComments.length > 0 && cpComments.map(comment => (
                                    <div key={`vfb-${comment.id}`} className="rounded-[5px] border border-blue-100 bg-blue-50 px-3 py-2.5 space-y-1">
                                      {comment.awarded_points !== null && comment.possible_points !== null && (
                                        <span className="inline-flex items-center gap-1 bg-white border border-green-200 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                          <Star size={9} strokeWidth={2.5} />
                                          {comment.awarded_points}/{comment.possible_points}
                                        </span>
                                      )}
                                      <p className="text-[12px] text-slate-700">{comment.comment_text}</p>
                                      <p className="text-[9px] text-slate-400">{formatDate(comment.created_at, true)}</p>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Inline action error */}
                {actionError && (
                  <div className="mx-4 mb-0 mt-0 flex items-center gap-2 bg-red-50 border border-red-100 rounded-[5px] px-3 py-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    <p className="text-[11px] text-red-600 font-medium flex-1">{actionError}</p>
                    <button type="button" onClick={() => setActionError("")} className="text-red-400 hover:text-red-600 ml-1 shrink-0 text-[13px] leading-none">×</button>
                  </div>
                )}

                {/* ── Card footer — navigation ── */}
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 flex items-center justify-between gap-2">
                  <button type="button"
                    onClick={handlePreviousPage}
                    disabled={!isReading || selectedStepIndex <= 0 || savingProgress}
                    className="h-8 px-3 rounded-xl text-[11px] font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>

                  <div className="flex items-center gap-2">
                    <AutosaveIndicator state={answersAutosaveState} />
                    <span className="text-[10px] text-slate-400 hidden sm:block">
                      {savingProgress ? "Saving…" : `${selectedStepIndex + 1} / ${totalSteps}`}
                    </span>
                  </div>

                  {isReading && totalSteps > 0 && selectedStepIndex >= totalSteps - 1 ? (
                    isSubmitted ? (
                      <button type="button"
                        onClick={() => router.push("/manage/scholar-dashboard/classes")}
                        className="h-8 px-3 rounded-xl text-[11px] font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                      >
                        Back to Classes
                      </button>
                    ) : (
                      <button type="button"
                        onClick={handleFinishLesson}
                        disabled={savingProgress || savingAnswers || hasPendingEndVideoQuestions}
                        className="h-8 px-4 rounded-xl text-[11px] font-bold text-white disabled:opacity-50 transition-opacity"
                        style={{ backgroundColor: ACCENT }}
                      >
                        {savingProgress ? "Finishing…" : hasPendingEndVideoQuestions ? "Complete Questions" : "Finish Lesson ✓"}
                      </button>
                    )
                  ) : (
                    <button type="button"
                      onClick={handleNextPage}
                      disabled={!totalSteps || savingProgress || savingAnswers || (!isSubmitted && hasPendingEndVideoQuestions)}
                      className="h-8 px-4 rounded-xl text-[11px] font-bold text-white disabled:opacity-50 transition-opacity"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {savingProgress ? "Saving…" : hasPendingEndVideoQuestions ? "Complete Questions" : "Next →"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
