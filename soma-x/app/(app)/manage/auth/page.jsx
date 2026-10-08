"use client"
import { useContext, useEffect } from "react";
import DataContext from "@/context/DataContext";
import Loader from "@/components/ui/Loader";

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

    // Sending the user to their area: the SOMABOX loader while that page loads.
    return <Loader variant="page" className="min-h-[60vh]" />;
}
