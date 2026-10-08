"use client";

import { Button } from "../ui/button";
import { useLanguage } from "@/context/LanguageContext";
import Typography from "../ui/Typography";

const Unauthorized = () => {
    const t = useLanguage()?.t;
    return ( 
        <div className="flex flex-col items-center justify-center h-[40vh]">
            <Typography >
                {t?.("shell.common.notLoggedIn") ?? "You are not logged in. Please log in to continue."}
            </Typography>
            <a href="/login">
            {/* Skip keyboard focus */}
                <Button tabIndex={-1} >
                    {t?.("auth.authLogin") ?? "Login"}
                </Button>
            </a>
        </div>
    );
}

export default Unauthorized;