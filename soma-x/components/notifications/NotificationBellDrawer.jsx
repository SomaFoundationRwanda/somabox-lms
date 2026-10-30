"use client";

import React, { useState } from 'react';
import { 
    Bell, CheckCheck, CheckCircle2, ChevronRight, GraduationCap, 
    Info, Trash2, UserCheck, UserPlus, X 
} from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import { fill } from '@/lib/fill';
import { formatDate } from '@/components/helpers/localeDate';
import {
    useNotifications, useMarkNotificationRead,
    useMarkAllNotificationsRead, useDeleteNotification
} from '@/lib/notification-service';

export default function NotificationBellDrawer({ className = "" }) {
    const { t, lang } = useLanguage();
    const [open, setOpen] = useState(false);
    const { notifications, unreadCount, isProfileIncomplete } = useNotifications();
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();
    const remove = useDeleteNotification();
    const [filter, setFilter] = useState('all');

    const handleMarkAsRead = (id, e) => {
        e?.stopPropagation();
        markRead.mutate(id);
    };

    const handleMarkAllRead = () => markAllRead.mutate();

    const handleDelete = (id, e) => {
        e?.stopPropagation();
        remove.mutate(id);
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const diffMs = Date.now() - d.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return t('shell.time.justNow');
        if (diffMins < 60) return fill(t('shell.time.minutesAgo'), { n: diffMins });
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return fill(t('shell.time.hoursAgo'), { n: diffHours });
        return formatDate(d, lang, { month: 'short', day: 'numeric' });
    };

    const filteredList = filter === 'unread'
        ? notifications.filter(n => n.is_read === 0)
        : notifications;


    return (
        <div className={`relative inline-block ${className}`}>
            {/* Bell trigger button */}
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2.5 rounded-full transition-all duration-200 cursor-pointer bg-surface hover:bg-surface-hover text-fg-muted border border-line shadow-sm"
                aria-label={t('shell.notifications.title')}
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-caption font-extrabold text-on-danger shadow-lg animate-pulse ring-2 ring-surface">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Notification Slide-Over Drawer */}
            {open && (
                <>
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black/30 z-[9990] backdrop-blur-[2px] animate-in fade-in duration-200" 
                        onClick={() => setOpen(false)} 
                    />

                    {/* Right-side Slide-Over Panel */}
                    <div 
                        className="fixed inset-y-0 right-0 w-80 sm:w-96 shadow-2xl border-l border-line bg-surface-raised z-[9991] flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-200"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-line flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-ui text-fg">{t('shell.notifications.title')}</h3>
                                {unreadCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-caption font-extrabold bg-brand/10 text-brand-fg border border-brand/20">
                                        {fill(t('shell.notifications.newCount'), { n: unreadCount })}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={handleMarkAllRead}
                                        className="text-caption font-bold text-brand-fg hover:text-brand-fg flex items-center gap-1 px-2 py-1 rounded-md hover:bg-brand-soft transition-colors"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" /> {t('shell.notifications.readAll')}
                                    </button>
                                )}
                                <button aria-label={t('shell.common.close')}
                                    onClick={() => setOpen(false)}
                                    className="p-1 text-fg-muted hover:text-fg-muted rounded-md transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex border-b border-line px-4 py-2 gap-2 text-caption font-bold">
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-3 py-1 rounded-full transition-colors ${
                                    filter === 'all' 
                                        ? 'bg-brand-strong text-on-brand-strong' 
                                        : 'text-fg-subtle hover:bg-surface-hover'
                                }`}
                            >
                                {t('shell.notifications.all')} ({notifications.length})
                            </button>
                            <button
                                onClick={() => setFilter('unread')}
                                className={`px-3 py-1 rounded-full transition-colors ${
                                    filter === 'unread' 
                                        ? 'bg-brand-strong text-on-brand-strong' 
                                        : 'text-fg-subtle hover:bg-surface-hover'
                                }`}
                            >
                                {t('shell.notifications.unread')} ({unreadCount})
                            </button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto divide-y divide-line">
                            {filteredList.length === 0 ? (
                                <div className="p-8 text-center space-y-2">
                                    <div className="w-10 h-10 mx-auto rounded-full bg-surface-sunken flex items-center justify-center text-fg-muted">
                                        <Bell className="w-5 h-5 opacity-50" />
                                    </div>
                                    <p className="text-caption font-semibold text-fg-subtle">
                                        {filter === 'unread' ? t('shell.notifications.noUnread') : t('shell.notifications.none')}
                                    </p>
                                </div>
                            ) : (
                                filteredList.map((n) => {
                                    const isUnread = n.is_read === 0;
                                    const isProfileReminder = n.type === 'profile_reminder';
                                    const isClassAdded = n.type === 'class_added';
                                    const isGraded = n.type === 'graded';
                                    // System notifications carry a text key: shown in the reader's language.
                                    const kind = n.text_key ? (k) => t(`shell.notifications.kinds.${n.text_key}.${k}`) : () => null;
                                    const title = kind('title') ? fill(kind('title'), n.text_params || {}) : n.title;
                                    const message = kind('message') ? fill(kind('message'), n.text_params || {}) : n.message;

                                    return (
                                        <div
                                            key={n.id}
                                            onClick={() => isUnread && handleMarkAsRead(n.id)}
                                            className={`p-3.5 transition-colors cursor-pointer group relative ${
                                                isUnread 
                                                    ? 'bg-surface-sunken hover:bg-surface-hover' 
                                                    : 'hover:bg-surface-hover/50'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                {/* Icon badge */}
                                                <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                                                    isProfileReminder ? 'bg-warning/10 text-warning-fg border border-warning/20' :
                                                    isClassAdded ? 'bg-brand/10 text-brand-fg border border-brand/20' :
                                                    isGraded ? 'bg-success/10 text-success-fg border border-success/20' :
                                                    'bg-surface-sunken text-fg-muted border border-line'
                                                }`}>
                                                    {isProfileReminder && <UserCheck className="w-4 h-4" />}
                                                    {isClassAdded && <GraduationCap className="w-4 h-4" />}
                                                    {isGraded && <CheckCircle2 className="w-4 h-4" />}
                                                    {!isProfileReminder && !isClassAdded && !isGraded && <Info className="w-4 h-4" />}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0 pr-6">
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <p className={`text-caption font-bold truncate ${isUnread ? 'text-fg font-extrabold' : 'text-fg-muted'}`}>
                                                            {title}
                                                        </p>
                                                        <span className="text-caption font-medium opacity-60 shrink-0 text-fg-subtle">
                                                            {formatTime(n.created_at)}
                                                        </span>
                                                    </div>

                                                    <p className="text-caption font-medium leading-relaxed mt-0.5 text-fg-muted">
                                                        {message}
                                                    </p>

                                                    {/* Keyboard equivalent of clicking an unread notification */}
                                                    {isUnread && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleMarkAsRead(n.id); }}
                                                            className="sr-only focus:not-sr-only focus:mt-1 focus:inline-block text-caption font-bold text-brand-fg underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                                        >
                                                            {t('shell.notifications.markRead')}
                                                        </button>
                                                    )}

                                                    {/* Quick Action Link */}
                                                    {n.link && (
                                                        <div className="mt-2">
                                                            <Link
                                                                href={n.link}
                                                                onClick={() => setOpen(false)}
                                                                className="inline-flex items-center gap-1 text-caption font-extrabold text-brand-fg hover:underline"
                                                            >
                                                                {isProfileReminder ? t('shell.notifications.completeProfile') : t('shell.notifications.viewDetails')}
                                                                <ChevronRight className="w-3 h-3" />
                                                            </Link>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Delete icon */}
                                                <button
                                                    onClick={(e) => handleDelete(n.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand p-1 text-fg-muted hover:text-danger-fg rounded transition-all absolute right-3 top-3"
                                                    title={t('shell.notifications.dismiss')}
                                                    aria-label={fill(t('shell.notifications.dismissNamed'), { title })}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
