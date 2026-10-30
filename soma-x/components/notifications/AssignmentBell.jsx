"use client";

import { useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import Link from "next/link";
import { ClipboardList, AlertTriangle } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { formatDate } from "@/components/helpers/localeDate";
import Loader from "@/components/ui/Loader";

export default function AssignmentBell({ className = "" }) {
    const { authenticated } = useContext(DataContext);
    const { t, lang } = useLanguage();
    const [open, setOpen] = useState(false);
    // Kept until the box says a course changed (new or changed work: live updates) or the
    // learner hands something in.
    const summary = useQuery({
        queryKey: queryKeys.assignmentSummary,
        queryFn: () => apiFetch("/users/me/assignment-summary"),
        enabled: authenticated,
    });
    const outstanding = summary.data?.outstanding || [];
    const outstandingCount = summary.data?.outstanding_count || 0;
    const loading = summary.isFetching;

    const formatDue = (dueAt) => {
        if (!dueAt) return t("shell.assignments.noDueDate");
        return formatDate(dueAt, lang, { month: "short", day: "numeric" });
    };

    return (
        <div className={`relative inline-block ${className}`}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="relative p-2.5 rounded-full transition-all duration-200 cursor-pointer bg-surface-raised hover:bg-surface-hover text-fg-muted border border-line shadow-sm"
                aria-label={t("shell.assignments.outstandingLabel")}
            >
                <ClipboardList className="w-4 h-4" />
                {outstandingCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-caption font-extrabold text-on-warning shadow-lg ring-2 ring-surface">
                        {outstandingCount > 9 ? "9+" : outstandingCount}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-[9990]" onClick={() => setOpen(false)} />
                    <div
                        className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl shadow-2xl border border-line bg-surface-raised z-[9991] flex flex-col max-h-[70vh]"
                    >
                        <div className="p-3.5 border-b border-line flex items-center justify-between">
                            <h3 className="font-extrabold text-ui text-fg">{t("shell.assignments.title")}</h3>
                            <span className="text-caption font-semibold text-fg-subtle">
                                {fill(t("shell.assignments.outstandingCount"), { n: outstandingCount })}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-line">
                            {loading && outstanding.length === 0 ? (
                                <Loader variant="page" size={48} className="min-h-[12rem]" />
                            ) : outstanding.length === 0 ? (
                                <div className="p-8 text-center space-y-2">
                                    <div className="w-10 h-10 mx-auto rounded-full bg-surface-sunken flex items-center justify-center text-fg-muted">
                                        <ClipboardList className="w-5 h-5 opacity-50" />
                                    </div>
                                    <p className="text-caption font-semibold text-fg-subtle">{t("shell.assignments.caughtUp")}</p>
                                </div>
                            ) : (
                                outstanding.map((a) => (
                                    <Link
                                        key={a.assignment_id}
                                        href={`/course/${a.course_id}/assignments/${a.assignment_id}`}
                                        onClick={() => setOpen(false)}
                                        className="block p-3.5 transition-colors hover:bg-surface-hover"
                                    >
                                        <div className="flex items-start gap-2.5">
                                            {a.overdue ? (
                                                <AlertTriangle className="w-4 h-4 text-danger-fg shrink-0 mt-0.5" />
                                            ) : (
                                                <ClipboardList className="w-4 h-4 text-fg-subtle shrink-0 mt-0.5" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-caption font-bold truncate text-fg">{a.title}</p>
                                                <p className="text-caption truncate text-fg-subtle">{a.course_title}</p>
                                                <p className={`text-caption font-semibold mt-1 ${a.overdue ? "text-danger-fg" : "text-fg-subtle"}`}>
                                                    {fill(t(a.overdue ? "shell.assignments.overdueWasDue" : "shell.assignments.due"), { date: formatDue(a.due_at) })}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>

                        <div className="p-2.5 border-t border-line">
                            <Link
                                href="/manage/scholar-dashboard/courses"
                                onClick={() => setOpen(false)}
                                className="block text-center text-caption font-bold text-brand-fg hover:text-brand-fg py-1.5"
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
