"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import AvatarFallback from "./AvatarFallBack";
import { clickableProps } from "@/lib/a11y";

const sizeClasses = {
  xsmall: "w-7 h-7",
  small: "w-12 h-12 md:w-14 md:h-14",
  medium: "w-16 h-16 sm:w-20 sm:h-20",
  large: "w-20 h-20 sm:w-24 sm:h-24 lg:w-[100px] lg:h-[100px]"
};

export default function Avatar({
  src,
  size = "small",
  alt,
  isLoggedIn = false,
  showStatus = false,
  onClick
}) {
  const [error, setError] = useState(false);
  const t = useLanguage()?.t;
  alt = alt ?? (t?.("shell.common.profileImage") ?? "Profile image");

  return (
    <div className="relative flex-shrink-0 group">
      {/* Outer ring container */}
      <div
        className={`rounded-full overflow-hidden flex items-center justify-center shadow-sm border-2 border-white transition-all duration-300 hover:border-accent-blue cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)] ${sizeClasses[size]}`}
        {...(onClick ? clickableProps(onClick, alt || "Profile") : {})}
      >
        {src && !error ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover rounded-full"
            onError={() => setError(true)}
          />
        ) : (
          <AvatarFallback />
        )}
      </div>

      {/* Online status dot */}
      {isLoggedIn && showStatus && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-accent-yellow border-2 border-white rounded-full"></div>
      )}
    </div>
  );
}
