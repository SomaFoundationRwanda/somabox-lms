"use client";
import useUser from "../../hooks/useUser"; 
import AvatarFallback from "./AvatarFallBack";
import Avatar from "./Avatar";

import { useContext } from "react";
import DataContext from "../../context/DataContext";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../../context/LanguageContext";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./dropdown-menu";

const ProfileCard = () => {
    const { 
        getDisplayName, 
        getAvatarUrl, 
        isLoggedIn, 
        loading,
        role 
    } = useUser();
    
    const { logout, user } = useContext(DataContext) || {};
    const { t } = useLanguage();
    // Learners can sign in with this code instead of their email (e.g. GSK-0012).
    const learnerCode = user?.learnerCode || "";
    const router = useRouter();

    const dropdownBg = "#0f2d2b";
    const itemHoverBg = "rgba(45,212,191,0.15)"; // #2dd4bf with opacity
    const iconColor = "#2dd4bf";
    const titleColor = "#ffffff";
    const borderColor = "rgba(255,255,255,0.1)";

    // Show loading state
    if (loading) {
        return (
            <section className="relative cursor-pointer bg-white border border-slate-100 px-2.5 shadow-sm flex items-center justify-around rounded-full w-[11rem] h-10">
                <div className="w-6 h-6 px-3 flex items-center justify-center rounded-[100%] bg-amber-400">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                </div>
                <div>
                    <p className="ml-3 text-xs font-bold text-slate-600">Loading...</p>
                </div>
            </section>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] rounded-full">
                <section
                    className={`relative hover:opacity-90 cursor-pointer shadow-sm border border-transparent flex items-center rounded-full w-[11rem] h-10 px-2 gap-2.5 transition-opacity`}
                    style={{ backgroundColor: "#203A3A" }}>
                    {/* Profile picture or default icon */}
                    <Avatar
                        src={getAvatarUrl()}
                        size="xsmall"
                        isLoggedIn={true}
                        showStatus={true}
                    />

                    {/* Dynamic text based on login status */}
                    <div className="flex flex-col justify-center text-left min-w-0">
                        <p className={`text-xs ${isLoggedIn ? "hidden" : "visible"} font-bold text-white`}>
                            Sign in
                        </p>
                        <div className={`${isLoggedIn ? "visible" : "hidden"} flex flex-col`}>
                            <p className="text-xs font-bold leading-tight truncate w-24 text-white">
                                {getDisplayName()}
                            </p>
                            <p className="text-[11px] leading-tight capitalize text-slate-400 font-medium">
                                {role}
                            </p>
                        </div>
                    </div>
                </section>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
                align="end" 
                className="w-48 p-1.5 rounded-[8px] shadow-lg"
                style={{ 
                    backgroundColor: dropdownBg, 
                    borderColor: borderColor 
                }}
            >
                {learnerCode && (
                    <>
                        <DropdownMenuLabel className="px-2.5 py-2" style={{ color: titleColor }}>
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">{t("school.learnerCode")}</span>
                            <span className="block text-[14px] font-black font-mono tracking-wider">{learnerCode}</span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator style={{ backgroundColor: borderColor }} />
                    </>
                )}
                <DropdownMenuItem 
                    onClick={() => router.push('/settings')}
                    className="cursor-pointer gap-2.5 rounded-[5px] px-2.5 py-2 transition-colors"
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = itemHoverBg}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                    style={{ color: titleColor }}
                >
                    <Settings size={15} style={{ color: iconColor }} />
                    <span className="text-[12px] font-semibold">Settings</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                    onClick={() => router.push('/account')}
                    className="cursor-pointer gap-2.5 rounded-[5px] px-2.5 py-2 transition-colors"
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = itemHoverBg}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                    style={{ color: titleColor }}
                >
                    <UserRound size={15} style={{ color: iconColor }} />
                    <span className="text-[12px] font-semibold">Account</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator style={{ backgroundColor: borderColor }} />
                
                <DropdownMenuItem 
                    onClick={logout}
                    className="cursor-pointer gap-2.5 rounded-[5px] px-2.5 py-2 transition-colors"
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,0,0,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                    style={{ color: "#fca5a5" }}
                >
                    <LogOut size={15} />
                    <span className="text-[12px] font-semibold">Logout</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ProfileCard;
