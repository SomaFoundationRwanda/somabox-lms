"use client";

import { History } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

// A form's unsaved changes found on this device (lib/drafts.js useFormDraft): restore or drop.
export default function DraftBanner({ draft, onRestore, onDiscard }) {
  const { t, lang } = useLanguage();
  if (!draft) return null;
  let time = "";
  try { time = new Date(draft.at).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" }); } catch { time = ""; }
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-info/30 bg-info-soft px-3 py-2 text-caption text-info-fg">
      <History className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-[10rem] font-semibold">{fill(t("shell.draft.found"), { time })}</span>
      <button type="button" onClick={onRestore} className="font-bold underline">{t("shell.draft.restore")}</button>
      <button type="button" onClick={onDiscard} className="font-semibold text-fg-muted hover:underline">{t("shell.draft.discard")}</button>
    </div>
  );
}
