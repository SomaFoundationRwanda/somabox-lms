"use client";

// "This box": the hardware identity sent to the cloud with every sync (GET /sync/status → device).
// source "script": scripts/linux/somabox-device-info.sh ran as root and wrote /etc/somabox/device.json
// (so the serial number is known). source "server": it hasn't, so only what the server can read.
import { Cpu, Info } from "lucide-react";
import { Section } from "@/components/layout";
import formatSize from "@/components/helpers/formatSize";
import { useLanguage } from "@/context/LanguageContext";

function Row({ label, children }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
            <dt className="sm:w-40 shrink-0 text-xs font-bold text-slate-600 dark:text-slate-400">{label}</dt>
            <dd className="min-w-0 text-sm text-slate-900 dark:text-slate-100 break-words">{children}</dd>
        </div>
    );
}

const mono = "font-mono text-[13px] select-all break-all";

export default function DeviceCard({ device }) {
    const { t } = useLanguage();
    if (!device) return null;
    const fromScript = device.source === "script";
    const macs = Array.isArray(device.macAddresses) ? device.macAddresses : [];
    const none = <span className="text-slate-500">{t("school.device.unknown")}</span>;
    const size = (n) => {
        try { return formatSize(n); } catch { return String(n); }
    };

    return (
        <Section divided title={t("school.device.title")} description={t("school.device.description")}>
            <div className="space-y-4">
                {!fromScript ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-100" role="note">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                        <div className="space-y-1.5">
                            <p>{t("school.device.noSerial")}</p>
                            <code className="block rounded bg-white/70 dark:bg-black/30 px-2 py-1 font-mono text-[13px] break-all">sudo scripts/linux/somabox-device-info.sh</code>
                            <p>{t("school.device.enableService")}</p>
                            <code className="block rounded bg-white/70 dark:bg-black/30 px-2 py-1 font-mono text-[13px] break-all">sudo systemctl enable somabox-device-info.service</code>
                        </div>
                    </div>
                ) : null}

                <dl>
                    <Row label={t("school.device.serial")}>{device.serialNumber ? <span className={mono}>{device.serialNumber}</span> : none}</Row>
                    <Row label={t("school.device.model")}>{device.model || none}</Row>
                    <Row label={t("school.device.mac")}>
                        {macs.length ? (
                            <ul className="space-y-0.5">
                                {macs.map((m, i) => (
                                    <li key={`${m.interface}-${m.mac}-${i}`}>
                                        <span className="font-semibold">{m.interface}</span>{" "}
                                        <span className={mono}>{m.mac}</span>
                                        {m.physical === false ? <span className="text-xs text-slate-500"> ({t("school.device.virtual")})</span> : null}
                                    </li>
                                ))}
                            </ul>
                        ) : none}
                    </Row>
                    <Row label={t("school.device.machineId")}>{device.machineId ? <span className={mono}>{device.machineId}</span> : none}</Row>
                    <Row label={t("school.device.hostname")}>{device.hostname ? <span className={mono}>{device.hostname}</span> : none}</Row>
                    <Row label={t("school.device.os")}>
                        {[device.os, device.kernel, device.arch].filter(Boolean).join(" · ") || none}
                    </Row>
                    {device.memoryBytes || device.diskBytes ? (
                        <Row label={t("school.device.hardware")}>
                            {[device.memoryBytes ? `${t("school.device.memory")} ${size(device.memoryBytes)}` : null,
                              device.diskBytes ? `${t("school.device.disk")} ${size(device.diskBytes)}` : null].filter(Boolean).join(" · ")}
                        </Row>
                    ) : null}
                    <Row label={t("school.device.source")}>
                        <span className="inline-flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            {fromScript ? t("school.device.sourceScript") : t("school.device.sourceServer")}
                            {fromScript && device.collectedAt ? (
                                <span className="text-xs text-slate-500">
                                    {" "}({new Date(device.collectedAt).toLocaleString()})
                                </span>
                            ) : null}
                        </span>
                    </Row>
                </dl>
            </div>
        </Section>
    );
}
