"use client"
import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Palette, School } from "lucide-react";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import { Button } from "@/components/ui/button";
import { getUnitBranding, saveUnitBranding } from "@/lib/analytics-service";

export default function BrandingSettingsPage() {
    const { SERVER_URL, authenticated, role, user } = useContext(DataContext);
    const userRole = role || '';
    const [branding, setBranding] = useState({
        school_name: "SOMABOX Partner School",
        logo_url: "",
        primary_color: "#203A3A",
        secondary_color: "#0D9488",
        me_sync_url: ""
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");

    useEffect(() => {
        if (!SERVER_URL || userRole !== 'admin') return;
        const load = async () => {
            const data = await getUnitBranding(SERVER_URL);
            if (data) setBranding(data);
            setLoading(false);
        };
        load();
    }, [SERVER_URL, userRole]);

    if (!authenticated || userRole !== 'admin') {
        return <Unauthorized />;
    }

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMsg("");
        const res = await saveUnitBranding(SERVER_URL, {
            schoolName: branding.school_name,
            logoUrl: branding.logo_url,
            primaryColor: branding.primary_color,
            secondaryColor: branding.secondary_color,
            meSyncUrl: branding.me_sync_url
        });
        setSaving(false);
        setMsg(res.message || "Branding updated!");
        setTimeout(() => setMsg(""), 4000);
    };

    if (loading) {
        return <div className="p-8 text-center text-xs text-slate-600">Loading Unit Branding Settings...</div>;
    }

    return (
        <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto pb-16">
            <div className="flex items-center justify-between mb-6">
                <Link href="/manage/admin" className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Admin Console
                </Link>
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800">
                    Mass-Production Unit Branding
                </span>
            </div>

            <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="p-3 bg-[#203A3A] text-white rounded-2xl">
                        <Palette className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-900 dark:text-white">School-Specific Branding Configuration</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Customize logo, colors, and M&E sync endpoints for deployed SOMABOX hardware units.</p>
                    </div>
                </div>

                {msg && (
                    <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-2">
                        <Check className="w-4 h-4" /> {msg}
                    </div>
                )}

                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            School / Partner Name
                        </label>
                        <input
                            type="text"
                            value={branding.school_name || ''}
                            onChange={(e) => setBranding(p => ({ ...p, school_name: e.target.value }))}
                            className="w-full text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold"
                            placeholder="e.g. Kigali Science Academy"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            School Logo Image URL
                        </label>
                        <input
                            type="text"
                            value={branding.logo_url || ''}
                            onChange={(e) => setBranding(p => ({ ...p, logo_url: e.target.value }))}
                            className="w-full text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
                            placeholder="https://example.com/logo.png"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Primary Theme Color
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={branding.primary_color || '#203A3A'}
                                    onChange={(e) => setBranding(p => ({ ...p, primary_color: e.target.value }))}
                                    className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                                />
                                <input
                                    type="text"
                                    value={branding.primary_color || '#203A3A'}
                                    onChange={(e) => setBranding(p => ({ ...p, primary_color: e.target.value }))}
                                    className="w-full text-xs p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Secondary Accent Color
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={branding.secondary_color || '#0D9488'}
                                    onChange={(e) => setBranding(p => ({ ...p, secondary_color: e.target.value }))}
                                    className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                                />
                                <input
                                    type="text"
                                    value={branding.secondary_color || '#0D9488'}
                                    onChange={(e) => setBranding(p => ({ ...p, secondary_color: e.target.value }))}
                                    className="w-full text-xs p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            M&E Ambassador Sync URL
                        </label>
                        <input
                            type="text"
                            value={branding.me_sync_url || ''}
                            onChange={(e) => setBranding(p => ({ ...p, me_sync_url: e.target.value }))}
                            className="w-full text-xs p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono"
                            placeholder="https://me.somabox.org/api/sync"
                        />
                    </div>

                    {/* Preview Box */}
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 mt-4" style={{ backgroundColor: branding.primary_color || '#203A3A' }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1">Branding Preview</p>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-xs" style={{ backgroundColor: branding.secondary_color || '#0D9488' }}>
                                <School className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-black text-white">{branding.school_name || 'SOMABOX Partner School'}</span>
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                        <Button
                            type="submit"
                            disabled={saving}
                            className="bg-[#203A3A] hover:bg-[#162727] text-white text-xs font-extrabold px-8 h-10 rounded-xl"
                        >
                            {saving ? 'Saving...' : 'Save Branding Settings'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
