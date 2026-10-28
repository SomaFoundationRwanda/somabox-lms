"use client"
import Nav from "@/components/global/Nav";
import Header from "@/components/global/Header";
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import { GuestGateProvider } from "@/components/guest/GuestGate";
import { GuestBanner, GuestHeader, GuestNav } from "@/components/guest/GuestShell";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { accountPage, loginUrlWithNext } from "@/lib/session";
import { startSubmissionQueue } from "@/lib/submissionQueue";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useContext, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Loader from "@/components/ui/Loader";
import { startRouteLoading } from "@/components/global/RouteLoader";
import { useTrackPages } from "@/lib/inAppHistory";
import CelebrationHost from "@/components/celebrate/CelebrationHost";
import { useWelcomeBack } from "@/lib/learnerCelebrations";
import { usePersistedCache } from "@/lib/persistCache";

// Routes in this group that need an account. Everything else here is for exploring as a
// guest: /home, /library, /discover-courses and the content browser (/[...slug]).
const PRIVATE_PREFIXES = ["/account", "/calendar", "/course", "/manage", "/library/courses", "/teacher"];
const isExploreRoute = (pathname = "") =>
  !PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

// While the session is being checked: the SOMABOX logo loader, centred on the screen.
const Spinner = () => (
  <div className="min-h-screen w-full bg-surface-sunken">
    <Loader variant="page" className="min-h-screen" />
  </div>
);

export default function AppLayout({ children }) {
  const { authLoading, authenticated, user, SERVER_URL } = useContext(DataContext);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  // The submission queue lives across language changes; read the current t when it reports.
  const tRef = useRef(t);
  tRef.current = t;
  const router = useRouter();
  const pathname = usePathname();
  // For the course pages' Back button (lib/inAppHistory.js).
  useTrackPages();
  // Learners: a welcome when they come back after a while.
  useWelcomeBack();
  // What was loaded before is shown at once after a reload, then checked with the box.
  usePersistedCache(authenticated && !authLoading ? user?.id : null);
  // The app's own files kept on the device (public/sw.js). Not in development: it would keep
  // stale builds around while the code changes.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  const explore = isExploreRoute(pathname);
  const guest = !authLoading && !authenticated;

  // Guests may explore; anything else sends them to sign in, and back here afterwards.
  useEffect(() => {
    if (guest && !explore) {
      startRouteLoading();
      router.replace(loginUrlWithNext(window.location.pathname + window.location.search));
    }
  }, [guest, explore, router]);

  // Accounts with a temporary password (made or reset by an admin) must change it first. The
  // backend enforces this too; this just avoids a screen full of errors. Teachers manage their
  // account in Teacher Settings, so they're sent there from /account too.
  useEffect(() => {
    if (authLoading || !authenticated) return;
    const target = accountPage(user?.role);
    if ((user?.mustChangePassword || pathname === "/account") && pathname !== target) {
      startRouteLoading();
      router.replace(target);
    }
  }, [authLoading, authenticated, user, pathname, router]);

  // Learners' assignment submissions that couldn't reach the box are retried from here. Only
  // the assignment page queues anything, and only for someone who is a learner in that course
  // (any account can be), so this runs for every signed-in user and is idle when nothing waits.
  const learnerId = authenticated ? user?.id ?? null : null;
  useEffect(() => {
    if (!learnerId) return undefined;
    return startSubmissionQueue(SERVER_URL, learnerId, {
      onSent: (entry) => {
        showToast(tRef.current("shell.toasts.workSent"), "success");
        // The work is on the box now: what shows it (the assignment, grades, what's due) reloads.
        queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(entry.courseId, `assignments/${entry.assignmentId}`) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assignmentSummary });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      },
      onRefused: (_entry, message) => showToast(message, "error", 8000),
    });
  }, [learnerId, SERVER_URL, showToast, queryClient]);

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
      <CelebrationHost />
    </GuestGateProvider>
  );
}
