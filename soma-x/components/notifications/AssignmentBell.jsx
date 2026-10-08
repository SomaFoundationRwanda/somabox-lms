"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, AlertTriangle } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { formatDate } from "@/components/helpers/localeDate";
import Loader from "@/components/ui/Loader";

export default function AssignmentBell({ className = "" }) {
    const { authenticated, isDark, SERVER_URL, user } = useContext(DataContext);
    const { t, lang } = useLanguage();
    const [open, setOpen] = useState(false);
    const [outstanding, setOutstanding] = useState([]);
    const [outstandingCount, setOutstandingCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const userEmail = user?.email || "";

    const load = useCallback(async () => {
        if (!userEmail || !SERVER_URL) return;
        try {
            setLoading(true);
            const res = await fetch(`${SERVER_URL}/users/me/assignment-summary`);
            if (!res.ok) return;
            const data = await res.json();
            setOutstanding(data.outstanding || []);
            setOutstandingCount(data.outstanding_count || 0);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, [userEmail, SERVER_URL]);

    useEffect(() => {
        if (authenticated && userEmail) {
            load();
            const timer = setInterval(load, 30000);
            return () => clearInterval(timer);
        }
    }, [authenticated, userEmail, load]);

    const formatDue = (dueAt) => {
        if (!dueAt) return t("shell.assignments.noDueDate");
        return formatDate(dueAt, lang, { month: "short", day: "numeric" });
    };

    const dm = isDark;
    const popoverBg = dm ? "#0F172A" : "#FFFFFF";
    const borderCol = dm ? "rgba(255,255,255,0.1)" : "#E2E8F0";
    const titleCol = dm ? "#F8FAFC" : "#0F172A";
    const textMuted = dm ? "#94A3B8" : "#64748B";

    return (
        <div className={`relative inline-block ${className}`}>
            <button
                onClick={() => setOpen((v) => !v)}
                className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${dm ? "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60"
                        : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm"
                    }`}
                aria-label={t("shell.assignments.outstandingLabel")}
            >
                <ClipboardList className="w-4 h-4" />
                {outstandingCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-white shadow-lg ring-2 ring-white">
                        {outstandingCount > 9 ? "9+" : outstandingCount}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
                    <div
                        className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl shadow-2xl border z-[9991] flex flex-col max-h-[70vh]"
                        style={{ backgroundColor: popoverBg, borderColor: borderCol }}
                    >
                        <div className="p-3.5 border-b flex items-center justify-between" style={{ borderColor: borderCol }}>
                            <h3 className="font-extrabold text-sm" style={{ color: titleCol }}>{t("shell.assignments.title")}</h3>
                            <span className="text-[11px] font-semibold" style={{ color: textMuted }}>
                                {fill(t("shell.assignments.outstandingCount"), { n: outstandingCount })}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: borderCol }}>
                            {loading && outstanding.length === 0 ? (
                                <Loader variant="page" size={48} className="min-h-[12rem]" />
                            ) : outstanding.length === 0 ? (
                                <div className="p-8 text-center space-y-2">
                                    <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600">
                                        <ClipboardList className="w-5 h-5 opacity-50" />
                                    </div>
                                    <p className="text-xs font-semibold" style={{ color: textMuted }}>{t("shell.assignments.caughtUp")}</p>
                                </div>
                            ) : (
                                outstanding.map((a) => (
                                    <Link
                                        key={a.assignment_id}
                                        href={`/course/${a.course_id}/assignments/${a.assignment_id}`}
                                        onClick={() => setOpen(false)}
                                        className="block p-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            {a.overdue ? (
                                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                            ) : (
                                                <ClipboardList className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold truncate" style={{ color: titleCol }}>{a.title}</p>
                                                <p className="text-[11px] truncate" style={{ color: textMuted }}>{a.course_title}</p>
                                                <p className={`text-[10px] font-semibold mt-1 ${a.overdue ? "text-rose-600" : ""}`} style={a.overdue ? {} : { color: textMuted }}>
                                                    {fill(t(a.overdue ? "shell.assignments.overdueWasDue" : "shell.assignments.due"), { date: formatDue(a.due_at) })}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>

                        <div className="p-2.5 border-t" style={{ borderColor: borderCol }}>
                            <Link
                                href="/manage/scholar-dashboard/courses"
                                onClick={() => setOpen(false)}
                                className="block text-center text-[11px] font-bold text-teal-600 hover:text-teal-700 py-1.5"
                            >
                                {t("shell.assignments.viewAll")}
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
