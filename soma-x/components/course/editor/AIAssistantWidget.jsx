"use client";

import { useState, useEffect, useContext } from "react";
import { Sparkles, ThumbsUp, ThumbsDown, Copy, Check, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useCourseText } from "@/components/course/useCourseText";

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
  const [available, setAvailable] = useState(true);

  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [pendingRating, setPendingRating] = useState(null);

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

  // Check health on mount
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${SERVER_URL}/ai/health`);
        if (res.ok) {
          const data = await res.json();
          setAvailable(data.available);
        } else {
          setAvailable(false);
        }
      } catch {
        setAvailable(false);
      }
    }
    checkHealth();
  }, [SERVER_URL]);

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
      const res = await fetch(`${SERVER_URL}/ai/ask`, {
        method: "POST",
        // Identity comes from the session token added by the fetch wrapper.
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          question,
          source_text: sourceText,
          course_id: courseId,
          lesson_id: lessonId
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorMessage(errJson.message || errJson.error || t("aiAssistant.unavailable"));
        setIsGenerating(false);
        return;
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
      await fetch(`${SERVER_URL}/ai/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_id: responseId,
          rating,
          comment: feedbackComment,
          mode
        })
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
    <div className="my-3 border border-teal-200 bg-teal-50/50 rounded-xl overflow-hidden shadow-sm">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-teal-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-teal-600 text-white rounded-lg">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-sm text-slate-800">SOMABOX AI</span>
            <span className="ml-2 text-xs text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full font-medium">{t("aiAssistant.offlinePilot")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {!available && <span className="text-amber-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {t("aiAssistant.serviceUnavailable")}</span>}
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Widget Body */}
      {isOpen && (
        <div className="p-4 border-t border-teal-100 space-y-4 bg-white">
          {!available ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{t("aiAssistant.offlineHelp")}</span>
            </div>
          ) : (
            <form onSubmit={handleGenerate} className="space-y-3">
              {/* Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t("aiAssistant.selectMode")}</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border font-medium text-left transition-all ${
                        mode === m.id
                          ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {t(`aiAssistant.modes.${m.id}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Request Prompt */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t("aiAssistant.instructions")}</label>
                <textarea aria-label={t("aiAssistant.instructions")}
                  rows={2}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t("aiAssistant.instructionsPlaceholder")}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                />
              </div>

              {/* Optional Pasted Source Text Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowSourceBox(!showSourceBox)}
                  className="text-xs text-teal-700 hover:underline font-medium flex items-center gap-1"
                >
                  {showSourceBox ? `- ${t("aiAssistant.hideSource")}` : `+ ${t("aiAssistant.addSource")}`}
                </button>
                {showSourceBox && (
                  <textarea aria-label={t("aiAssistant.sourcePlaceholder")}
                    rows={3}
                    value={sourceText}
                    onChange={(e) => setSourceText(e.target.value)}
                    placeholder={t("aiAssistant.sourcePlaceholder")}
                    className="w-full mt-1 px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-teal-500"
                  />
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isGenerating || !question.trim()}
                className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
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
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {errorMessage}
            </div>
          )}

          {/* Output Display Area */}
          {(output || isGenerating) && (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span>{t("aiAssistant.output")}</span>
                  {disclaimer && <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{disclaimer}</span>}
                </span>

                <div className="flex items-center gap-2">
                  {onInsertContent && (
                    <button
                      type="button"
                      onClick={handleAcceptAndInsert}
                      disabled={isGenerating || !output}
                      className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      {inserted ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-200" />
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
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg flex items-center gap-1 transition-colors font-medium"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? t("aiAssistant.copied") : t("aiAssistant.copy")}</span>
                  </button>
                </div>
              </div>

              {/* Output Content */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 whitespace-pre-wrap font-sans max-h-80 overflow-y-auto leading-relaxed">
                {output}
                {isGenerating && <span className="inline-block w-2 h-3 bg-teal-600 ml-1 animate-pulse" />}
              </div>

              {/* Feedback Bar */}
              {output && !isGenerating && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <span>{t("aiAssistant.helpfulQuestion")}</span>
                  {feedbackSent ? (
                    <span className="text-emerald-600 font-medium">{t("aiAssistant.thanks")}</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleFeedback(1)}
                        className="p-1 hover:bg-emerald-50 hover:text-emerald-600 rounded border border-slate-200"
                        title={t("aiAssistant.helpful")}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(-1)}
                        className="p-1 hover:bg-rose-50 hover:text-rose-600 rounded border border-slate-200"
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
