"use client";
import { useContext, useEffect, useState } from "react";
import DataContext from "@/context/DataContext";

export default function useUser() {
    const context = useContext(DataContext) || {};
    const { authenticated = false, role = "", unshiftString } = context;
    const [displayName, setDisplayName] = useState("");
    const [userRole, setUserRole] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const name = localStorage.getItem("un") || "";
            if (unshiftString) {
                setDisplayName(name ? unshiftString(name) : "");
                setUserRole(role ? unshiftString(role) : "");
            }
            setLoading(false);
        }
    }, [unshiftString, role]);

    return {
        getDisplayName: () => displayName || "User",
        getAvatarUrl: () => null,
        isLoggedIn: authenticated,
        loading: loading,
        role: userRole || "Guest"
    };
}
