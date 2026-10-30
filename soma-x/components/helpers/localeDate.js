// Dates and numbers in the chosen UI language. Intl may not know Kinyarwanda ("rw") on every
// device, so it falls back to en-RW, then plain English.
const CANDIDATES = { rw: ["rw", "en-RW", "en"] };

export function uiLocale(lang) {
  const list = CANDIDATES[lang] || [lang || "en", "en"];
  for (const code of list) {
    try {
      if (Intl.DateTimeFormat.supportedLocalesOf([code]).length) return code;
    } catch {
      // invalid code: try the next one
    }
  }
  return "en";
}

/** toLocaleDateString in the UI language (never throws). */
export function formatDate(value, lang, options) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString(uiLocale(lang), options);
  } catch {
    return d.toLocaleDateString("en", options);
  }
}

/** toLocaleString (date and time) in the UI language (never throws). */
export function formatDateTime(value, lang, options) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString(uiLocale(lang), options);
  } catch {
    return d.toLocaleString("en", options);
  }
}
