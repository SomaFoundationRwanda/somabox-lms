"use client"
import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// The one place toasts are drawn (every screen calls showToast). Success and information use the
// school's colours (bg-accent-dark is --brand-primary, teal is rebuilt from --brand-secondary);
// errors stay red so they stand out whatever the school's colours are.
const STYLES = {
    success: { box: "bg-accent-dark/95 border-white/15", Icon: CheckCircle2, icon: "text-teal-300", title: "shell.toasts.success" },
    error: { box: "bg-rose-900/95 border-rose-700/80", Icon: XCircle, icon: "text-rose-300", title: "shell.toasts.failed" },
    info: { box: "bg-slate-900/95 border-white/15", Icon: Info, icon: "text-teal-300", title: "shell.toasts.notice" },
};

const ToastContext = createContext({
    showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const { t } = useLanguage();

    const showToast = useCallback((message, type = "success", duration = 4000) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    const removeToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container */}
            <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
                {toasts.map((toast) => {
                    const style = STYLES[toast.type] || STYLES.info;
                    return (
                        <div
                            key={toast.id}
                            role={toast.type === "error" ? "alert" : "status"}
                            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl shadow-xl border backdrop-blur-md text-white transition-all duration-300 animate-in slide-in-from-bottom-5 ${style.box}`}
                        >
                            <div className="shrink-0 mt-0.5">
                                <style.Icon className={`w-5 h-5 ${style.icon}`} aria-hidden="true" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold leading-tight">{t(style.title)}</p>
                                <p className="text-[11px] font-medium opacity-90 leading-snug mt-0.5 break-words">
                                    {toast.message}
                                </p>
                            </div>

                            <button aria-label={t("shell.toasts.dismiss")}
                                onClick={() => removeToast(toast.id)}
                                className="shrink-0 p-1 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}

export default ToastContext;
