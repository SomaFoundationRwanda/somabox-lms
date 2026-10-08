"use client"
import Nav from "@/components/global/Nav";
import Header from "@/components/global/Header";
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import { GuestGateProvider } from "@/components/guest/GuestGate";
import { GuestBanner, GuestHeader, GuestNav } from "@/components/guest/GuestShell";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { loginUrlWithNext } from "@/lib/session";
import { startSubmissionQueue } from "@/lib/submissionQueue";
import { useContext, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// Routes in this group that need an account. Everything else here is for exploring as a
// guest: /home, /library, /discover-courses and the content browser (/[...slug]).
const PRIVATE_PREFIXES = ["/account", "/calendar", "/course", "/manage", "/library/courses", "/teacher"];
const isExploreRoute = (pathname = "") =>
  !PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const Spinner = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-[#EFEFEF]">
    <div className="w-8 h-8 rounded-full border-[3px] border-slate-200 border-t-[#203A3A] animate-spin" />
  </div>
);

export default function AppLayout({ children }) {
  const { authLoading, authenticated, user, SERVER_URL } = useContext(DataContext);
  const { showToast } = useToast();
  const { t } = useLanguage();
  // The submission queue lives across language changes; read the current t when it reports.
  const tRef = useRef(t);
  tRef.current = t;
  const router = useRouter();
  const pathname = usePathname();
  const explore = isExploreRoute(pathname);
  const guest = !authLoading && !authenticated;

  // Guests may explore; anything else sends them to sign in, and back here afterwards.
  useEffect(() => {
    if (guest && !explore) {
      router.replace(loginUrlWithNext(window.location.pathname + window.location.search));
    }
  }, [guest, explore, router]);

  // Accounts flagged by the server (e.g. the default admin) must change their password
  // first. The backend enforces this too; this just avoids a screen full of errors.
  useEffect(() => {
    if (authLoading || !authenticated) return;
    if (user?.mustChangePassword && pathname !== "/account") router.replace("/account");
  }, [authLoading, authenticated, user, pathname, router]);

  // Learners' assignment submissions that couldn't reach the box are retried from here. Only
  // the assignment page queues anything, and only for someone who is a learner in that course
  // (any account can be), so this runs for every signed-in user and is idle when nothing waits.
  const learnerId = authenticated ? user?.id ?? null : null;
  useEffect(() => {
    if (!learnerId) return undefined;
    return startSubmissionQueue(SERVER_URL, learnerId, {
      onSent: () => showToast(tRef.current("shell.toasts.workSent"), "success"),
      onRefused: (_entry, message) => showToast(message, "error", 8000),
    });
  }, [learnerId, SERVER_URL, showToast]);

  if (authLoading || (guest && !explore)) return <Spinner />;

  if (guest) {
    return (
      <GuestGateProvider>
        <GuestNav />
        <div className="md:ml-[var(--sidebar-width,180px)] w-full min-h-screen flex flex-col pb-[4.2rem] md:pb-0">
          <GuestHeader />
          <GuestBanner />
          <div
            className="flex-1 global-horizontal-padding"
            style={{ backgroundColor: "var(--canvas-bg)" }}
          >
            {children}
          </div>
        </div>
      </GuestGateProvider>
    );
  }

  return (
    <GuestGateProvider>
      <Nav />
      <div className="md:ml-[var(--sidebar-width,180px)] w-full min-h-screen flex flex-col transition-[margin-left] duration-200 ease-in-out">
        <Header />
        <div
          className="flex-1 global-horizontal-padding"
          style={{ backgroundColor: "var(--canvas-bg)" }}
        >
          {children}
        </div>
      </div>
      <MandatoryProfileSetupModal />
    </GuestGateProvider>
  );
}
