"use client";

import React, { useState, useEffect, useContext } from 'react';
import { AlertTriangle, ArrowRight, UserCheck, X } from 'lucide-react';
import Link from 'next/link';
import DataContext from '@/context/DataContext';
import { useLanguage } from '@/context/LanguageContext';
import { fetchNotifications } from '@/lib/notification-service';

export default function ProfileCompletionBanner() {
    const { authenticated, user } = useContext(DataContext);
    const { t } = useLanguage();
    const [isIncomplete, setIsIncomplete] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const userEmail = user?.email || "";

    useEffect(() => {
        if (!authenticated || !userEmail) return;
        fetchNotifications().then(data => {
            if (data?.isProfileIncomplete) {
                setIsIncomplete(true);
            }
        });
    }, [authenticated, userEmail]);

    if (!isIncomplete || dismissed) return null;

    return (
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-teal-500/10 border border-amber-500/20 text-slate-900 dark:text-slate-100 shadow-sm transition-all animate-in slide-in-from-top-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 shadow-md">
                        <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-amber-900 dark:text-amber-200">
                            {t("shell.profileBanner.title")}
                        </h4>
                        <p className="text-[11px] sm:text-xs font-medium text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                            {t("shell.profileBanner.body")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Link
                        href="/account"
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md transition-all"
                    >
                        {t("shell.notifications.completeProfile")}
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    <button
                        onClick={() => setDismissed(true)}
                        className="p-1.5 text-amber-800/60 hover:text-amber-900 dark:text-amber-400 rounded-lg transition-colors"
                        title={t("shell.profileBanner.dismiss")}
                        aria-label={t("shell.profileBanner.dismiss")}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
