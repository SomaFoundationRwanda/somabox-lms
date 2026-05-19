"use client"
import { createContext, useEffect, useState, useCallback } from "react";

const DataContext = createContext();

export default DataContext

// Helper functions for basic obfuscation
const shiftString = (str) => {
    if (!str) return '';
    return str.split('').map(ch => {
        if (/[a-z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 97 + 1) % 26 + 97);
        } else if (/[A-Z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 65 + 1) % 26 + 65);
        }
        return ch;
    }).join('');
}

const unshiftString = (str) => {
    if (!str) return '';
    return str.split('').map(ch => {
        if (/[a-z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 97 + 25) % 26 + 97);
        } else if (/[A-Z]/.test(ch)) {
            return String.fromCharCode((ch.charCodeAt(0) - 65 + 25) % 26 + 65);
        }
        return ch;
    }).join('');
}

export function DataProvider({ children }) {
    const [summaryData, setSummaryData] = useState(null);
    const [mainCategories, setMainCategories] = useState(null);
    const [customContentSummary, setCustomContentSummary] = useState(null);
    const [role, setRole] = useState("");
    const [authenticated, setAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [isDark, setIsDark] = useState(false);
    // Guards against hydration mismatch (#418): components using isDark/
    // authenticated won't render browser-specific content until after mount.
    const [mounted, setMounted] = useState(false);

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    // Fetch shared content data on mount
    useEffect(() => {
        const loadAllData = async () => {
            try {
                const summaryRes = await fetch(`${SERVER_URL}/content/levels/summary`);
                if (summaryRes.ok) setSummaryData(await summaryRes.json());

                const categoriesRes = await fetch(`${SERVER_URL}/content/main-categories`);
                if (categoriesRes.ok) setMainCategories(await categoriesRes.json());

                const customSummaryRes = await fetch(`${SERVER_URL}/content/custom-content/summary`);
                if (customSummaryRes.ok) setCustomContentSummary(await customSummaryRes.json());
            } catch (error) {
                console.error("Data fetching error:", error);
            }
        };

        loadAllData();
    }, [SERVER_URL]);

    // Auth + theme — runs only on the client after mount
    useEffect(() => {
        const storedAl = localStorage.getItem('al');
        const storedGh = localStorage.getItem('gh');

        if (storedAl && storedGh) {
            try {
                const decryptedRole = unshiftString(storedGh);
                const allowedRoles = ['admin', 'teacher', 'scholar'];
                if (allowedRoles.includes(decryptedRole)) {
                    setRole(storedGh);
                    setAuthenticated(true);
                }
            } catch {
                // invalid stored value — stay unauthenticated
            }
        }

        setAuthLoading(false);

        // Apply dark mode from localStorage
        const stored = localStorage.getItem('theme');
        const dark = stored === 'dark';
        setIsDark(dark);
        document.documentElement.classList.toggle('dark', dark);

        // Signal that client has fully mounted — safe to use isDark / authenticated
        setMounted(true);
    }, []);

    const toggleDark = useCallback((val) => {
        setIsDark(val);
        document.documentElement.classList.toggle('dark', val);
        localStorage.setItem('theme', val ? 'dark' : 'light');
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('al');
        localStorage.removeItem('gh');
        setAuthenticated(false);
        setRole("");
        window.location.href = '/';
    }, []);

    const contextData = {
        summaryData,
        setSummaryData,
        mainCategories,
        setMainCategories,
        customContentSummary,
        setCustomContentSummary,
        authenticated,
        setAuthenticated,
        authLoading,
        isDark,
        toggleDark,
        role,
        setRole,
        shiftString,
        unshiftString,
        logout,
        SERVER_URL,
        mounted,
    };

    return (
        <DataContext.Provider value={contextData}>
            {children}
        </DataContext.Provider>
    );
}
