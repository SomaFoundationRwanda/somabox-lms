"use client";

import { useState } from "react";
import { BellRing, Megaphone, Send, ShieldAlert, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { Field, Select, TextInput, Textarea } from "@/components/form";

export default function SendNotificationModal({ isOpen, onClose }) {
    const { showToast } = useToast();
    const { t } = useLanguage();

    const [targetRole, setTargetRole] = useState("all");
    const [targetEmail, setTargetEmail] = useState("");
    const [type, setType] = useState("announcement");
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [link, setLink] = useState("");
    const [sending, setSending] = useState(false);

    if (!isOpen) return null;

    const handleSend = async (e) => {
        e.preventDefault();
        if (!title.trim() || !message.trim()) {
            showToast(t("shell.broadcast.required"), "error");
            return;
        }

        try {
            setSending(true);
            const data = await apiFetch("/notifications/send", {
                method: "POST",
                json: {
                    targetRole,
                    targetEmail: targetRole === "specific" ? targetEmail : undefined,
                    title: title.trim(),
                    message: message.trim(),
                    type,
                    link: link.trim() || null
                },
            });

            showToast(data.message || t("shell.broadcast.sent"), "success");
            setTitle("");
            setMessage("");
            setLink("");
            setTargetEmail("");
            onClose();
        } catch (err) {
            showToast(err?.body?.message || (err?.status === 0 ? getErrorMessage(err, t) : t("shell.broadcast.sendFailed")), "error");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-scrim backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-surface-raised border-2 border-line-strong rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                
                {/* Header */}
                <div className="dark px-6 py-4 bg-surface text-fg flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center text-brand-fg">
                            <Megaphone size={16} />
                        </div>
                        <div>
                            <h3 className="text-ui font-extrabold tracking-tight">{t("shell.broadcast.title")}</h3>
                            <p className="text-caption text-fg-subtle font-medium">{t("shell.broadcast.subtitle")}</p>
                        </div>
                    </div>
                    <button aria-label={t("shell.common.close")}
                        onClick={onClose}
                        className="text-fg-muted hover:text-fg transition-colors p-1 rounded-lg hover:bg-surface-hover"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSend} className="p-6 space-y-4">
                    
                    {/* Target Recipient Selection */}
                    <Field label={t("shell.broadcast.recipients")}>
                        <Select
                            value={targetRole}
                            onChange={(e) => setTargetRole(e.target.value)}
                        >
                            <option value="all">{t("shell.broadcast.toAll")}</option>
                            <option value="scholar">{t("shell.broadcast.toLearners")}</option>
                            <option value="teacher">{t("shell.broadcast.toTeachers")}</option>
                            <option value="admin">{t("shell.broadcast.toAdmins")}</option>
                            <option value="specific">{t("shell.broadcast.toEmail")}</option>
                        </Select>
                    </Field>

                    {/* Specific User Email Input */}
                    {targetRole === "specific" && (
                        <Field label={t("shell.broadcast.recipientEmail")}>
                            <TextInput
                                type="email"
                                placeholder={t("shell.broadcast.emailPlaceholder")}
                                value={targetEmail}
                                onChange={(e) => setTargetEmail(e.target.value)}
                                required
                            />
                        </Field>
                    )}

                    {/* Notification Type */}
                    <Field label={t("shell.broadcast.category")}>
                        <Select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                        >
                            <option value="announcement">{t("shell.broadcast.announcement")}</option>
                            <option value="reminder">{t("shell.broadcast.reminder")}</option>
                            <option value="alert">{t("shell.broadcast.alert")}</option>
                        </Select>
                    </Field>

                    {/* Title */}
                    <Field label={t("shell.broadcast.titleLabel")}>
                        <TextInput
                            placeholder={t("shell.broadcast.titlePlaceholder")}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </Field>

                    {/* Message */}
                    <Field label={t("shell.broadcast.message")}>
                        <Textarea
                            rows={3}
                            placeholder={t("shell.broadcast.messagePlaceholder")}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                        />
                    </Field>

                    {/* Optional Link */}
                    <Field label={t("shell.broadcast.link")}>
                        <TextInput
                            placeholder={t("shell.broadcast.linkPlaceholder")}
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                        />
                    </Field>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 h-10 rounded-xl bg-surface-sunken hover:bg-surface-hover text-caption font-bold text-fg-muted transition-colors"
                        >
                            {t("shell.common.cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={sending}
                            className="px-5 h-10 rounded-xl bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-caption font-extrabold flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
                        >
                            <Send size={13} />
                            {sending ? t("shell.broadcast.sending") : t("shell.broadcast.send")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
