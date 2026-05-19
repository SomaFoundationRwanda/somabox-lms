"use client"; 

import { createContext, useContext, useState } from "react";
import { languages } from "@/i18n";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [lang, setLang] = useState("en");

    const t = (keyPath) => {
        return keyPath.split(".").reduce((obj, key) => obj?.[key], languages[lang]) || null;
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}
