"use client";

// The school this box serves, as everyone sees it (GET /school/public, no login): its name,
// logo, colours and whether visitors may preview Explore and Library items. Loaded once for the
// whole app (guests too); the admin's School page calls refreshSchool() after saving so every
// screen updates at once. The colours are set as CSS variables on <html>:
// --brand-primary and --brand-secondary, plus readable text colours worked out from them
// (lib/brandColors.js; app/globals.css has the defaults).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { brandVariables } from "@/lib/brandColors";

export const DEFAULT_PRIMARY = "#203A3A";
export const DEFAULT_SECONDARY = "#0F766E";
const HEX = /^#[0-9a-f]{6}$/i;
const CACHE_KEY = "schoolPublic";

export const DEFAULT_SCHOOL = {
    name: "",
    code: "",
    logoUrl: null,
    primaryColor: DEFAULT_PRIMARY,
    secondaryColor: DEFAULT_SECONDARY,
    configured: false,
    guestPreview: { enabled: false, seconds: 40, items: 5 },
};

export const isHexColor = (value) => HEX.test(String(value || ""));

function normalise(data) {
    const preview = data?.guestPreview || {};
    return {
        name: String(data?.name || ""),
        code: String(data?.code || ""),
        logoUrl: data?.logoUrl ? String(data.logoUrl) : null,
        primaryColor: isHexColor(data?.primaryColor) ? data.primaryColor : DEFAULT_PRIMARY,
        secondaryColor: isHexColor(data?.secondaryColor) ? data.secondaryColor : DEFAULT_SECONDARY,
        configured: Boolean(data?.configured),
        guestPreview: {
            enabled: Boolean(preview.enabled),
            seconds: Number(preview.seconds) > 0 ? Number(preview.seconds) : 40,
            items: Number(preview.items) > 0 ? Number(preview.items) : 5,
        },
    };
}

/** Sets the brand colours on <html> (the whole app reads them through CSS variables). */
export function applyBrandColors(primary, secondary) {
    if (typeof document === "undefined") return;
    const root = document.documentElement.style;
    const vars = brandVariables(isHexColor(primary) ? primary : DEFAULT_PRIMARY, isHexColor(secondary) ? secondary : DEFAULT_SECONDARY);
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value);
}

const SchoolContext = createContext({
    school: DEFAULT_SCHOOL,
    loaded: false,
    refreshSchool: async () => DEFAULT_SCHOOL,
    logoSrc: null,
});

const loadSchool = async () => normalise(await apiFetch("/school/public"));

export function SchoolBrandingProvider({ children }) {
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
    const queryClient = useQueryClient();
    // Kept until the admin changes it (live updates) or the app reloads.
    const query = useQuery({ queryKey: queryKeys.schoolPublic, queryFn: loadSchool });
    const [lastKnown, setLastKnown] = useState(DEFAULT_SCHOOL);

    // Show the last known look straight away (no SOMABOX flash on every page load); the
    // fresh copy from the box replaces it a moment later.
    useEffect(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) setLastKnown(normalise(JSON.parse(cached)));
        } catch {
            // storage unavailable or bad JSON: wait for the box
        }
    }, []);
    useEffect(() => {
        if (!query.data) return;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(query.data)); } catch { /* ignore */ }
    }, [query.data]);

    const school = query.data ?? lastKnown;
    const loaded = query.isFetched;

    const refreshSchool = useCallback(async () => {
        try {
            return await queryClient.fetchQuery({ queryKey: queryKeys.schoolPublic, queryFn: loadSchool, staleTime: 0 });
        } catch {
            return null; // offline: keep what we have
        }
    }, [queryClient]);

    useEffect(() => {
        applyBrandColors(school.primaryColor, school.secondaryColor);
    }, [school.primaryColor, school.secondaryColor]);

    const value = useMemo(() => ({
        school,
        loaded,
        refreshSchool,
        logoSrc: school.logoUrl && SERVER_URL ? `${SERVER_URL}${school.logoUrl}` : null,
    }), [school, loaded, refreshSchool, SERVER_URL]);

    return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

/** { school, loaded, refreshSchool(), logoSrc } — logoSrc is null when SOMABOX's logo is shown. */
export function useSchool() {
    return useContext(SchoolContext);
}
