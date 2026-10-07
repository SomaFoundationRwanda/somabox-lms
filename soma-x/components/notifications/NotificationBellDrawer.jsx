"use client";

import React, { useState, useEffect, useContext, useCallback } from 'react';
import { 
    Bell, CheckCheck, CheckCircle2, ChevronRight, GraduationCap, 
    Info, Trash2, UserCheck, UserPlus, X 
} from 'lucide-react';
import Link from 'next/link';
import DataContext from '@/context/DataContext';
import { 
    fetchNotifications, markNotificationAsRead, 
    markAllNotificationsAsRead, deleteNotification 
} from '@/lib/notification-service';

export default function NotificationBellDrawer({ className = "" }) {
    const { authenticated, isDark, user } = useContext(DataContext);
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all');

    const userEmail = user?.email || "";

    const loadNotifications = useCallback(async () => {
        if (!userEmail) return;
        try {
            const data = await fetchNotifications();
            setNotifications(data.notifications || []);
            setUnreadCount(data.unreadCount || 0);
            setIsProfileIncomplete(data.isProfileIncomplete || false);
        } catch (err) {
            console.error("Failed to load notifications:", err);
        }
    }, [userEmail]);

    useEffect(() => {
        if (authenticated && userEmail) {
            loadNotifications();
            const timer = setInterval(loadNotifications, 25000); // refresh every 25s
            return () => clearInterval(timer);
        }
    }, [authenticated, userEmail, loadNotifications]);

    const handleMarkAsRead = async (id, e) => {
        e?.stopPropagation();
        await markNotificationAsRead(id);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsAsRead();
        setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
        setUnreadCount(0);
    };

    const handleDelete = async (id, e) => {
        e?.stopPropagation();
        await deleteNotification(id);
        const target = notifications.find(n => n.id === id);
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (target && target.is_read === 0) {
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const diffMs = Date.now() - d.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const filteredList = filter === 'unread'
        ? notifications.filter(n => n.is_read === 0)
        : notifications;

    const dm = isDark;
    const popoverBg = dm ? '#0F172A' : '#FFFFFF';
    const borderCol = dm ? 'rgba(255,255,255,0.1)' : '#E2E8F0';
    const titleCol = dm ? '#F8FAFC' : '#0F172A';
    const textMuted = dm ? '#94A3B8' : '#64748B';

    return (
        <div className={`relative inline-block ${className}`}>
            {/* Bell trigger button */}
            <button
                onClick={() => setOpen(!open)}
                className={`relative p-2.5 rounded-full transition-all duration-200 cursor-pointer ${
                    dm ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/60' 
                       : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm'
                }`}
                aria-label="Notifications"
            >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-lg animate-pulse ring-2 ring-white">
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
                        className="fixed inset-y-0 right-0 w-80 sm:w-96 shadow-2xl border-l z-[9991] flex flex-col backdrop-blur-2xl animate-in slide-in-from-right duration-200"
                        style={{ backgroundColor: popoverBg, borderColor: borderCol }}
                    >
                        {/* Header */}
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: borderCol }}>
                            <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-sm" style={{ color: titleCol }}>Notifications</h3>
                                {unreadCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-500/10 text-teal-600 border border-teal-500/20">
                                        {unreadCount} new
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={handleMarkAllRead}
                                        className="text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" /> Read all
                                    </button>
                                )}
                                <button
                                    onClick={() => setOpen(false)}
                                    className="p-1 text-slate-600 hover:text-slate-600 rounded-md transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex border-b px-4 py-2 gap-2 text-xs font-bold" style={{ borderColor: borderCol }}>
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-3 py-1 rounded-full transition-colors ${
                                    filter === 'all' 
                                        ? 'bg-accent-dark text-white' 
                                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                All ({notifications.length})
                            </button>
                            <button
                                onClick={() => setFilter('unread')}
                                className={`px-3 py-1 rounded-full transition-colors ${
                                    filter === 'unread' 
                                        ? 'bg-accent-dark text-white' 
                                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                Unread ({unreadCount})
                            </button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: borderCol }}>
                            {filteredList.length === 0 ? (
                                <div className="p-8 text-center space-y-2">
                                    <div className="w-10 h-10 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600">
                                        <Bell className="w-5 h-5 opacity-50" />
                                    </div>
                                    <p className="text-xs font-semibold" style={{ color: textMuted }}>
                                        {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                                    </p>
                                </div>
                            ) : (
                                filteredList.map((n) => {
                                    const isUnread = n.is_read === 0;
                                    const isProfileReminder = n.type === 'profile_reminder';
                                    const isClassAdded = n.type === 'class_added';
                                    const isGraded = n.type === 'graded';

                                    return (
                                        <div
                                            key={n.id}
                                            onClick={() => isUnread && handleMarkAsRead(n.id)}
                                            className={`p-3.5 transition-colors cursor-pointer group relative ${
                                                isUnread 
                                                    ? (dm ? 'bg-slate-800/40 hover:bg-slate-800/70' : 'bg-slate-50 hover:bg-slate-100/80') 
                                                    : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/20'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                {/* Icon badge */}
                                                <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                                                    isProfileReminder ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                                                    isClassAdded ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20' :
                                                    isGraded ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                                                    'bg-slate-500/10 text-slate-600 border border-slate-500/20'
                                                }`}>
                                                    {isProfileReminder && <UserCheck className="w-4 h-4" />}
                                                    {isClassAdded && <GraduationCap className="w-4 h-4" />}
                                                    {isGraded && <CheckCircle2 className="w-4 h-4" />}
                                                    {!isProfileReminder && !isClassAdded && !isGraded && <Info className="w-4 h-4" />}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0 pr-6">
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <p className={`text-xs font-bold truncate ${isUnread ? 'text-slate-900 dark:text-white font-black' : 'text-slate-700 dark:text-slate-300'}`}>
                                                            {n.title}
                                                        </p>
                                                        <span className="text-[10px] font-medium opacity-60 shrink-0" style={{ color: textMuted }}>
                                                            {formatTime(n.created_at)}
                                                        </span>
                                                    </div>

                                                    <p className="text-[11px] font-medium leading-relaxed mt-0.5 text-slate-600 dark:text-slate-400">
                                                        {n.message}
                                                    </p>

                                                    {/* Quick Action Link */}
                                                    {n.link && (
                                                        <div className="mt-2">
                                                            <Link
                                                                href={n.link}
                                                                onClick={() => setOpen(false)}
                                                                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-accent-dark hover:underline"
                                                            >
                                                                {isProfileReminder ? 'Complete Profile' : 'View Details'}
                                                                <ChevronRight className="w-3 h-3" />
                                                            </Link>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Delete icon */}
                                                <button
                                                    onClick={(e) => handleDelete(n.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-rose-600 rounded transition-all absolute right-3 top-3"
                                                    title="Dismiss"
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
