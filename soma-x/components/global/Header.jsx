"use client";

import { useContext, useEffect, useState } from "react";
import DataContext from "@/context/DataContext";
import NotificationBellDrawer from "@/components/notifications/NotificationBellDrawer";
import ProfileCard from "@/components/ui/ProfileCard";

// Persistent app-shell header — mounted once in (app)/layout.jsx so it
// renders on every page, not just the dashboard. Shares the sidebar's
// background with no divider (see Nav.jsx) so the two read as one surface.
export default function Header() {
  const { role, unshiftString, isDark } = useContext(DataContext);
  const currentRole = role ? unshiftString(role) : "scholar";
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("un");
    const name = stored ? unshiftString(stored) : "";
    setFirstName(name ? name.split(" ")[0] : "");
  }, [unshiftString]);

  const dm = isDark;
  const bg = dm ? "#080B0F" : "#ffffff";
  const titleColor = dm ? "#E8ECF0" : "#0f172a";
  const subColor = dm ? "#637080" : "#94a3b8";

  const { title, subtitle } =
    currentRole === "admin"
      ? { title: "Admin Portal", subtitle: "Manage system tools, users, and content." }
      : currentRole === "teacher"
      ? { title: "Teacher Portal", subtitle: "" }
      : {
          title: `Welcome On SOMABOX${firstName ? `, ${firstName}` : ""} !`,
          subtitle: "Let's learn something new today!",
        };

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between pl-16 md:pl-4 pr-4 py-3"
      style={{ backgroundColor: bg }}
    >
      <div className="min-w-0">
        <h1
          className="text-[16px] sm:text-[18px] md:text-[20px] font-black leading-tight tracking-tight truncate"
          style={{ color: titleColor }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[11px] mt-0.5 hidden sm:block" style={{ color: subColor }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <NotificationBellDrawer />
        <ProfileCard />
      </div>
    </header>
  );
}
