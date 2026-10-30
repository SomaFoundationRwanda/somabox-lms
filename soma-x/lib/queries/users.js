"use client";

// Accounts, as the admin manages them. Lists are kept per filter; any change to an account marks
// every list (and the course lists showing teachers) out of date, so they all update at once.
import { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

/** { users, total, totalPages } for GET /users with these filters. */
export function useUserList(params) {
    return useQuery({
        queryKey: queryKeys.userList(params),
        queryFn: () => apiFetch(`/users?${new URLSearchParams(params)}`),
        // Paging or filtering keeps the current rows on screen until the next ones arrive.
        placeholderData: keepPreviousData,
    });
}

export function useUser(id) {
    return useQuery({ queryKey: queryKeys.user(id), queryFn: () => apiFetch(`/users/${id}`), enabled: !!id });
}

/** Call after creating, editing, (de)activating or deleting accounts. */
export function useUsersChanged() {
    const queryClient = useQueryClient();
    return useCallback(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.users });
        queryClient.invalidateQueries({ queryKey: queryKeys.allCourses });
    }, [queryClient]);
}

/** `value`, once it has stopped changing for `ms` (search boxes: one request per pause, not per key). */
export function useSettled(value, ms = 300) {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), ms);
        return () => clearTimeout(timer);
    }, [value, ms]);
    return settled;
}
