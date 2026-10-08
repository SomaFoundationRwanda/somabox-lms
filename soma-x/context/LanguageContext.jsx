"use client"; 

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { languages } from "@/i18n";

const LanguageContext = createContext();
const STORAGE_KEY = "lang";

const lookup = (lang, keyPath) => keyPath.split(".").reduce((obj, key) => obj?.[key], languages[lang]);

export function LanguageProvider({ children }) {
    const [lang, setLangState] = useState("en");

    // Remember the chosen language on this device (it used to reset to English on reload).
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && languages[saved]) setLangState(saved);
        } catch {
            // storage unavailable: stay in English
        }
    }, []);

    const setLang = useCallback((next) => {
        if (!languages[next]) return;
        setLangState(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    }, []);

    // Keep <html lang> in step with the chosen UI language (screen readers pick the voice
    // from it). The language codes are BCP 47 already ("rw" is Kinyarwanda).
    useEffect(() => {
        if (typeof document !== "undefined") document.documentElement.lang = lang;
    }, [lang]);

    // Missing translations fall back to English instead of showing nothing.
    const t = useCallback((keyPath) => lookup(lang, keyPath) ?? lookup("en", keyPath) ?? null, [lang]);

    // Explainer entry for a key under `explainers` (e.g. "items.quiz"), with whether it had to
    // fall back to English, so the UI can say so.
    const explain = useCallback((key) => {
        const own = lookup(lang, `explainers.${key}`);
        if (own) return { entry: own, isFallback: false };
        const english = lookup("en", `explainers.${key}`);
        return { entry: english || null, isFallback: !!english && lang !== "en" };
    }, [lang]);

    return (
        <LanguageContext.Provider value={{ lang, setLang, t, explain }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}
