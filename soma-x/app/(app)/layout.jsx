"use client"
import Nav from "@/components/global/Nav";
import Header from "@/components/global/Header";
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import DataContext from "@/context/DataContext";
import { useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AppLayout({ children }) {
  const { authLoading, authenticated, user } = useContext(DataContext);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace("/");
    }
  }, [authLoading, authenticated, router]);

  // Accounts flagged by the server (e.g. the default admin) must change their password
  // first. The backend enforces this too; this just avoids a screen full of errors.
  useEffect(() => {
    if (authLoading || !authenticated) return;
    if (user?.mustChangePassword && pathname !== "/account") router.replace("/account");
  }, [authLoading, authenticated, user, pathname, router]);

  if (authLoading || !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EFEFEF]">
        <div className="w-8 h-8 rounded-full border-[3px] border-slate-200 border-t-[#203A3A] animate-spin" />
      </div>
    );
  }

  return (
    <>
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
    </>
  );
}