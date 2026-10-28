"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Download, Loader2, X } from "lucide-react";
import { Section } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import { useCourseText } from "@/components/course/useCourseText";
import { apiFetch } from "@/lib/api";

// Settings > Share (teachers): export the course as a bundle file another teacher or school
// can import as a new draft course.

const slug = (title) => String(title || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "course";

function filenameFrom(res, bundle) {
  const header = res.headers.get("Content-Disposition") || "";
  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (match) {
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }
  return `${slug(bundle?.course?.title)}-v${bundle?.version ?? 1}.somabox.json`;
}

export default function ShareCourseSection({ courseId }) {
  const { showToast } = useToast();
  const { t, tf } = useCourseText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { version, warnings, filename }

  const exportBundle = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      // The whole response: the file name comes from its headers.
      const res = await apiFetch(`/courses/${courseId}/bundle`, { responseType: "response" })
        .catch((err) => { throw new Error(err?.status === 0 ? t("share.unreachable") : err?.body?.message || t("share.exportFailed")); });
      const payload = await res.json().catch(() => null);
      if (!payload) throw new Error(t("share.exportFailed"));
      const filename = filenameFrom(res, payload);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setResult({ version: payload.version, warnings: Array.isArray(payload.warnings) ? payload.warnings : [], filename });
      showToast(tf("share.exported", { n: payload.version }), "success");
    } catch (err) {
      setError(err.message || t("share.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title={t("share.title")}
      description={t("share.description")}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-caption">
          <div>
            <h3 className="font-bold text-fg-muted mb-1">{t("share.included")}</h3>
            <ul className="space-y-1 text-fg-muted">
              {["outcomes", "weeks", "pages", "quizzes", "assignments", "discussions"].map((k) => (
                <li key={k} className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 mt-px shrink-0 text-success-fg" aria-hidden="true" />{t(`share.in.${k}`)}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-fg-muted mb-1">{t("share.notIncluded")}</h3>
            <ul className="space-y-1 text-fg-muted">
              {["learners", "dates", "files", "unassigned"].map((k) => (
                <li key={k} className="flex items-start gap-1.5"><X className="w-3.5 h-3.5 mt-px shrink-0 text-fg-subtle" aria-hidden="true" />{t(`share.out.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportBundle}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg px-4 py-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
            {busy ? t("share.exporting") : t("share.export")}
          </button>
          <Link href="/library/courses" className="text-caption font-semibold text-brand-fg hover:underline">{t("share.openLibrary")}</Link>
        </div>

        {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}

        {result ? (
          <div role="status" className="space-y-2">
            <p className="text-ui font-semibold text-fg">
              {tf("share.exported", { n: result.version })}
              <span className="ml-2 text-caption font-normal text-fg-subtle break-all">{result.filename}</span>
            </p>
            <p className="text-caption text-fg-subtle">
              {t("share.versionHelp")}
            </p>
            {result.warnings.length ? (
              <ul className="space-y-1 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-caption text-warning-fg">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
