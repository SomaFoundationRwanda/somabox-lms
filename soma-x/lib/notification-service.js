"use client";

// Notifications: one kept copy for the whole app (the bell and the profile banner share it). It
// isn't polled: the box says when there's a new one (live updates), and reading, marking and
// deleting update the kept copy straight away.
import { useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DataContext from "@/context/DataContext";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const EMPTY = { notifications: [], unreadCount: 0, isProfileIncomplete: false };

/** { notifications, unreadCount, isProfileIncomplete } for the signed-in person. */
export function useNotifications() {
    const { authenticated } = useContext(DataContext);
    const query = useQuery({
        queryKey: queryKeys.notifications,
        queryFn: () => apiFetch("/notifications"),
        enabled: authenticated,
    });
    return { ...(query.data || EMPTY), loading: query.isPending && authenticated };
}

// Changes the kept copy: `change(data)` returns the new { notifications, unreadCount, ... }.
function useNotificationChange(request, change) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: request,
        onSuccess: (_result, variables) => {
            queryClient.setQueryData(queryKeys.notifications, (data) => (data ? change(data, variables) : data));
        },
    });
}

// The server's count covers every unread notification, not only the ones loaded: adjust it.
const wasUnread = (data, id) => (data.notifications.find((n) => n.id === id)?.is_read === 0 ? 1 : 0);

export function useMarkNotificationRead() {
    return useNotificationChange(
        (id) => apiFetch(`/notifications/${id}/read`, { method: "PATCH" }),
        (data, id) => {
            const notifications = data.notifications.map((n) => (n.id === id ? { ...n, is_read: 1 } : n));
            return { ...data, notifications, unreadCount: Math.max(0, data.unreadCount - wasUnread(data, id)) };
        },
    );
}

export function useMarkAllNotificationsRead() {
    return useNotificationChange(
        () => apiFetch("/notifications/read-all", { method: "POST", json: {} }),
        (data) => ({ ...data, notifications: data.notifications.map((n) => ({ ...n, is_read: 1 })), unreadCount: 0 }),
    );
}

export function useDeleteNotification() {
    return useNotificationChange(
        (id) => apiFetch(`/notifications/${id}`, { method: "DELETE" }),
        (data, id) => {
            const notifications = data.notifications.filter((n) => n.id !== id);
            return { ...data, notifications, unreadCount: Math.max(0, data.unreadCount - wasUnread(data, id)) };
        },
    );
}
