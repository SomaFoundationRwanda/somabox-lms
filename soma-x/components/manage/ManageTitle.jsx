"use client"
import Link from "next/link";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import DataContext from "@/context/DataContext";
import NotificationBellDrawer from "@/components/notifications/NotificationBellDrawer";

const ManageTitle = ({ title }) => {
    const { isDark, user } = useContext(DataContext);
    const ACCENT = isDark ? "#0D9488" : "#203B3B";

    const [initials, setInitials] = useState("A");

    useEffect(() => {
        const name = (user?.fullName || "");
        if (name) {
            setInitials(
                name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
            );
        }
    }, [user]);

    return (
        <div className="flex items-center justify-between pl-12 pr-4 md:px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-10 rounded-b-[5px] mb-4">
            <div className="flex items-center gap-3 min-w-0">
                <Link href="/manage/admin">
                    <button className="w-7 h-7 flex items-center justify-center rounded-[5px] border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors shrink-0">
                        <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                </Link>
                <div className="min-w-0">
                    <div className="flex items-center gap-1 text-[10px] text-slate-600 font-medium">
                        <Link href="/manage/admin" className="hover:text-slate-600 transition-colors">Admin</Link>
                        <ChevronRight className="w-3 h-3" />
                        <span className="text-slate-600 font-semibold">{title}</span>
                    </div>
                    <h1 className="text-[16px] font-black text-slate-900 leading-tight tracking-tight">{title}</h1>
                </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition-colors">
                    <Search className="w-[15px] h-[15px]" />
                </button>
                <NotificationBellDrawer />
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ml-0.5"
                    style={{ backgroundColor: ACCENT }}
                >
                    <span className="text-[11px] font-black text-white tracking-wide">{initials}</span>
                </div>
            </div>
        </div>
    );
}

export default ManageTitle;
