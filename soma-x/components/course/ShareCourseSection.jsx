"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Download, Loader2, X } from "lucide-react";
import { Section } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import { useCourseText } from "@/components/course/useCourseText";

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

export default function ShareCourseSection({ SERVER_URL, courseId }) {
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
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/bundle`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) throw new Error(payload?.message || t("share.exportFailed"));
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
      setError(err.message === "Failed to fetch" ? t("share.unreachable") : err.message || t("share.exportFailed"));
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">{t("share.included")}</h3>
            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
              {["outcomes", "weeks", "pages", "quizzes", "assignments", "discussions"].map((k) => (
                <li key={k} className="flex items-start gap-1.5"><Check className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-600" aria-hidden="true" />{t(`share.in.${k}`)}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-slate-700 dark:text-slate-200 mb-1">{t("share.notIncluded")}</h3>
            <ul className="space-y-1 text-slate-600 dark:text-slate-300">
              {["learners", "dates", "files", "unassigned"].map((k) => (
                <li key={k} className="flex items-start gap-1.5"><X className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400" aria-hidden="true" />{t(`share.out.${k}`)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportBundle}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] disabled:opacity-50 rounded-lg px-4 py-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
            {busy ? t("share.exporting") : t("share.export")}
          </button>
          <Link href="/library/courses" className="text-xs font-semibold text-[var(--brand-secondary)] hover:underline">{t("share.openLibrary")}</Link>
        </div>

        {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}

        {result ? (
          <div role="status" className="space-y-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {tf("share.exported", { n: result.version })}
              <span className="ml-2 text-xs font-normal text-slate-500 break-all">{result.filename}</span>
            </p>
            <p className="text-xs text-slate-500">
              {t("share.versionHelp")}
            </p>
            {result.warnings.length ? (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
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
