"use client"
import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// The one place toasts are drawn (every screen calls showToast). Status colours follow the usual
// convention, whatever the school's colours: green done, red failed, amber warning, blue
// information, on a neutral surface with a stripe and an icon in that colour.
const STYLES = {
    success: { stripe: "border-l-success", Icon: CheckCircle2, icon: "text-success-fg", title: "shell.toasts.success" },
    error: { stripe: "border-l-danger", Icon: XCircle, icon: "text-danger-fg", title: "shell.toasts.failed" },
    warning: { stripe: "border-l-warning", Icon: AlertTriangle, icon: "text-warning-fg", title: "shell.toasts.warning" },
    info: { stripe: "border-l-info", Icon: Info, icon: "text-info-fg", title: "shell.toasts.notice" },
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
                            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border border-line border-l-4 bg-surface text-fg transition-all duration-300 animate-in slide-in-from-bottom-5 ${style.stripe}`}
                        >
                            <div className="shrink-0 mt-0.5">
                                <style.Icon className={`w-5 h-5 ${style.icon}`} aria-hidden="true" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-caption font-bold leading-tight">{t(style.title)}</p>
                                <p className="text-caption font-medium text-fg-muted leading-snug mt-0.5 break-words">
                                    {toast.message}
                                </p>
                            </div>

                            <button aria-label={t("shell.toasts.dismiss")}
                                onClick={() => removeToast(toast.id)}
                                className="shrink-0 p-1 text-fg-subtle hover:text-fg rounded-lg hover:bg-surface-hover transition-colors"
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
