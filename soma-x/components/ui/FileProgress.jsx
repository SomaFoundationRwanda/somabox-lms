"use client";

// How far a book or document has downloaded (useFileDownload): the SOMABOX loader, "Opening… 42%"
// and a bar, so people on slow devices can see they only need to wait.
import Loader from "@/components/ui/Loader";
import formatSize from "@/components/helpers/formatSize";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

export default function FileProgress({ percent, received = 0, tone = "light" }) {
    const { t } = useLanguage();
    const dark = tone === "dark";
    const known = Number.isFinite(percent);
    const text = known
        ? fill(t("shell.player.loadingPercent"), { percent })
        : fill(t("shell.player.loadingSize"), { size: formatSize(received) });

    return (
        <div className="w-full h-full min-h-[14rem] flex flex-col items-center justify-center gap-4 p-6">
            <Loader size={64} color={dark ? "#ffffff" : undefined} label={text} />
            <p className={`text-ui font-semibold tabular-nums ${dark ? "text-white" : "text-fg"}`} aria-hidden="true">{text}</p>
            {known ? (
                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label={text}
                    className={`w-56 max-w-full h-2 rounded-full overflow-hidden ${dark ? "bg-white/20" : "bg-surface-hover"}`}
                >
                    <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${percent}%` }} />
                </div>
            ) : null}
        </div>
    );
}
