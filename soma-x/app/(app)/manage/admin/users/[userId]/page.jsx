"use client";

import { useEffect, useState, useContext } from "react";
import { useParams, useRouter } from "next/navigation";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import {
    ArrowLeft, Building2, Calendar, CheckCircle2, Globe2, GraduationCap,
    Mail, MapPin, Phone, User, Activity, BrainCircuit
} from "lucide-react";
import Link from "next/link";

function getInitials(name, email) {
    if (name?.trim()) return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (email?.[0] || "?").toUpperCase();
}

function formatDate(raw) {
    if (!raw) return "Not specified";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "Not specified";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function UserProfilePage() {
    const params = useParams();
    const router = useRouter();
    const { SERVER_URL, isDark } = useContext(DataContext);
    const { t } = useLanguage();
    
    const [user, setUser] = useState(null);
    const [classes, setClasses] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [spacedPractice, setSpacedPractice] = useState(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const dm = isDark;
    const userId = params.userId;

    useEffect(() => {
        async function fetchUserData() {
            try {
                setLoading(true);
                // 1. Fetch User Data
                const userRes = await fetch(`${SERVER_URL}/users/${userId}`);
                if (!userRes.ok) throw new Error("Failed to fetch user details");
                const userData = await userRes.json();
                setUser(userData);

                // 2. If Scholar, fetch enrolled classes & analytics
                if (userData.role === "scholar") {
                    const emailParam = encodeURIComponent(userData.email);
                    
                    const [classesRes, analyticsRes, spacedRes] = await Promise.all([
                        fetch(`${SERVER_URL}/courses/mine?userEmail=${emailParam}`).catch(() => null),
                        fetch(`${SERVER_URL}/analytics/sol-outcomes?scholarEmail=${emailParam}`).catch(() => null),
                        fetch(`${SERVER_URL}/sol/spaced/pending?scholarEmail=${emailParam}`).catch(() => null)
                    ]);

                    if (classesRes && classesRes.ok) {
                        const classesData = await classesRes.json();
                        setClasses(Array.isArray(classesData) ? classesData : []);
                    }
                    
                    if (analyticsRes && analyticsRes.ok) {
                        const analyticsData = await analyticsRes.json();
                        setAnalytics(analyticsData);
                    }

                    if (spacedRes && spacedRes.ok) {
                        const spacedData = await spacedRes.json();
                        setSpacedPractice(spacedData.pendingReviews || []);
                    }
                }
                
                setError(null);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        
        if (userId) fetchUserData();
    }, [userId, SERVER_URL]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="text-center py-12">
                <p className="text-rose-500 font-bold mb-4">{error || "User not found"}</p>
                <button onClick={() => router.push("/manage/admin")} className="px-4 py-2 bg-slate-200 rounded-lg text-sm font-semibold">
                    Go Back
                </button>
            </div>
        );
    }

    const isInactive = user.is_active === 0;
    const initials = getInitials(user.full_name, user.email);
    const joined = formatDate(user.created_at);

    const roleColors = {
        admin: { bg: "bg-purple-100 dark:bg-purple-950/60", text: "text-purple-700 dark:text-purple-300", border: "border-purple-300 dark:border-purple-800" },
        teacher: { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-800" },
        scholar: { bg: "bg-sky-100 dark:bg-sky-950/60", text: "text-sky-700 dark:text-sky-300", border: "border-sky-300 dark:border-sky-800" },
    };
    const roleStyle = roleColors[user.role] || roleColors.scholar;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-12 animate-in fade-in duration-300 pt-4 px-4 sm:px-6">
            {/* Header Section */}
            <div className="bg-white dark:bg-[#0E1117] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                {/* Banner */}
                <div className="h-32 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 relative">
                    <button 
                        onClick={() => router.push("/manage/admin?tab=users")}
                        className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-colors text-sm font-semibold"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Users
                    </button>
                </div>
                
                {/* Profile Header Content */}
                <div className="px-8 pb-8 relative">
                    <div className="flex flex-col sm:flex-row items-start gap-6 -mt-12">
                        <div className="w-24 h-24 rounded-2xl bg-teal-600 border-4 border-white dark:border-[#0E1117] flex items-center justify-center text-white text-3xl font-black shadow-xl shrink-0 z-10">
                            {initials}
                        </div>
                        <div className="flex-1 pt-14 sm:pt-14 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full">
                            <div>
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                                    {user.full_name || "Unnamed User"}
                                    {isInactive && (
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase">
                                            Inactive
                                        </span>
                                    )}
                                </h1>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-teal-500" />
                                    {user.email}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
                                    {t(`role.${user.role}`) || user.role}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Demographics & Contact */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-[#0E1117] rounded-3xl border border-slate-200 dark:border-slate-800 p-6">
                        <h3 className="text-sm font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-2 mb-4">
                            <User className="w-4 h-4" /> Personal & Contact Info
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Phone Number</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                                    <Phone className="w-4 h-4 text-slate-600" />
                                    {user.phone || "Not specified"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Gender Identity</p>
                                <p className="text-sm font-semibold capitalize text-slate-900 dark:text-white mt-1">
                                    {user.gender && user.gender !== "prefer_not_to_say" ? user.gender.replace("_", " ") : "Not specified"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Preferred Language</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                                    <Globe2 className="w-4 h-4 text-slate-600" />
                                    {user.preferred_language ? user.preferred_language.toUpperCase() : "English"}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#0E1117] rounded-3xl border border-slate-200 dark:border-slate-800 p-6">
                        <h3 className="text-sm font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-2 mb-4">
                            <GraduationCap className="w-4 h-4" /> Academic & Location
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">School / Institution</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                                    <Building2 className="w-4 h-4 text-slate-600" />
                                    {user.school_name || "Not assigned"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Grade / Class Level</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                                    {user.grade_level || "Not specified"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Province & District</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                                    <MapPin className="w-4 h-4 text-slate-600" />
                                    {user.region_province || "N/A"}, {user.region_district || "N/A"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Location Type</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1">
                                    {user.is_rural === 1 ? "Rural Learner" : "Urban / Semi-urban"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Disability Status</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-1 capitalize">
                                    {user.disability_status || "None"}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase">Date Joined</p>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mt-1">
                                    <Calendar className="w-4 h-4 text-slate-600" />
                                    {joined}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Classes, Analytics, Demo Info */}
                <div className="lg:col-span-2 space-y-6">
                    {user.role === "scholar" && (
                        <>
                            {/* Analytics & Spaced Practice Summary */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-teal-900 to-slate-900 rounded-3xl border border-teal-800/40 p-6 text-white shadow-md relative overflow-hidden">
                                    <BrainCircuit className="absolute -right-4 -bottom-4 w-24 h-24 text-teal-800/30 opacity-50" />
                                    <h3 className="text-sm font-black uppercase tracking-wider text-teal-400 flex items-center gap-2 mb-2 relative z-10">
                                        <Activity className="w-4 h-4" /> Learning Outcomes
                                    </h3>
                                    <div className="relative z-10 mt-4">
                                        <p className="text-3xl font-black">{analytics?.activeTrackedOutcomes || 0}</p>
                                        <p className="text-xs font-medium text-teal-200/70 mt-1">Tracked active outcomes</p>
                                    </div>
                                </div>
                                <div className="bg-white dark:bg-[#0E1117] rounded-3xl border border-slate-200 dark:border-slate-800 p-6">
                                    <h3 className="text-sm font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-2 mb-4">
                                        Spaced Practice Status
                                    </h3>
                                    {spacedPractice?.length > 0 ? (
                                        <ul className="space-y-3">
                                            {spacedPractice.map((sp, idx) => (
                                                <li key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800 dark:text-white">{sp.topic_title}</p>
                                                        <p className="text-[10px] text-slate-500 mt-0.5">Interval: {sp.interval_days} days</p>
                                                    </div>
                                                    <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 rounded-lg text-[10px] font-black uppercase">
                                                        Pending
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-6 text-center">
                                            <CheckCircle2 className="w-8 h-8 text-slate-500 dark:text-slate-700 mb-2" />
                                            <p className="text-sm font-semibold text-slate-800 dark:text-white">All Caught Up!</p>
                                            <p className="text-xs text-slate-500">No pending spaced practice reviews.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Enrolled Classes */}
                            <div className="bg-white dark:bg-[#0E1117] rounded-3xl border border-slate-200 dark:border-slate-800 p-6">
                                <h3 className="text-sm font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-2 mb-4">
                                    Enrolled Courses
                                </h3>
                                {classes.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {classes.map(course => (
                                            <Link key={course.id} href={`/course/${course.id}/home`} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:border-teal-200 dark:hover:border-teal-900 transition-colors block">
                                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{course.title}</h4>
                                                <p className="text-xs font-medium text-slate-500 mt-1 line-clamp-1">{course.description || "No description"}</p>
                                                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                                                    <span>Teacher: {course.created_by_teacher_email}</span>
                                                    {course.grade && <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">{course.grade}</span>}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                        <Building2 className="w-12 h-12 text-slate-500 dark:text-slate-700 mb-3" />
                                        <p className="text-sm font-semibold text-slate-800 dark:text-white">Not enrolled in any courses</p>
                                        <p className="text-xs text-slate-500 max-w-sm mt-1">This student has not joined any active courses yet.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
