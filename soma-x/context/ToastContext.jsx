"use client"
import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// The one place toasts are drawn (every screen calls showToast). Status colours follow the usual
// convention, whatever the school's colours: green done, red failed, amber warning, blue
// information, on a neutral surface with a stripe and an icon in that colour.
const STYLES = {
    success: { stripe: "border-l-green-600", Icon: CheckCircle2, icon: "text-green-600 dark:text-green-400", title: "shell.toasts.success" },
    error: { stripe: "border-l-red-600", Icon: XCircle, icon: "text-red-600 dark:text-red-400", title: "shell.toasts.failed" },
    warning: { stripe: "border-l-amber-500", Icon: AlertTriangle, icon: "text-amber-500 dark:text-amber-400", title: "shell.toasts.warning" },
    info: { stripe: "border-l-blue-600", Icon: Info, icon: "text-blue-600 dark:text-blue-400", title: "shell.toasts.notice" },
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
                            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border border-slate-200 border-l-4 bg-white text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 transition-all duration-300 animate-in slide-in-from-bottom-5 ${style.stripe}`}
                        >
                            <div className="shrink-0 mt-0.5">
                                <style.Icon className={`w-5 h-5 ${style.icon}`} aria-hidden="true" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold leading-tight">{t(style.title)}</p>
                                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-snug mt-0.5 break-words">
                                    {toast.message}
                                </p>
                            </div>

                            <button aria-label={t("shell.toasts.dismiss")}
                                onClick={() => removeToast(toast.id)}
                                className="shrink-0 p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
