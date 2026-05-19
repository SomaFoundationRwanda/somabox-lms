"use client";
import Link from "next/link";
import { useContext, useState } from "react";
import DataContext from "@/context/DataContext";

const AdminOption = ({ title, subtitle, href, icon: Icon }) => {
    const { isDark } = useContext(DataContext);
    const dm = isDark;
    const [hovered, setHovered] = useState(false);

    const cardStyle = {
        backgroundColor: hovered
            ? (dm ? "rgba(255,255,255,0.06)" : "#f8fafc")
            : (dm ? "rgba(255,255,255,0.04)" : "#ffffff"),
        border: `1px solid ${hovered
            ? (dm ? "rgba(255,255,255,0.14)" : "#cbd5e1")
            : (dm ? "rgba(255,255,255,0.07)" : "#f1f5f9")}`,
        transition: "all 200ms",
    };

    const iconStyle = {
        backgroundColor: hovered
            ? (dm ? "rgba(13,148,136,0.2)"     : "#203B3B")
            : (dm ? "rgba(255,255,255,0.07)"   : "#f1f5f9"),
        color: hovered
            ? (dm ? "#0D9488" : "#ffffff")
            : (dm ? "#7A8595" : "#64748b"),
        transition: "all 200ms",
    };

    const titleColor  = dm ? "#D1D9E0" : "#1e293b";
    const subtitleColor = dm ? "#637080" : "#94a3b8";

    return (
        <Link href={href} className="w-full">
            <div
                className="flex items-center gap-3 px-4 py-3 rounded-[5px] w-full cursor-pointer"
                style={cardStyle}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
            >
                {Icon && (
                    <div className="w-8 h-8 rounded-[5px] flex items-center justify-center shrink-0"
                        style={iconStyle}>
                        <Icon size={15} />
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-[12px] font-bold truncate" style={{ color: titleColor }}>{title}</p>
                    <p className="text-[10px] truncate mt-0.5" style={{ color: subtitleColor }}>{subtitle}</p>
                </div>
            </div>
        </Link>
    );
};

export default AdminOption;
