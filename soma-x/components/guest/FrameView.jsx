"use client";

// Web lessons (Khan Academy, W3Schools, Wikipedia...) in a full-page iframe. The backend only
// serves them to signed-in people, with the media cookie, and an iframe can't report a 401,
// so this checks first: guests get the sign-up prompt and an expired cookie is renewed (or
// the person is asked to sign in again) instead of a page of JSON.
import { useContext } from "react";
import DataContext from "@/context/DataContext";
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import { MediaAccessNotice, useMediaAccess } from "@/components/guest/MediaAccess";

export default function FrameView({ src, title, next }) {
    const { authLoading, authenticated } = useContext(DataContext);
    const { state } = useMediaAccess(src);
    // Some lessons (e.g. the Kiwix Wikipedia server) aren't served by the backend, so the
    // cookie check can't see them: guests get the prompt whatever the source.
    const shown = authLoading ? "checking" : !authenticated ? "guest" : state;

    if (shown !== "ok") {
        return (
            <div className="w-full min-h-screen flex items-center justify-center bg-slate-100">
                <MediaAccessNotice state={shown} next={next} />
            </div>
        );
    }

    return (
        <>
            <iframe src={src} className="w-full h-screen" title={title} style={{ border: "none" }} />
            {/* New accounts land here straight after signing up: the profile step still comes first. */}
            <MandatoryProfileSetupModal />
        </>
    );
}
