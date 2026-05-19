"use client"
import { useContext, useEffect } from "react";
import DataContext from "@/context/DataContext";

export default function AuthRedirect() {
    const { authenticated, role, unshiftString } = useContext(DataContext);

    useEffect(() => {
        const storedRole = localStorage.getItem("gh");
        if (!storedRole) {
            window.location.replace("/");
            return;
        }
        const decoded = unshiftString(storedRole);
        if (decoded === "teacher") window.location.replace("/manage/teacher");
        else if (decoded === "admin") window.location.replace("/manage/admin");
        else window.location.replace("/manage/scholar-dashboard");
    }, [unshiftString]);

    return null;
}
