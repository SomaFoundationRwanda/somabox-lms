"use client";

import { useContext, useState } from "react";
import { BellRing, Megaphone, Send, ShieldAlert, X } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";

export default function SendNotificationModal({ isOpen, onClose }) {
    const { SERVER_URL, unshiftString } = useContext(DataContext);
    const { showToast } = useToast();

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
            showToast("Notification title and message are required", "error");
            return;
        }

        const storedEmail = localStorage.getItem("al");
        const senderEmail = storedEmail ? unshiftString(storedEmail) : "";

        if (!senderEmail) {
            showToast("Admin session email not found. Please log in again.", "error");
            return;
        }

        try {
            setSending(true);
            const res = await fetch(`${SERVER_URL}/notifications/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    senderEmail,
                    targetRole,
                    targetEmail: targetRole === "specific" ? targetEmail : undefined,
                    title: title.trim(),
                    message: message.trim(),
                    type,
                    link: link.trim() || null
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to send notification");

            showToast(data.message || "Notification sent successfully!", "success");
            setTitle("");
            setMessage("");
            setLink("");
            setTargetEmail("");
            onClose();
        } catch (err) {
            showToast(err.message || "Failed to broadcast notification", "error");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#0f1318] border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                
                {/* Header */}
                <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300">
                            <Megaphone size={16} />
                        </div>
                        <div>
                            <h3 className="text-sm font-extrabold tracking-tight">Admin Notification Broadcast</h3>
                            <p className="text-[10px] text-slate-500 font-medium">Send announcements to students, teachers & admins</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSend} className="p-6 space-y-4">
                    
                    {/* Target Recipient Selection */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Target Recipients</label>
                        <select
                            value={targetRole}
                            onChange={(e) => setTargetRole(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 text-xs font-semibold text-slate-900 bg-white outline-none focus:border-accent-dark"
                        >
                            <option value="all">All Users (Students, Teachers & Admins)</option>
                            <option value="scholar">All Students (Scholars)</option>
                            <option value="teacher">All Teachers & M&E Officers</option>
                            <option value="admin">All System Admins</option>
                            <option value="specific">Specific User Email</option>
                        </select>
                    </div>

                    {/* Specific User Email Input */}
                    {targetRole === "specific" && (
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Recipient Email Address</label>
                            <input
                                type="email"
                                placeholder="student@example.com"
                                value={targetEmail}
                                onChange={(e) => setTargetEmail(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-500 bg-white outline-none focus:border-accent-dark"
                                required
                            />
                        </div>
                    )}

                    {/* Notification Type */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Notification Priority / Category</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 text-xs font-semibold text-slate-900 bg-white outline-none focus:border-accent-dark"
                        >
                            <option value="announcement">System Announcement</option>
                            <option value="reminder">Activity / Profile Reminder</option>
                            <option value="alert">Urgent Alert</option>
                        </select>
                    </div>

                    {/* Title */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Notification Title</label>
                        <input
                            type="text"
                            placeholder="e.g. New Learning Materials Released!"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-500 bg-white outline-none focus:border-accent-dark"
                            required
                        />
                    </div>

                    {/* Message */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Message Content</label>
                        <textarea
                            rows={3}
                            placeholder="Type notification details here..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full p-3 rounded-xl border-2 border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-500 bg-white outline-none focus:border-accent-dark"
                            required
                        />
                    </div>

                    {/* Optional Link */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Action Redirect Link (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. /library or /account"
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-500 bg-white outline-none focus:border-accent-dark"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={sending}
                            className="px-5 h-10 rounded-xl bg-accent-dark hover:bg-slate-900 text-white text-xs font-extrabold flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
                        >
                            <Send size={13} />
                            {sending ? "Broadcasting…" : "Send Notification"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
