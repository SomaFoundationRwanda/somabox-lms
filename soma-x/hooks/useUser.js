"use client";
import { useContext } from "react";
import DataContext from "@/context/DataContext";

export default function useUser() {
    const { authenticated = false, authLoading = true, user = null } = useContext(DataContext) || {};

    return {
        getDisplayName: () => user?.fullName || "User",
        getAvatarUrl: () => null,
        isLoggedIn: authenticated,
        loading: authLoading,
        role: user?.role || "Guest"
    };
}
