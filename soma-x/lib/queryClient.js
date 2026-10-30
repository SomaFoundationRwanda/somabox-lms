"use client";

// Server data is kept by TanStack Query. The box is on the local network and its data rarely
// changes behind someone's back, so what's loaded is kept until:
// - the person changes it (the change marks exactly that data out of date: invalidateQueries),
// - the box says it changed (the live updates stream: lib/liveUpdates.js),
// - or the app is reloaded.
// No refetching on focus, reconnect or timers; the few things that need polling (a running sync
// or download) ask for it themselves.
import { QueryClient } from "@tanstack/react-query";

const retry = (count, error) => error?.status === 0 && count < 2; // only "can't reach the box", twice

export function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: Infinity,
                gcTime: 30 * 60 * 1000,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
                retry,
                // The browser's "online" means internet, which a school box doesn't have.
                networkMode: "always",
            },
            mutations: { retry: false, networkMode: "always" },
        },
    });
}
