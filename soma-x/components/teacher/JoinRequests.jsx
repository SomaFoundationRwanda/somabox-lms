"use client";

// Learners who joined with the course's code and wait for the teacher (a code can reach pupils
// outside the class): approve puts them in the course and its class, decline drops the request.
import { useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/api";
import { useCourseText } from "@/components/course/useCourseText";

export default function JoinRequests({ courseId, people, onChanged }) {
  const { t, tf } = useCourseText();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(null);
  const pending = (Array.isArray(people) ? people : []).filter((p) => p.status === "pending");
  if (!pending.length) return null;

  const answer = async (person, approve) => {
    setBusy(person.id);
    try {
      await apiFetch(`/courses/${courseId}/people/${person.id}/request`, { method: "POST", json: { approve } });
      showToast(approve ? tf("joinRequests.approved", { name: person.fullName || "" }) : t("joinRequests.declined"), "success");
      onChanged?.();
    } catch {
      showToast(t("joinRequests.failed"), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="join-requests-title" className="rounded-xl border border-warning/30 bg-warning-soft/60 p-4 space-y-3">
      <div>
        <h2 id="join-requests-title" className="text-ui font-bold text-fg flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-warning-fg" aria-hidden="true" /> {tf("joinRequests.title", { n: pending.length })}
        </h2>
        <p className="text-caption text-fg-muted">{t("joinRequests.help")}</p>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {pending.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-ui font-semibold text-fg truncate">{p.fullName || p.email || p.learnerCode}</span>
              <span className="block text-caption text-fg-subtle">{[p.learnerCode, p.className].filter(Boolean).join(" · ")}</span>
            </span>
            <button type="button" onClick={() => answer(p, true)} disabled={busy === p.id} className="inline-flex items-center gap-1 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 rounded-lg px-3 py-1.5 disabled:opacity-50">
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> {t("joinRequests.approve")}
            </button>
            <button type="button" onClick={() => answer(p, false)} disabled={busy === p.id} className="inline-flex items-center gap-1 text-caption font-semibold text-fg-muted border border-line hover:bg-surface-hover rounded-lg px-3 py-1.5 disabled:opacity-50">
              <X className="w-3.5 h-3.5" aria-hidden="true" /> {t("joinRequests.decline")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
