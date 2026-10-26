"use client";

import { Globe } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Select } from "@/components/form";

// Each language in its own name, so people can find theirs whatever is showing now.
export const LANGUAGE_NAMES = {
  en: "English",
  fr: "Français",
  rw: "Kinyarwanda",
  sw: "Kiswahili",
  es: "Español",
};

/**
 * The language picker shown on every screen (signed in, guest, login, sign-up, teacher and admin
 * areas). `compact` shows just the code (EN, FR…) for tight headers; the full name is still read
 * out by screen readers.
 */
export default function LanguageSwitcher({ compact = false, className = "" }) {
  const { lang, setLang } = useLanguage();
  return (
    <label className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-2 min-h-[36px] text-sm text-slate-700 dark:text-slate-200 ${className}`}>
      <Globe className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
      <span className="sr-only">Language</span>
      <Select
        variant="ghost"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label="Language / Langue / Ururimi / Lugha / Idioma"
        options={Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ value: code, label: compact ? code.toUpperCase() : name }))}
      />
    </label>
  );
}
