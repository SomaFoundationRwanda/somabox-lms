"use client"
import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";

const ToastContext = createContext({
    showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

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
                    const isSuccess = toast.type === "success";
                    const isError = toast.type === "error";

                    return (
                        <div
                            key={toast.id}
                            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-5 ${
                                isSuccess
                                    ? "bg-emerald-900/95 border-emerald-700/80 text-white"
                                    : isError
                                    ? "bg-rose-900/95 border-rose-700/80 text-white"
                                    : "bg-slate-900/95 border-slate-700/80 text-white"
                            }`}
                        >
                            <div className="shrink-0 mt-0.5">
                                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                                {isError && <XCircle className="w-5 h-5 text-rose-400" />}
                                {!isSuccess && !isError && <Info className="w-5 h-5 text-teal-400" />}
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold leading-tight">
                                    {isSuccess ? "Success" : isError ? "Action Failed" : "Notification"}
                                </p>
                                <p className="text-[11px] font-medium opacity-90 leading-snug mt-0.5 break-words">
                                    {toast.message}
                                </p>
                            </div>

                            <button
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
