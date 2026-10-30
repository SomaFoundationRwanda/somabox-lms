"use client";

// One progress bar for every batch of files moving to or from the box (cloud downloads, uploads):
// "Downloading 13 of 20 · 65%", how many bytes, what's on its way, and what failed.
//
//   <TransferProgress kind="download" status="downloading" done={13} total={20} percent={65} />
//
// status: "downloading" | "uploading" (running), "finished", or "failed" (some files didn't make
// it). The download status endpoints (/library/download-status, /cloud/download-status) return
// these fields, so their answer can be passed straight in: <TransferProgress kind="download" {...status} />
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import formatSize from "@/components/helpers/formatSize";

const MAX_NAMES = 3;

function names(list) {
    const shown = list.slice(0, MAX_NAMES).join(", ");
    return list.length > MAX_NAMES ? `${shown} +${list.length - MAX_NAMES}` : shown;
}

export default function TransferProgress({
    kind = "download", status, total = 0, done = 0, downloaded, skipped = 0, failed = 0,
    percent = 0, bytesDone = 0, bytesTotal = 0, current = [], failedNames = [], className = "",
}) {
    const { t } = useLanguage();
    if (!status || status === "init" || !total) return null;

    const running = status === "downloading" || status === "uploading";
    const succeeded = downloaded ?? done - failed - skipped;
    const tone = running ? "info" : failed ? "danger" : "success";
    const styles = {
        info: { box: "bg-info-soft border-info/30 text-info-fg", bar: "bg-info" },
        danger: { box: "bg-danger-soft border-danger/30 text-danger-fg", bar: "bg-danger" },
        success: { box: "bg-success-soft border-success/30 text-success-fg", bar: "bg-success" },
    }[tone];
    const Icon = running ? Loader2 : failed ? AlertCircle : CheckCircle2;
    const headline = running
        ? fill(t(`shell.transfer.${kind === "upload" ? "uploading" : "downloading"}`), { done, total })
        : fill(t(`shell.transfer.${kind === "upload" ? "uploaded" : "downloaded"}`), { done: succeeded + skipped, total });
    const details = [
        bytesTotal > 0 ? fill(t("shell.transfer.size"), { done: formatSize(bytesDone), total: formatSize(bytesTotal) }) : null,
        skipped ? fill(t("shell.transfer.skipped"), { count: skipped }) : null,
        failed ? fill(t("shell.transfer.failed"), { count: failed }) : null,
    ].filter(Boolean);
    const value = Math.max(0, Math.min(100, Math.round(percent)));

    return (
        <div className={`rounded-[5px] border px-3 py-2.5 ${styles.box} ${className}`} aria-live="polite">
            <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 shrink-0 ${running ? "animate-spin" : ""}`} aria-hidden="true" />
                <p className="text-caption font-semibold flex-1 min-w-0">{headline}</p>
                <span className="text-caption font-bold tabular-nums">{value}%</span>
            </div>
            <div
                role="progressbar"
                aria-label={t("shell.transfer.label")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
                className="h-1.5 w-full bg-surface rounded-full mt-2 overflow-hidden"
            >
                <div className={`h-full rounded-full transition-all duration-500 ${styles.bar}`} style={{ width: `${value}%` }} />
            </div>
            {details.length > 0 && <p className="text-caption mt-1.5">{details.join(" · ")}</p>}
            {running && current.length > 0 && (
                <p className="text-caption mt-0.5 truncate">{fill(t("shell.transfer.now"), { names: names(current) })}</p>
            )}
            {!running && failedNames.length > 0 && (
                <p className="text-caption mt-0.5">{fill(t("shell.transfer.notDone"), { names: names(failedNames) })}</p>
            )}
        </div>
    );
}
