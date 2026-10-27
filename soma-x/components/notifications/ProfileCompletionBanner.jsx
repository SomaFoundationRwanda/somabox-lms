"use client";

import React, { useState, useContext } from 'react';
import { AlertTriangle, ArrowRight, UserCheck, X } from 'lucide-react';
import Link from 'next/link';
import DataContext from '@/context/DataContext';
import { useLanguage } from '@/context/LanguageContext';
import { useNotifications } from '@/lib/notification-service';
import { accountPage } from '@/lib/session';

export default function ProfileCompletionBanner() {
    const { user } = useContext(DataContext);
    const { t } = useLanguage();
    // The same kept copy as the notification bell: no request of its own.
    const { isProfileIncomplete: isIncomplete } = useNotifications();
    const [dismissed, setDismissed] = useState(false);

    if (!isIncomplete || dismissed) return null;

    return (
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-warning/10 via-warning/5 to-brand/10 border border-warning/20 text-fg shadow-sm transition-all animate-in slide-in-from-top-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-3">
                    <div className="p-2 rounded-xl bg-warning text-on-warning shrink-0 shadow-md">
                        <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-caption sm:text-ui font-extrabold text-warning-fg">
                            {t("shell.profileBanner.title")}
                        </h4>
                        <p className="text-caption sm:text-caption font-medium text-warning-fg/80 mt-0.5">
                            {t("shell.profileBanner.body")}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <Link
                        href={accountPage(user?.role)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-warning hover:bg-warning text-on-warning text-caption font-bold shadow-md transition-all"
                    >
                        {t("shell.notifications.completeProfile")}
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    <button
                        onClick={() => setDismissed(true)}
                        className="p-1.5 text-warning-fg/60 hover:text-warning-fg rounded-lg transition-colors"
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
