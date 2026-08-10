"use client"
import Nav from "@/components/global/Nav";
import MandatoryProfileSetupModal from "@/components/onboarding/MandatoryProfileSetupModal";
import DataContext from "@/context/DataContext";
import { useContext, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppLayout({ children }) {
  const { authLoading, authenticated } = useContext(DataContext);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !authenticated) {
      router.replace("/");
    }
  }, [authLoading, authenticated, router]);

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
      <div className="md:ml-[180px] w-full h-full global-horizontal-padding bg-[#EFEFEF] dark:bg-[#080B0F]">
        {children}
      </div>
      <MandatoryProfileSetupModal />
    </>
  );
}