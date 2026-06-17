"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import HeaderSection from "@/components/ui/HeaderSection";
import Typography from "@/components/ui/Typography";
import Input from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const VIDEO_EXTENSIONS_SET = new Set(["mp4", "webm", "mov", "ogg", "avi", "mkv", "m4v"]);
const DOCUMENT_ACCEPT = ".pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.rtf,.md,.odt";
const VIDEO_ACCEPT = "video/*,.mp4,.webm,.mov,.ogg,.avi,.mkv,.m4v";

function getPageTypeLabel(stepType) {
  if (stepType === "text") return "Text Content";
  if (stepType === "file") return "File Content";
  if (stepType === "video") return "Video Content";
  return "Questions";
}

function getExtensionFromPath(value) {
  const raw = String(value || "");
  const withoutQuery = raw.split("?")[0];
  const ext = withoutQuery.split(".").pop() || "";
  return ext.toLowerCase();
}

async function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return null;
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function createStep(stepType = "text") {
  return {
    stepType,
    title: "",
    body: "",
    uploadDescription: "",
    questions: stepType === "question"
      ? [{ prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }]
      : [],
    videoCheckpoints: [],
    videoDuration: null,
    file: null,
  };
}

function normalizeDraftStep(step) {
  const stepType = ["text", "file", "video", "question"].includes(step?.stepType)
    ? step.stepType
    : "text";

  const normalizedQuestions = stepType === "question"
    ? (Array.isArray(step?.questions) ? step.questions : []).map((question) => ({
      prompt: String(question?.prompt || ""),
      questionType: question?.questionType === "multiple_choice" ? "multiple_choice" : "open",
      required: question?.required !== false,
      options: question?.questionType === "multiple_choice"
        ? (Array.isArray(question?.options) && question.options.length
          ? question.options.map((option) => String(option || ""))
          : ["", ""])
        : ["", ""],
      totalPoints: question?.totalPoints != null && question.totalPoints !== "" ? String(question.totalPoints) : "",
    }))
    : [];

  const normalizedCheckpoints = stepType === "video"
    ? (Array.isArray(step?.videoCheckpoints) ? step.videoCheckpoints : []).map((cp) => ({
      isEndOfVideo: cp?.isEndOfVideo === true,
      atSecond: cp?.isEndOfVideo === true ? null : Math.max(0, Number(cp?.atSecond) || 0),
      questions: (Array.isArray(cp?.questions) ? cp.questions : []).map((question) => ({
        prompt: String(question?.prompt || ""),
        questionType: question?.questionType === "multiple_choice" ? "multiple_choice" : "open",
        required: question?.required !== false,
        options: question?.questionType === "multiple_choice"
          ? (Array.isArray(question?.options) && question.options.length
            ? question.options.map((option) => String(option || ""))
            : ["", ""])
          : ["", ""],
      })),
    }))
    : [];

  return {
    stepType,
    title: String(step?.title || ""),
    body: String(step?.body || ""),
    uploadDescription: String(step?.uploadDescription || ""),
    questions: normalizedQuestions.length
      ? normalizedQuestions
      : (stepType === "question" ? [{ prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }] : []),
    videoCheckpoints: normalizedCheckpoints,
    videoDuration: typeof step?.videoDuration === "number" && isFinite(step.videoDuration)
      ? step.videoDuration
      : null,
    file: null,
  };
}

function toDateTimeLocalInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (number) => String(number).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function inferStepType(stepType, body, metadata) {
  if (stepType === "question") return "question";
  const contentType = String(metadata?.contentType || "").trim();
  if (["text", "file", "video"].includes(contentType)) return contentType;

  const bodyString = String(body || "");
  const isUploadPath = bodyString.startsWith("lessons/");
  if (!isUploadPath) return "text";

  if (Array.isArray(metadata?.videoCheckpoints) && metadata.videoCheckpoints.length > 0) {
    return "video";
  }

  const ext = getExtensionFromPath(bodyString);
  if (VIDEO_EXTENSIONS_SET.has(ext)) return "video";
  return "file";
}

export default function EditClassLessonPage() {
  const { authenticated, unshiftString, SERVER_URL, startUpload } = useContext(DataContext);
  const router = useRouter();
  const params = useParams();
  const classId = String(params?.classId || "");
  const lessonId = String(params?.lessonId || "");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [isVisibleToStudents, setIsVisibleToStudents] = useState(true);
  const [targetType, setTargetType] = useState("class");
  const [targetScholarEmails, setTargetScholarEmails] = useState([]);
  const [classMembers, setClassMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [steps, setSteps] = useState([createStep("text")]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [draggedStepIndex, setDraggedStepIndex] = useState(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState(null);

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  const draftStorageKey = useMemo(() => {
    if (!classId || !lessonId || !teacherEmail) return "";
    return `edit-lesson-draft:${classId}:${lessonId}:${teacherEmail}`;
  }, [classId, lessonId, teacherEmail]);

  useEffect(() => {
    if (!draftStorageKey) {
      setDraftReady(true);
      return;
    }

    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setTitle(String(parsed?.title || ""));
        setDescription(String(parsed?.description || ""));
        setDueAt(String(parsed?.dueAt || ""));
        setIsVisibleToStudents(parsed?.isVisibleToStudents !== false);
        setTargetType(parsed?.targetType === "scholars" ? "scholars" : "class");
        setTargetScholarEmails(Array.isArray(parsed?.targetScholarEmails)
          ? parsed.targetScholarEmails.map((email) => String(email || "")).filter(Boolean)
          : []);

        const draftSteps = Array.isArray(parsed?.steps)
          ? parsed.steps.map(normalizeDraftStep)
          : [];
        setSteps(draftSteps.length ? draftSteps : [createStep("text")]);

        const maxSlideIndex = (draftSteps.length ? draftSteps.length : 1) + 1;
        const nextSlide = Math.max(0, Math.min(Number(parsed?.currentSlideIndex) || 0, maxSlideIndex));
        setCurrentSlideIndex(nextSlide);

        if (parsed?.savedAt) {
          setLastDraftSavedAt(parsed.savedAt);
        }

        setHasRestoredDraft(true);
      }
    } catch (error) {
      console.error("Failed to restore lesson draft:", error);
    } finally {
      setDraftReady(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    const loadLesson = async () => {
      if (!SERVER_URL || !classId || !lessonId || !teacherEmail) return;

      try {
        setLoadingLesson(true);
        const response = await fetch(
          `${SERVER_URL}/classes/${classId}/lessons/${lessonId}?teacherEmail=${encodeURIComponent(teacherEmail)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || "Failed to load lesson");
        }

        setTitle(payload.title || "");
        setDescription(payload.description || "");
        setDueAt(toDateTimeLocalInput(payload.dueAt));
        setIsVisibleToStudents(Boolean(payload.isVisibleToStudents));
        setTargetType(payload.targetType === "scholars" ? "scholars" : "class");
        setTargetScholarEmails(Array.isArray(payload.targetScholarEmails) ? payload.targetScholarEmails : []);

        const mappedSteps = (Array.isArray(payload.steps) ? payload.steps : []).map((step) => {
          const metadata = step?.metadata && typeof step.metadata === "object" ? step.metadata : {};
          const resolvedStepType = inferStepType(step.step_type, step.body, metadata);

          const normalizedQuestions = Array.isArray(metadata.questions) && metadata.questions.length
            ? metadata.questions.map((question) => ({
              prompt: String(question?.prompt || ""),
              questionType: question?.questionType === "multiple_choice" ? "multiple_choice" : "open",
              required: question?.required !== false,
              options: question?.questionType === "multiple_choice"
                ? (Array.isArray(question?.options) && question.options.length ? question.options.map((option) => String(option || "")) : ["", ""])
                : ["", ""],
              totalPoints: question?.totalPoints != null && question.totalPoints !== "" ? String(question.totalPoints) : "",
            }))
            : [{ prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }];

          const normalizedCheckpoints = Array.isArray(metadata.videoCheckpoints)
            ? metadata.videoCheckpoints.map((cp) => ({
              isEndOfVideo: cp.isEndOfVideo === true,
              atSecond: cp.isEndOfVideo === true ? null : Math.max(0, Number(cp.atSecond) || 0),
              questions: Array.isArray(cp.questions)
                ? cp.questions.map((q) => ({
                  prompt: String(q.prompt || ""),
                  questionType: q.questionType === "multiple_choice" ? "multiple_choice" : "open",
                  required: q.required !== false,
                  options: q.questionType === "multiple_choice"
                    ? (Array.isArray(q.options) && q.options.length ? q.options.map((o) => String(o || "")) : ["", ""])
                    : ["", ""],
                }))
                : [],
            }))
            : [];

          return {
            stepType: resolvedStepType,
            title: String(step.title || ""),
            body: resolvedStepType === "text" ? String(step.body || "") : String(step.body || ""),
            uploadDescription: String(metadata.uploadDescription || ""),
            questions: resolvedStepType === "question" ? normalizedQuestions : [],
            videoCheckpoints: resolvedStepType === "video" ? normalizedCheckpoints : [],
            videoDuration: null,
            file: null,
          };
        });

        setSteps(mappedSteps.length > 0 ? mappedSteps : [createStep("text")]);
      } catch (error) {
        console.error("Load lesson failed:", error);
        alert(error.message || "Failed to load lesson");
      } finally {
        setLoadingLesson(false);
      }
    };

    if (authenticated && draftReady && !hasRestoredDraft) {
      loadLesson();
    }
  }, [authenticated, SERVER_URL, classId, lessonId, teacherEmail, draftReady, hasRestoredDraft]);

  useEffect(() => {
    const loadClassMembers = async () => {
      if (!SERVER_URL || !classId || !teacherEmail) return;

      try {
        setLoadingMembers(true);
        const response = await fetch(
          `${SERVER_URL}/classes/${classId}/members?teacherEmail=${encodeURIComponent(teacherEmail)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || "Failed to load class members");
        }

        setClassMembers(Array.isArray(payload) ? payload : []);
      } catch (error) {
        console.error("Load class members failed:", error);
      } finally {
        setLoadingMembers(false);
      }
    };

    if (authenticated) {
      loadClassMembers();
    }
  }, [authenticated, SERVER_URL, classId, teacherEmail]);

  useEffect(() => {
    const maxSlideIndex = steps.length + 1;
    setCurrentSlideIndex((prev) => Math.min(prev, maxSlideIndex));
  }, [steps.length]);

  useEffect(() => {
    if (!draftReady || !draftStorageKey) return;

    const timeoutId = setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        const serializableSteps = steps.map((step) => ({
          ...step,
          file: null,
        }));

        localStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            title,
            description,
            dueAt,
            isVisibleToStudents,
            targetType,
            targetScholarEmails,
            steps: serializableSteps,
            currentSlideIndex,
            savedAt,
          })
        );
        setLastDraftSavedAt(savedAt);
      } catch (error) {
        console.error("Failed to autosave lesson draft:", error);
      }
    }, 600);

    return () => clearTimeout(timeoutId);
  }, [
    draftReady,
    draftStorageKey,
    title,
    description,
    dueAt,
    isVisibleToStudents,
    targetType,
    targetScholarEmails,
    steps,
    currentSlideIndex,
  ]);

  const toggleTargetScholar = (scholarEmail) => {
    setTargetScholarEmails((prev) =>
      prev.includes(scholarEmail)
        ? prev.filter((email) => email !== scholarEmail)
        : [...prev, scholarEmail]
    );
  };

  const updateStep = (index, patch) => {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const reorderStep = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    setSteps((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      setCurrentSlideIndex((slide) => {
        if (slide < 2) return slide;
        const currentEditingIndex = slide - 2;
        if (currentEditingIndex === fromIndex) return toIndex + 2;
        if (fromIndex < currentEditingIndex && currentEditingIndex <= toIndex) return slide - 1;
        if (toIndex <= currentEditingIndex && currentEditingIndex < fromIndex) return slide + 1;
        return slide;
      });

      return next;
    });
  };

  const handleOverviewDragStart = (index) => {
    setDraggedStepIndex(index);
  };

  const handleOverviewDrop = (dropIndex) => {
    if (draggedStepIndex === null) return;
    reorderStep(draggedStepIndex, dropIndex);
    setDraggedStepIndex(null);
  };

  const removeStep = (index) => {
    setSteps((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      setCurrentSlideIndex((slide) => {
        if (slide < 2) return slide;
        const currentEditingStep = slide - 2;
        if (currentEditingStep > index) return slide - 1;
        return Math.min(currentEditingStep, next.length - 1) + 2;
      });
      return next;
    });
  };

  const addStepAndFocus = (type) => {
    setSteps((prev) => {
      const next = [...prev, createStep(type)];
      setCurrentSlideIndex(1);
      return next;
    });
  };

  const handleStepFileChange = async (index, file) => {
    const stepType = steps[index]?.stepType;
    if (!file) {
      updateStep(index, { file: null, videoDuration: null, videoCheckpoints: stepType === "video" ? steps[index]?.videoCheckpoints || [] : [] });
      return;
    }

    const ext = String(file.name).split(".").pop().toLowerCase();
    const isVideo = VIDEO_EXTENSIONS_SET.has(ext);

    if (stepType === "video" && !isVideo) {
      alert("Video Content pages only accept video file types.");
      return;
    }

    if (stepType === "file" && isVideo) {
      alert("File Content pages cannot use video files.");
      return;
    }

    let duration = null;
    if (stepType === "video" && isVideo) {
      duration = await getVideoDuration(file);
    }

    updateStep(index, {
      file: file || null,
      videoDuration: stepType === "video" ? duration : null,
      videoCheckpoints: stepType === "video" ? (steps[index]?.videoCheckpoints || []) : [],
    });
  };

  const updateQuestionOption = (stepIndex, questionIndex, optionIndex, value) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const nextQuestions = Array.isArray(step.questions) ? [...step.questions] : [];
        const nextQuestion = nextQuestions[questionIndex] || { prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" };
        const nextOptions = Array.isArray(nextQuestion.options) ? [...nextQuestion.options] : ["", ""];
        nextOptions[optionIndex] = value;
        nextQuestions[questionIndex] = { ...nextQuestion, options: nextOptions };
        return { ...step, questions: nextQuestions };
      })
    );
  };

  const addQuestionOption = (stepIndex, questionIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const nextQuestions = Array.isArray(step.questions) ? [...step.questions] : [];
        const nextQuestion = nextQuestions[questionIndex] || { prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" };
        nextQuestions[questionIndex] = {
          ...nextQuestion,
          options: [...(Array.isArray(nextQuestion.options) ? nextQuestion.options : []), ""],
        };
        return { ...step, questions: nextQuestions };
      })
    );
  };

  const removeQuestionOption = (stepIndex, questionIndex, optionIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const nextQuestions = Array.isArray(step.questions) ? [...step.questions] : [];
        const nextQuestion = nextQuestions[questionIndex] || { prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" };
        const existingOptions = Array.isArray(nextQuestion.options) ? nextQuestion.options : [];
        const nextOptions = existingOptions.filter((_, idx) => idx !== optionIndex);
        nextQuestions[questionIndex] = { ...nextQuestion, options: nextOptions.length ? nextOptions : ["", ""] };
        return { ...step, questions: nextQuestions };
      })
    );
  };

  const addStepQuestion = (stepIndex) => {
    setSteps((prev) =>
      prev.map((step, i) =>
        i === stepIndex
          ? {
            ...step,
            questions: [...(Array.isArray(step.questions) ? step.questions : []), { prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }],
          }
          : step
      )
    );
  };

  const removeStepQuestion = (stepIndex, questionIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const existing = Array.isArray(step.questions) ? step.questions : [];
        const next = existing.filter((_, idx) => idx !== questionIndex);
        return {
          ...step,
          questions: next.length ? next : [{ prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }],
        };
      })
    );
  };

  const updateStepQuestion = (stepIndex, questionIndex, patch) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const nextQuestions = Array.isArray(step.questions) ? [...step.questions] : [];
        const existing = nextQuestions[questionIndex] || { prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" };
        nextQuestions[questionIndex] = { ...existing, ...patch };
        return { ...step, questions: nextQuestions };
      })
    );
  };

  const addVideoCheckpoint = (stepIndex) => {
    setSteps((prev) =>
      prev.map((step, i) =>
        i === stepIndex
          ? {
            ...step,
            videoCheckpoints: [
              ...(Array.isArray(step.videoCheckpoints) ? step.videoCheckpoints : []),
              { isEndOfVideo: false, atSecond: 0, questions: [{ prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }] },
            ],
          }
          : step
      )
    );
  };

  const addEndOfVideoCheckpoint = (stepIndex) => {
    setSteps((prev) =>
      prev.map((step, i) =>
        i === stepIndex
          ? {
            ...step,
            videoCheckpoints: [
              ...(Array.isArray(step.videoCheckpoints) ? step.videoCheckpoints : []),
              { isEndOfVideo: true, atSecond: null, questions: [{ prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }] },
            ],
          }
          : step
      )
    );
  };

  const removeVideoCheckpoint = (stepIndex, cpIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const existing = Array.isArray(step.videoCheckpoints) ? step.videoCheckpoints : [];
        return { ...step, videoCheckpoints: existing.filter((_, idx) => idx !== cpIndex) };
      })
    );
  };

  const updateVideoCheckpoint = (stepIndex, cpIndex, patch) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const cps = Array.isArray(step.videoCheckpoints) ? [...step.videoCheckpoints] : [];
        cps[cpIndex] = { ...cps[cpIndex], ...patch };
        return { ...step, videoCheckpoints: cps };
      })
    );
  };

  const addCheckpointQuestion = (stepIndex, cpIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const cps = Array.isArray(step.videoCheckpoints) ? [...step.videoCheckpoints] : [];
        const cp = { ...cps[cpIndex] };
        cp.questions = [
          ...(Array.isArray(cp.questions) ? cp.questions : []),
          { prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" },
        ];
        cps[cpIndex] = cp;
        return { ...step, videoCheckpoints: cps };
      })
    );
  };

  const removeCheckpointQuestion = (stepIndex, cpIndex, qIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const cps = Array.isArray(step.videoCheckpoints) ? [...step.videoCheckpoints] : [];
        const cp = { ...cps[cpIndex] };
        const qs = Array.isArray(cp.questions) ? cp.questions : [];
        const filtered = qs.filter((_, idx) => idx !== qIndex);
        cp.questions = filtered.length ? filtered : [{ prompt: "", questionType: "open", required: true, options: ["", ""], totalPoints: "" }];
        cps[cpIndex] = cp;
        return { ...step, videoCheckpoints: cps };
      })
    );
  };

  const updateCheckpointQuestion = (stepIndex, cpIndex, qIndex, patch) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const cps = Array.isArray(step.videoCheckpoints) ? [...step.videoCheckpoints] : [];
        const cp = { ...cps[cpIndex] };
        const qs = Array.isArray(cp.questions) ? [...cp.questions] : [];
        qs[qIndex] = { ...qs[qIndex], ...patch };
        cp.questions = qs;
        cps[cpIndex] = cp;
        return { ...step, videoCheckpoints: cps };
      })
    );
  };

  const addCheckpointQuestionOption = (stepIndex, cpIndex, qIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const cps = Array.isArray(step.videoCheckpoints) ? [...step.videoCheckpoints] : [];
        const cp = { ...cps[cpIndex] };
        const qs = Array.isArray(cp.questions) ? [...cp.questions] : [];
        qs[qIndex] = { ...qs[qIndex], options: [...(Array.isArray(qs[qIndex]?.options) ? qs[qIndex].options : []), ""] };
        cp.questions = qs;
        cps[cpIndex] = cp;
        return { ...step, videoCheckpoints: cps };
      })
    );
  };

  const removeCheckpointQuestionOption = (stepIndex, cpIndex, qIndex, optIndex) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const cps = Array.isArray(step.videoCheckpoints) ? [...step.videoCheckpoints] : [];
        const cp = { ...cps[cpIndex] };
        const qs = Array.isArray(cp.questions) ? [...cp.questions] : [];
        const opts = Array.isArray(qs[qIndex]?.options) ? qs[qIndex].options : [];
        const next = opts.filter((_, idx) => idx !== optIndex);
        qs[qIndex] = { ...qs[qIndex], options: next.length >= 2 ? next : ["", ""] };
        cp.questions = qs;
        cps[cpIndex] = cp;
        return { ...step, videoCheckpoints: cps };
      })
    );
  };

  const updateCheckpointQuestionOption = (stepIndex, cpIndex, qIndex, optIndex, value) => {
    setSteps((prev) =>
      prev.map((step, i) => {
        if (i !== stepIndex) return step;
        const cps = Array.isArray(step.videoCheckpoints) ? [...step.videoCheckpoints] : [];
        const cp = { ...cps[cpIndex] };
        const qs = Array.isArray(cp.questions) ? [...cp.questions] : [];
        const opts = Array.isArray(qs[qIndex]?.options) ? [...qs[qIndex].options] : [];
        opts[optIndex] = value;
        qs[qIndex] = { ...qs[qIndex], options: opts };
        cp.questions = qs;
        cps[cpIndex] = cp;
        return { ...step, videoCheckpoints: cps };
      })
    );
  };

  const handleUpdateLesson = async () => {
    if (!title.trim()) {
      alert("Lesson title is required.");
      return;
    }

    if (steps.some((step) => {
      const hasExistingUploadPath = String(step.body || "").startsWith("lessons/");

      if ((step.stepType === "file" || step.stepType === "video") && !step.file && !hasExistingUploadPath) {
        return true;
      }

      if (step.stepType === "text" && !step.body.trim()) {
        return true;
      }

      if (step.stepType === "video") {
        if (step.file) {
          const ext = String(step.file.name || "").split(".").pop().toLowerCase();
          if (!VIDEO_EXTENSIONS_SET.has(ext)) return true;
        } else if (hasExistingUploadPath) {
          const ext = getExtensionFromPath(step.body);
          if (ext && !VIDEO_EXTENSIONS_SET.has(ext)) return true;
        }
      }

      if (step.stepType === "file") {
        if (step.file) {
          const ext = String(step.file.name || "").split(".").pop().toLowerCase();
          if (VIDEO_EXTENSIONS_SET.has(ext)) return true;
        } else if (hasExistingUploadPath) {
          const ext = getExtensionFromPath(step.body);
          if (VIDEO_EXTENSIONS_SET.has(ext)) return true;
        }
      }

      if (step.stepType === "question") {
        const questions = Array.isArray(step.questions) ? step.questions : [];
        if (!questions.length) return true;

        return questions.some((question) => {
          if (!String(question?.prompt || "").trim()) return true;
          if (question?.questionType === "multiple_choice") {
            const validOptions = (question.options || []).filter((option) => option.trim());
            return validOptions.length < 2;
          }
          return false;
        });
      }

      return false;
    })) {
      alert("Each page must include valid content or questions.");
      return;
    }

    if (!teacherEmail) {
      alert("Teacher identity missing. Please log in again.");
      return;
    }

    if (targetType === "scholars" && targetScholarEmails.length === 0) {
      alert("Select at least one student when assigning to specific students.");
      return;
    }

    try {
      setSaving(true);

      const formData = new FormData();
      formData.append("teacherEmail", teacherEmail);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("dueAt", dueAt || "");
      formData.append("isVisibleToStudents", isVisibleToStudents ? "1" : "0");
      formData.append("targetType", targetType);
      formData.append("targetScholarEmails", JSON.stringify(targetScholarEmails));

      const stepPayload = steps.map((step, index) => {
        const metadata = { contentType: step.stepType };

        if ((step.stepType === "file" || step.stepType === "video") && step.uploadDescription.trim()) {
          metadata.uploadDescription = step.uploadDescription.trim();
        }

        if (step.stepType === "question") {
          metadata.questions = (Array.isArray(step.questions) ? step.questions : []).map((question) => ({
            prompt: String(question?.prompt || "").trim(),
            questionType: question?.questionType === "multiple_choice" ? "multiple_choice" : "open",
            required: question?.required !== false,
            options: question?.questionType === "multiple_choice"
              ? (question.options || []).map((option) => option.trim()).filter(Boolean)
              : [],
            totalPoints: question?.totalPoints !== "" && question?.totalPoints != null
              ? Number(question.totalPoints)
              : null,
          }));
        }

        if (step.stepType === "video") {
          const maxSecond = typeof step.videoDuration === "number" && isFinite(step.videoDuration)
            ? Math.floor(step.videoDuration) - 1
            : null;
          const validCheckpoints = (Array.isArray(step.videoCheckpoints) ? step.videoCheckpoints : [])
            .map((cp) => ({
              isEndOfVideo: cp.isEndOfVideo === true,
              atSecond: cp.isEndOfVideo === true ? null : (maxSecond !== null
                ? Math.min(Math.max(0, Number(cp.atSecond) || 0), maxSecond)
                : Math.max(0, Number(cp.atSecond) || 0)),
              questions: (Array.isArray(cp.questions) ? cp.questions : [])
                .filter((q) => String(q?.prompt || "").trim())
                .map((q) => ({
                  prompt: String(q.prompt || "").trim(),
                  questionType: q.questionType === "multiple_choice" ? "multiple_choice" : "open",
                  required: q.required !== false,
                  options: q.questionType === "multiple_choice"
                    ? (Array.isArray(q.options) ? q.options.map((o) => o.trim()).filter(Boolean) : [])
                    : [],
                })),
            }))
            .filter((cp) => cp.questions.length > 0);
          if (validCheckpoints.length > 0) {
            metadata.videoCheckpoints = validCheckpoints;
          }
        }

        const payload = {
          stepType: step.stepType === "question" ? "question" : "content",
          title: step.title.trim(),
          body: step.stepType === "text" ? step.body.trim() : (String(step.body || "").startsWith("lessons/") ? step.body.trim() : ""),
          contentMode: step.stepType === "text" ? "type" : (step.stepType === "question" ? "type" : "upload"),
          metadata,
          fileField: "",
        };

        if ((step.stepType === "file" || step.stepType === "video") && step.file) {
          const fileField = `stepFile_${index}`;
          payload.fileField = fileField;
          formData.append(fileField, step.file);
        }

        return payload;
      });

      formData.append("steps", JSON.stringify(stepPayload));

      startUpload(
        `${SERVER_URL}/classes/${classId}/lessons/${lessonId}`,
        "PATCH",
        formData,
        title.trim(),
        classId
      );

      if (draftStorageKey) {
        localStorage.removeItem(draftStorageKey);
      }

      router.push(`/manage/teacher/classes?classId=${classId}`);
    } catch (error) {
      console.error("Update lesson failed:", error);
      alert(error.message || "Failed to update lesson");
    } finally {
      setSaving(false);
    }
  };

  if (!authenticated) return <Unauthorized />;

  const totalPages = steps.length + 2;
  const pageIndex = Math.max(0, Math.min(currentSlideIndex, totalPages - 1));
  const isIntroSlide = pageIndex === 0;
  const isOverviewSlide = pageIndex === 1;
  const isStepSlide = pageIndex >= 2;
  const currentStepIndex = Math.max(0, pageIndex - 2);
  const step = steps[currentStepIndex];
  const isFirstSlide = pageIndex === 0;
  const isLastSlide = pageIndex === totalPages - 1;

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent pb-12">
      <HeaderSection
        title="Edit Lesson"
        subtitle="Edit your lesson by pages: intro, overview, then one page per content type."
      />

      <div className="px-4 md:px-0 mt-6 space-y-4">
        {loadingLesson ? <Typography variant="muted">Loading lesson...</Typography> : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <Typography variant="muted" className="text-sm">
              Page {pageIndex + 1}/{totalPages}
            </Typography>
            {lastDraftSavedAt ? (
              <Typography variant="muted" className="text-xs">
                Draft autosaved
              </Typography>
            ) : null}
          </div>
        </div>

        {isIntroSlide ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <Typography variant="h4" color="accent">Opening Page</Typography>
            <Input
              id="lesson-title"
              placeholder="Lesson title"
              value={title}
              onChange={(value) => setTitle(value)}
            />

            <Input
              id="lesson-description"
              variant="textarea"
              placeholder="Lesson description or instructions"
              value={description}
              onChange={(value) => setDescription(value)}
              className="h-40 min-h-40"
            />

            <input
              id="lesson-due-at"
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="px-[14px] py-[10px] rounded-md outline-none transition ring-[1.2px] text-[16px] text-gray-700 font-normal w-full h-10 focus:border-gray-300 ring-gray-300 focus:ring-primary-500"
            />

            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isVisibleToStudents}
                onChange={(event) => setIsVisibleToStudents(event.target.checked)}
                className="h-4 w-4"
              />
              <Typography>
                Visible to students {isVisibleToStudents ? "(ON)" : "(OFF)"}
              </Typography>
            </label>

            <div className="space-y-2">
              <Typography variant="h4" color="accent">Assign Lesson To</Typography>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={targetType === "class" ? "default" : "outline"}
                  onClick={() => {
                    setTargetType("class");
                    setTargetScholarEmails([]);
                  }}
                >
                  All Students
                </Button>
                <Button
                  type="button"
                  variant={targetType === "scholars" ? "default" : "outline"}
                  onClick={() => setTargetType("scholars")}
                >
                  Specific Students
                </Button>
              </div>

              {targetType === "scholars" ? (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2 max-h-52 overflow-y-auto">
                  {loadingMembers ? (
                    <Typography variant="muted" className="text-sm">Loading students...</Typography>
                  ) : classMembers.length === 0 ? (
                    <Typography variant="muted" className="text-sm">No students available in this class yet.</Typography>
                  ) : (
                    classMembers.map((member) => {
                      const memberEmail = String(member.scholar_email || "");
                      const checked = targetScholarEmails.includes(memberEmail);

                      return (
                        <label key={memberEmail} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTargetScholar(memberEmail)}
                            className="h-4 w-4"
                          />
                          <Typography className="text-sm">
                            {member.full_name || memberEmail}
                          </Typography>
                        </label>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {isOverviewSlide ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Typography variant="h4" color="accent">Overview Page</Typography>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => addStepAndFocus("text")}>
                  <Plus className="w-4 h-4" />
                  Add Text
                </Button>
                <Button variant="outline" onClick={() => addStepAndFocus("file")}>
                  <Plus className="w-4 h-4" />
                  Add File
                </Button>
                <Button variant="outline" onClick={() => addStepAndFocus("video")}>
                  <Plus className="w-4 h-4" />
                  Add Video
                </Button>
                <Button variant="outline" onClick={() => addStepAndFocus("question")}>
                  <Plus className="w-4 h-4" />
                  Add Questions
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {steps.map((item, index) => (
                <div
                  key={`${item.stepType}-overview-${index}`}
                  className={`w-full rounded-lg border p-3 hover:bg-slate-50 cursor-grab active:cursor-grabbing ${draggedStepIndex === index ? "border-accent-dark bg-accent-light/20" : "border-slate-200"}`}
                  draggable
                  onDragStart={() => handleOverviewDragStart(index)}
                  onDragEnd={() => setDraggedStepIndex(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleOverviewDrop(index)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left flex-1"
                      onClick={() => setCurrentSlideIndex(index + 2)}
                    >
                      <Typography className="font-semibold">
                        Page {index + 1}/{steps.length} · {getPageTypeLabel(item.stepType)}
                      </Typography>
                      {item.title ? (
                        <Typography variant="muted" className="text-sm mt-1">{item.title}</Typography>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2"
                      disabled={steps.length <= 1}
                      onClick={() => removeStep(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {isStepSlide ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="space-y-3">
              <div key={`${step?.stepType}-${currentStepIndex}`} className="rounded-lg border border-slate-200 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Typography className="font-semibold">
                    Page {currentStepIndex + 1}/{steps.length} · {getPageTypeLabel(step?.stepType)}
                  </Typography>

                  <div className="flex items-center gap-1">
                    <Button variant="outline" className="h-8 px-2" onClick={() => removeStep(currentStepIndex)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <Input
                  id={`step-title-${currentStepIndex}`}
                  placeholder="Page title (optional)"
                  value={step?.title || ""}
                  onChange={(value) => updateStep(currentStepIndex, { title: value })}
                />

                {step?.stepType !== "question" ? (
                  <div className="space-y-2">
                    {step?.stepType === "text" ? (
                      <Input
                        variant="textarea"
                        id={`page-text-body-${currentStepIndex}`}
                        placeholder="Type or paste text content for this page"
                        value={step?.body || ""}
                        onChange={(value) => updateStep(currentStepIndex, { body: value })}
                        className="h-48 min-h-48"
                      />
                    ) : (
                      <div className="space-y-2">
                        <Typography variant="muted" className="text-xs">
                          {step?.stepType === "video"
                            ? "Upload a video file only."
                            : "Upload a non-video file (PDF, text, doc, slide, spreadsheet, etc.)."}
                        </Typography>
                        <input
                          id={`step-file-${currentStepIndex}`}
                          type="file"
                          accept={step?.stepType === "video" ? VIDEO_ACCEPT : DOCUMENT_ACCEPT}
                          onChange={(event) => handleStepFileChange(currentStepIndex, event?.target?.files?.[0] || null)}
                          className="px-[14px] py-[10px] rounded-md outline-none transition ring-[1.2px] text-[16px] text-gray-700 font-normal w-auto h-10 focus:border-gray-300 ring-gray-300 focus:ring-primary-500"
                        />
                        {step?.file ? (
                          <Typography variant="muted" className="text-xs">
                            Selected: {step.file.name}
                          </Typography>
                        ) : String(step?.body || "").startsWith("lessons/") ? (
                          <Typography variant="muted" className="text-xs">
                            Existing file kept: {String(step.body || "").split("/").pop()}
                          </Typography>
                        ) : null}
                        <Input
                          id={`step-upload-description-${currentStepIndex}`}
                          placeholder={step?.stepType === "video" ? "Video notes (optional)" : "File description (optional)"}
                          value={step?.uploadDescription || ""}
                          onChange={(value) => updateStep(currentStepIndex, { uploadDescription: value })}
                        />

                        {step?.stepType === "video" ? (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Typography className="text-sm font-semibold text-blue-800">Video Checkpoints</Typography>
                                {step?.videoDuration ? (
                                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                                    Duration: {formatDuration(step.videoDuration)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => addVideoCheckpoint(currentStepIndex)}>
                                  + At Timestamp
                                </Button>
                                <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => addEndOfVideoCheckpoint(currentStepIndex)}>
                                  + End of Video
                                </Button>
                              </div>
                            </div>
                            <Typography variant="muted" className="text-xs">
                              Pause the video at a specific second and require students to answer questions before continuing.
                            </Typography>

                            {(Array.isArray(step?.videoCheckpoints) ? step.videoCheckpoints : []).map((cp, cpIndex) => (
                              <div key={`cp-${currentStepIndex}-${cpIndex}`} className="rounded-md border border-blue-300 bg-white p-3 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <Typography className="text-sm font-medium">
                                    {cp.isEndOfVideo ? "End of Video Questions" : `Checkpoint ${cpIndex + 1}`}
                                  </Typography>
                                  <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => removeVideoCheckpoint(currentStepIndex, cpIndex)}>
                                    Remove
                                  </Button>
                                </div>

                                {cp.isEndOfVideo ? (
                                  <Typography variant="muted" className="text-xs">These questions will appear automatically when the video finishes.</Typography>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Typography className="text-sm">Stop at second:</Typography>
                                    <input
                                      type="number"
                                      min="0"
                                      {...(step?.videoDuration ? { max: Math.floor(step.videoDuration) - 1 } : {})}
                                      value={cp.atSecond || 0}
                                      onChange={(e) => {
                                        const max = step?.videoDuration ? Math.floor(step.videoDuration) - 1 : Infinity;
                                        updateVideoCheckpoint(currentStepIndex, cpIndex, { atSecond: Math.min(max, Math.max(0, Number(e.target.value) || 0)) });
                                      }}
                                      className="w-24 px-2 py-1 rounded-md border border-slate-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    />
                                    <Typography variant="muted" className="text-xs">
                                      ({Math.floor((cp.atSecond || 0) / 60)}m {(cp.atSecond || 0) % 60}s
                                      {step?.videoDuration ? ` / ${formatDuration(step.videoDuration)}` : ""})
                                    </Typography>
                                  </div>
                                )}

                                <div className="space-y-2">
                                  {(Array.isArray(cp.questions) ? cp.questions : []).map((q, qIndex) => (
                                    <div key={`cp-q-${currentStepIndex}-${cpIndex}-${qIndex}`} className="rounded border border-slate-200 bg-slate-50 p-2 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <Typography className="text-xs font-medium">Question {qIndex + 1}</Typography>
                                        <Button type="button" variant="outline" className="h-6 px-2 text-xs" onClick={() => removeCheckpointQuestion(currentStepIndex, cpIndex, qIndex)}>
                                          Remove
                                        </Button>
                                      </div>

                                      <Input
                                        id={`cp-q-prompt-${currentStepIndex}-${cpIndex}-${qIndex}`}
                                        placeholder="Question prompt"
                                        value={q.prompt || ""}
                                        onChange={(value) => updateCheckpointQuestion(currentStepIndex, cpIndex, qIndex, { prompt: value })}
                                      />

                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button type="button" variant={q.questionType === "multiple_choice" ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => updateCheckpointQuestion(currentStepIndex, cpIndex, qIndex, { questionType: "multiple_choice" })}>
                                          Multiple Choice
                                        </Button>
                                        <Button type="button" variant={q.questionType === "open" ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => updateCheckpointQuestion(currentStepIndex, cpIndex, qIndex, { questionType: "open" })}>
                                          Open Response
                                        </Button>
                                        <Button type="button" variant={q.required !== false ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => updateCheckpointQuestion(currentStepIndex, cpIndex, qIndex, { required: q.required === false })}>
                                          {q.required !== false ? "Required" : "Optional"}
                                        </Button>
                                      </div>

                                      {q.questionType === "multiple_choice" ? (
                                        <div className="space-y-1">
                                          <Typography variant="muted" className="text-xs">At least 2 choices required.</Typography>
                                          {(Array.isArray(q.options) ? q.options : []).map((opt, optIndex) => (
                                            <div key={`cp-opt-${currentStepIndex}-${cpIndex}-${qIndex}-${optIndex}`} className="flex items-center gap-2">
                                              <Input
                                                id={`cp-opt-input-${currentStepIndex}-${cpIndex}-${qIndex}-${optIndex}`}
                                                placeholder={`Choice ${optIndex + 1}`}
                                                value={opt}
                                                onChange={(value) => updateCheckpointQuestionOption(currentStepIndex, cpIndex, qIndex, optIndex, value)}
                                              />
                                              <Button type="button" variant="outline" className="h-10 px-3" onClick={() => removeCheckpointQuestionOption(currentStepIndex, cpIndex, qIndex, optIndex)}>
                                                Remove
                                              </Button>
                                            </div>
                                          ))}
                                          <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => addCheckpointQuestionOption(currentStepIndex, cpIndex, qIndex)}>
                                            Add Choice
                                          </Button>
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                  <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => addCheckpointQuestion(currentStepIndex, cpIndex)}>
                                    Add Question
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Typography variant="muted" className="text-xs">Add one or more questions for this page.</Typography>

                    {(Array.isArray(step?.questions) ? step.questions : []).map((question, questionIndex) => (
                      <div key={`step-${currentStepIndex}-question-${questionIndex}`} className="rounded-md border border-slate-200 p-3 space-y-2 bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <Typography className="font-medium">Question {questionIndex + 1}</Typography>
                          <Button type="button" variant="outline" className="h-8 px-2" onClick={() => removeStepQuestion(currentStepIndex, questionIndex)}>
                            Remove
                          </Button>
                        </div>

                        <Input
                          id={`step-question-prompt-${currentStepIndex}-${questionIndex}`}
                          placeholder="Type the question prompt"
                          value={question?.prompt || ""}
                          onChange={(value) => updateStepQuestion(currentStepIndex, questionIndex, { prompt: value })}
                        />

                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-600 whitespace-nowrap">Points worth:</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 10"
                            value={question?.totalPoints ?? ""}
                            onChange={(e) => updateStepQuestion(currentStepIndex, questionIndex, { totalPoints: e.target.value })}
                            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-slate-500"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Button type="button" variant={question?.questionType === "multiple_choice" ? "default" : "outline"} onClick={() => updateStepQuestion(currentStepIndex, questionIndex, { questionType: "multiple_choice" })}>
                            Multiple Choice
                          </Button>
                          <Button type="button" variant={question?.questionType === "open" ? "default" : "outline"} onClick={() => updateStepQuestion(currentStepIndex, questionIndex, { questionType: "open" })}>
                            Open Response
                          </Button>
                          <Button type="button" variant={question?.required !== false ? "default" : "outline"} onClick={() => updateStepQuestion(currentStepIndex, questionIndex, { required: question?.required === false })}>
                            {question?.required !== false ? "Required" : "Optional"}
                          </Button>
                        </div>

                        {question?.questionType === "multiple_choice" ? (
                          <div className="space-y-2">
                            <Typography variant="muted" className="text-xs">Add at least 2 answer choices.</Typography>
                            {(question.options || []).map((option, optionIndex) => (
                              <div key={`question-option-${currentStepIndex}-${questionIndex}-${optionIndex}`} className="flex items-center gap-2">
                                <Input
                                  id={`step-question-option-${currentStepIndex}-${questionIndex}-${optionIndex}`}
                                  placeholder={`Choice ${optionIndex + 1}`}
                                  value={option}
                                  onChange={(value) => updateQuestionOption(currentStepIndex, questionIndex, optionIndex, value)}
                                />
                                <Button type="button" variant="outline" className="h-10 px-3" onClick={() => removeQuestionOption(currentStepIndex, questionIndex, optionIndex)}>
                                  Remove
                                </Button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" onClick={() => addQuestionOption(currentStepIndex, questionIndex)}>
                              Add Choice
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}

                    <Button type="button" variant="outline" onClick={() => addStepQuestion(currentStepIndex)}>
                      Add Another Question
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={isFirstSlide} onClick={() => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))}>
            Previous Page
          </Button>
          <Button type="button" variant="outline" disabled={isLastSlide} onClick={() => setCurrentSlideIndex((prev) => Math.min(totalPages - 1, prev + 1))}>
            Next Page
          </Button>
          <Button onClick={handleUpdateLesson} disabled={saving || loadingLesson}>
            {saving ? "Saving..." : "Save Lesson"}
          </Button>
          <Button variant="outline" onClick={() => router.push(`/manage/teacher/classes?classId=${classId}`)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
