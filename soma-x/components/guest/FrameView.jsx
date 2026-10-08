"use client";

// Web lessons (Khan Academy, W3Schools, Wikipedia...) in a full-page iframe. The backend only
// serves them to signed-in people, with the media cookie, and an iframe can't report a 401,
// so this checks first: guests get the sign-up prompt and an expired cookie is renewed (or
// the person is asked to sign in again) instead of a page of JSON.
import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import LanguageSwitcher from "@/components/global/LanguageSwitcher";
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import { MediaAccessNotice, useMediaAccess } from "@/components/guest/MediaAccess";
import Loader from "@/components/ui/Loader";

// Some lesson servers never answer; don't keep the loader over the page forever.
const GIVE_UP_AFTER_MS = 15000;

// A slim bar above the lesson: back to Explore and the language picker.
function FrameTopBar() {
    const { t } = useLanguage();
    return (
        <div className="h-11 shrink-0 flex items-center justify-between gap-2 px-3 bg-white border-b border-slate-200">
            <Link href="/home" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 hover:text-slate-950 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                {t("shell.frame.back")}
            </Link>
            <LanguageSwitcher compact />
        </div>
    );
}

export default function FrameView({ src, title, next }) {
    const { authLoading, authenticated } = useContext(DataContext);
    const { state } = useMediaAccess(src);
    // Some lessons (e.g. the Kiwix Wikipedia server) aren't served by the backend, so the
    // cookie check can't see them: guests get the prompt whatever the source.
    const shown = authLoading ? "checking" : !authenticated ? "guest" : state;
    // The lesson itself takes a moment to load in the iframe: the SOMABOX loader until it has.
    const [frameLoaded, setFrameLoaded] = useState(false);
    useEffect(() => {
        if (shown !== "ok" || frameLoaded) return undefined;
        const timer = setTimeout(() => setFrameLoaded(true), GIVE_UP_AFTER_MS);
        return () => clearTimeout(timer);
    }, [shown, frameLoaded]);

    if (shown === "checking") {
        return (
            <div className="w-full min-h-screen flex flex-col bg-slate-100">
                <FrameTopBar />
                <Loader variant="overlay" />
            </div>
        );
    }

    if (shown !== "ok") {
        return (
            <div className="w-full min-h-screen flex flex-col bg-slate-100">
                <FrameTopBar />
                <div className="flex-1 flex items-center justify-center">
                    <MediaAccessNotice state={shown} next={next} />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-screen flex flex-col">
            <FrameTopBar />
            <iframe src={src} className="w-full flex-1 min-h-0" title={title} style={{ border: "none" }} onLoad={() => setFrameLoaded(true)} />
            {!frameLoaded && <Loader variant="overlay" />}
            {/* New accounts land here straight after signing up: the profile step still comes first. */}
            <MandatoryProfileSetupModal />
        </div>
    );
}
