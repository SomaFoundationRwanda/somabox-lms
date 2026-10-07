"use client"
import { useContext, useEffect } from "react";
import DataContext from "@/context/DataContext";

export default function AuthRedirect() {
    const { authLoading, authenticated, role } = useContext(DataContext);

    useEffect(() => {
        if (authLoading) return;
        if (!authenticated) {
            window.location.replace("/");
            return;
        }
        if (role === "teacher") window.location.replace("/manage/teacher");
        else if (role === "admin") window.location.replace("/manage/admin");
        else window.location.replace("/manage/scholar-dashboard");
    }, [authLoading, authenticated, role]);

    return null;
}
