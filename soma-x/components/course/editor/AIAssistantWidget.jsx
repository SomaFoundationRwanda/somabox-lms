"use client";

import { useState, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { Sparkles, ThumbsUp, ThumbsDown, Copy, Check, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useCourseText } from "@/components/course/useCourseText";
import { Label, Textarea } from "@/components/form";

// Labels and descriptions come from course.aiAssistant.modes.<id>.
const MODES = [
  { id: "lesson_plan" },
  { id: "quiz" },
  { id: "explain" },
  { id: "adapt" },
  { id: "rubric" },
];

export default function AIAssistantWidget({ courseId = "", lessonId = "", onInsertContent = null }) {
  const { role } = useContext(DataContext) || {};
  const { t } = useCourseText();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState("lesson_plan");
  const [question, setQuestion] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [showSourceBox, setShowSourceBox] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [responseId, setResponseId] = useState(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [pendingRating, setPendingRating] = useState(null);

  // Whether the assistant is up: asked once, kept until the app reloads.
  const health = useQuery({
    queryKey: ["ai", "health"],
    queryFn: () => apiFetch("/ai/health").then((data) => !!data?.available).catch(() => false),
  });
  const available = health.data ?? true;

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsGenerating(true);
    setOutput("");
    setErrorMessage("");
    setResponseId(null);
    setFeedbackSent(false);
    setShowCommentBox(false);

    try {
      let res;
      try {
        // The answer streams in: read from the response as it arrives.
        res = await apiFetch("/ai/ask", {
          method: "POST",
          json: { mode, question, source_text: sourceText, course_id: courseId, lesson_id: lessonId },
          responseType: "response",
        });
      } catch (err) {
        if (err instanceof ApiError && err.status !== 0) {
          setErrorMessage(err.body?.message || err.body?.error || t("aiAssistant.unavailable"));
          setIsGenerating(false);
          return;
        }
        throw err;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;

          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === "meta") {
                setResponseId(data.response_id);
                setDisclaimer(data.disclaimer);
              } else if (data.type === "token") {
                setOutput((prev) => prev + data.content);
              } else if (data.type === "error") {
                setErrorMessage(data.error);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      console.error("AI Generation error:", err);
      setErrorMessage(t("aiAssistant.connectionFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = async (rating) => {
    if (!responseId) return;
    setPendingRating(rating);

    try {
      await apiFetch("/ai/feedback", {
        method: "POST",
        json: { response_id: responseId, rating, comment: feedbackComment, mode },
      });
      setFeedbackSent(true);
      setShowCommentBox(false);
    } catch (err) {
      console.error("Feedback error:", err);
    }
  };

  const [inserted, setInserted] = useState(false);

  const handleAcceptAndInsert = () => {
    if (!output || !onInsertContent) return;
    onInsertContent(output);
    setInserted(true);
    setTimeout(() => setInserted(false), 3500);
  };

  return (
    <div className="my-3 border border-brand/40 bg-brand-soft/50 rounded-xl overflow-hidden shadow-sm">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-surface hover:bg-brand-soft/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand text-on-brand rounded-lg">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-ui text-fg">SOMABOX AI</span>
            <span className="ml-2 text-caption text-brand-fg bg-brand-soft px-2 py-0.5 rounded-full font-medium">{t("aiAssistant.offlinePilot")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-caption text-fg-subtle">
          {!available && <span className="text-warning-fg font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {t("aiAssistant.serviceUnavailable")}</span>}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Widget Body */}
      {isOpen && (
        <div className="p-4 border-t border-brand/40 space-y-4 bg-surface">
          {!available ? (
            <div className="p-3 bg-warning-soft border border-warning/30 rounded-lg text-caption text-warning-fg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-warning-fg" />
              <span>{t("aiAssistant.offlineHelp")}</span>
            </div>
          ) : (
            <form onSubmit={handleGenerate} className="space-y-3">
              {/* Mode Selection */}
              <div>
                <Label>{t("aiAssistant.selectMode")}</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`px-2.5 py-1.5 text-caption rounded-lg border font-medium text-left transition-all ${
                        mode === m.id
                          ? "bg-brand text-on-brand border-brand shadow-sm"
                          : "bg-surface-sunken text-fg-muted border-line hover:bg-surface-hover"
                      }`}
                    >
                      {t(`aiAssistant.modes.${m.id}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Request Prompt */}
              <div>
                <Label>{t("aiAssistant.instructions")}</Label>
                <Textarea size="sm" aria-label={t("aiAssistant.instructions")} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("aiAssistant.instructionsPlaceholder")} className="w-full" />
              </div>

              {/* Optional Pasted Source Text Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowSourceBox(!showSourceBox)}
                  className="text-caption text-brand-fg hover:underline font-medium flex items-center gap-1"
                >
                  {showSourceBox ? `- ${t("aiAssistant.hideSource")}` : `+ ${t("aiAssistant.addSource")}`}
                </button>
                {showSourceBox && (
                  <Textarea size="sm" aria-label={t("aiAssistant.sourcePlaceholder")} rows={3} value={sourceText} onChange={(e) => setSourceText(e.target.value)} placeholder={t("aiAssistant.sourcePlaceholder")} className="w-full mt-1" />
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isGenerating || !question.trim()}
                className="w-full py-2 px-4 bg-brand hover:bg-brand/90 disabled:opacity-50 text-on-brand font-semibold text-caption rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t("aiAssistant.generating")}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t("aiAssistant.generate")}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-danger-soft border border-danger/30 rounded-lg text-caption text-danger-fg">
              {errorMessage}
            </div>
          )}

          {/* Output Display Area */}
          {(output || isGenerating) && (
            <div className="space-y-2 border-t border-line pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-caption font-semibold text-fg-muted flex items-center gap-1.5">
                  <span>{t("aiAssistant.output")}</span>
                  {disclaimer && <span className="text-caption text-warning-fg bg-warning-soft px-1.5 py-0.5 rounded">{disclaimer}</span>}
                </span>

                <div className="flex items-center gap-2">
                  {onInsertContent && (
                    <button
                      type="button"
                      onClick={handleAcceptAndInsert}
                      disabled={isGenerating || !output}
                      className="px-3 py-1.5 bg-brand hover:bg-brand/90 disabled:opacity-50 text-on-brand text-caption rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      {inserted ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{t("aiAssistant.inserted")}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>{t("aiAssistant.insert")}</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-2.5 py-1.5 bg-surface-sunken hover:bg-surface-hover text-fg-muted text-caption rounded-lg flex items-center gap-1 transition-colors font-medium"
                  >
                    {copied ? <Check className="w-3 h-3 text-success-fg" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? t("aiAssistant.copied") : t("aiAssistant.copy")}</span>
                  </button>
                </div>
              </div>

              {/* Output Content */}
              <div className="p-3 bg-surface-sunken border border-line rounded-lg text-caption text-fg whitespace-pre-wrap font-sans max-h-80 overflow-y-auto leading-relaxed">
                {output}
                {isGenerating && <span className="inline-block w-2 h-3 bg-brand ml-1 animate-pulse" />}
              </div>

              {/* Feedback Bar */}
              {output && !isGenerating && (
                <div className="flex items-center justify-between pt-2 border-t border-line text-caption text-fg-subtle">
                  <span>{t("aiAssistant.helpfulQuestion")}</span>
                  {feedbackSent ? (
                    <span className="text-success-fg font-medium">{t("aiAssistant.thanks")}</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleFeedback(1)}
                        className="p-1 hover:bg-success-soft hover:text-success-fg rounded border border-line"
                        title={t("aiAssistant.helpful")}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(-1)}
                        className="p-1 hover:bg-danger-soft hover:text-danger-fg rounded border border-line"
                        title={t("aiAssistant.notHelpful")}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
