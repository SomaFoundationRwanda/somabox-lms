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
    <Select
      icon={Globe}
      size="sm"
      value={lang}
      onChange={(e) => setLang(e.target.value)}
      aria-label="Language / Langue / Ururimi / Lugha / Idioma"
      options={Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ value: code, label: compact ? code.toUpperCase() : name }))}
      className={`w-auto ${className}`}
    />
  );
}
