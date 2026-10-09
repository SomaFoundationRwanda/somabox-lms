"use client";

// The logo at the top of the app: the school's own logo when the admin has uploaded one
// (School page), otherwise SOMABOX's. variant="full" is the wide logo, "mark" the small square one.
import Image from "next/image";
import { useSchool } from "@/context/SchoolContext";
import { useLanguage } from "@/context/LanguageContext";

export default function SchoolLogo({ variant = "full", className = "", priority = false, decorative = false }) {
    const { school, logoSrc } = useSchool();
    const alt = decorative ? "" : (school.name || "SomaBox");

    if (logoSrc) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={logoSrc}
                alt={alt}
                className={`object-contain ${className || (variant === "mark" ? "w-8 h-8" : "w-auto h-12 max-w-full")}`}
                decoding="async"
            />
        );
    }

    return variant === "mark" ? (
        <Image src="/schoolLogo/somabox-logo-dark.webp" alt={decorative ? "" : "SomaBox"} width={32} height={32}
            className={`object-contain ${className || "w-8 h-8"}`} priority={priority} />
    ) : (
        <Image src="/schoolLogo/somabox.png" alt={decorative ? "" : "SomaBox"} width={160} height={55}
            className={`object-contain ${className || "w-auto h-12"}`} priority={priority} />
    );
}

/** "Powered by SOMABOX", shown when the school's own logo replaces SOMABOX's. */
export function PoweredBySomabox({ className = "", tone = "muted" }) {
    const { logoSrc } = useSchool();
    const { t } = useLanguage();
    if (!logoSrc) return null;
    const colour = tone === "light" ? "text-white/70" : "text-slate-500 dark:text-slate-400";
    return (
        <p className={`text-[10px] font-semibold tracking-wide ${colour} ${className}`}>
            {t("school.brand.poweredBy")}
        </p>
    );
}

/** The logo on the coloured panel of the login and sign-up pages. */
export function AuthPanelLogo() {
    const { school, logoSrc } = useSchool();
    if (!logoSrc) {
        return (
            <Image src="/schoolLogo/somabox.png" alt="SomaBox" width={160} height={55}
                className="w-auto h-14 md:h-20 object-contain" style={{ filter: "brightness(0) invert(1)" }} priority />
        );
    }
    // The school's logo keeps its own colours on a white card.
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoSrc} alt={school.name || "SomaBox"} className="w-auto h-14 md:h-20 max-w-[220px] object-contain" />
            </div>
            <PoweredBySomabox tone="light" />
        </div>
    );
}
