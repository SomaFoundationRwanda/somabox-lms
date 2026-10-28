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
import { startRouteLoading } from "@/components/global/RouteLoader";
import { accountPage } from "@/lib/session";
import Loader from "@/components/ui/Loader";

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

    // The menu is dark in both modes, tinted with the school colour.
    const dropdownBg = "color-mix(in srgb, var(--brand-deep) 70%, black)";

    // Show loading state
    if (loading) {
        return (
            <section className="relative cursor-pointer bg-surface border border-line px-2.5 shadow-sm flex items-center justify-around rounded-full w-10 sm:w-[11rem] h-10">
                <Loader size={24} label={t("shell.common.loading")} />
                <div className="hidden sm:block">
                    <p className="ml-3 text-caption font-bold text-fg-muted">{t("shell.common.loading")}</p>
                </div>
            </section>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger aria-label={t("shell.profile.menu")} className="outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full">
                <section
                    className={`relative hover:opacity-90 cursor-pointer shadow-sm border border-transparent bg-brand-strong flex items-center rounded-full w-10 sm:w-[11rem] h-10 px-1 sm:px-2 gap-2.5 transition-opacity`}>
                    {/* Profile picture or default icon */}
                    <Avatar
                        src={getAvatarUrl()}
                        size="xsmall"
                        isLoggedIn={true}
                        showStatus={true}
                    />

                    {/* Dynamic text based on login status */}
                    <div className="hidden sm:flex flex-col justify-center text-left min-w-0">
                        <p className={`text-caption ${isLoggedIn ? "hidden" : "visible"} font-bold text-on-brand-strong`}>
                            {t("shell.profile.signIn")}
                        </p>
                        <div className={`${isLoggedIn ? "visible" : "hidden"} flex flex-col`}>
                            <p className="text-caption font-bold leading-tight truncate w-24 text-on-brand-strong">
                                {getDisplayName()}
                            </p>
                            <p className="text-caption leading-tight capitalize text-on-brand-strong/70 font-medium">
                                {t(`role.${role}`) || role}
                            </p>
                        </div>
                    </div>
                </section>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
                align="end" 
                className="dark w-48 p-1.5 rounded-[8px] shadow-lg border-line-strong text-fg"
                style={{ backgroundColor: dropdownBg }}
            >
                {learnerCode && (
                    <>
                        <DropdownMenuLabel className="px-2.5 py-2 text-fg">
                            <span className="block text-caption font-semibold text-fg-subtle">{t("school.learnerCode")}</span>
                            <span className="block text-ui font-extrabold font-mono">{learnerCode}</span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-line-strong" />
                    </>
                )}
                <DropdownMenuItem 
                    onClick={() => { startRouteLoading(); router.push('/settings'); }}
                    className="cursor-pointer gap-2.5 rounded-[5px] px-2.5 py-2 transition-colors text-fg hover:bg-brand/15 focus:bg-brand/15 focus:text-fg"
                >
                    <Settings size={15} className="text-brand-fg" />
                    <span className="text-caption font-semibold">{t("shell.profile.settings")}</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                    onClick={() => { startRouteLoading(); router.push(accountPage(user?.role)); }}
                    className="cursor-pointer gap-2.5 rounded-[5px] px-2.5 py-2 transition-colors text-fg hover:bg-brand/15 focus:bg-brand/15 focus:text-fg"
                >
                    <UserRound size={15} className="text-brand-fg" />
                    <span className="text-caption font-semibold">{t("nav.account") || "Account"}</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator className="bg-line-strong" />
                
                <DropdownMenuItem 
                    onClick={logout}
                    className="cursor-pointer gap-2.5 rounded-[5px] px-2.5 py-2 transition-colors text-danger-fg hover:bg-danger/10 focus:bg-danger/10 focus:text-danger-fg"
                >
                    <LogOut size={15} />
                    <span className="text-caption font-semibold">{t("shell.nav.logout")}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ProfileCard;
