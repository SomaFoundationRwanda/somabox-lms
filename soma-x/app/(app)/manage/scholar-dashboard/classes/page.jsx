"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, GraduationCap, Hash, Plus, X } from "lucide-react";
import DataContext from "@/context/DataContext";
import Input from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ScholarClassesPage() {
  const { authenticated, role, unshiftString, SERVER_URL, isDark } = useContext(DataContext);
  const router = useRouter();
  const ACCENT = isDark ? "#0D9488" : "#203A3A";

  const [classCode, setClassCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(false);
  const [joinedClasses, setJoinedClasses] = useState([]);
  const [joinError, setJoinError] = useState("");
  const [joinPanelOpen, setJoinPanelOpen] = useState(false);

  const currentRole = useMemo(() => {
    if (!role) return "";
    return unshiftString(role);
  }, [role, unshiftString]);

  const [scholarEmail, setScholarEmail] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("al");
    setScholarEmail(stored ? unshiftString(stored) : "");
  }, [unshiftString]);

  const loadClasses = async () => {
    if (!SERVER_URL || !scholarEmail) return;
    try {
      setLoading(true);
      const response = await fetch(`${SERVER_URL}/classes/mine?scholarEmail=${encodeURIComponent(scholarEmail)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to load classes");
      setJoinedClasses(payload);
    } catch (error) {
      console.error("Failed to load classes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated && currentRole === "scholar") loadClasses();
  }, [authenticated, currentRole, SERVER_URL, scholarEmail]);

  const handleJoinClass = async () => {
    setJoinError("");
    const normalizedCode = classCode.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setJoinError("Please enter a valid 6-digit class code.");
      return;
    }
    if (!scholarEmail) {
      setJoinError("Scholar identity missing. Please log in again.");
      return;
    }
    try {
      setJoining(true);
      const response = await fetch(`${SERVER_URL}/classes/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classCode: normalizedCode, scholarEmail }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to join class");
      setClassCode("");
      setJoinPanelOpen(false);
      await loadClasses();
    } catch (error) {
      console.error("Failed to join class:", error);
      setJoinError(error.message || "Failed to join class");
    } finally {
      setJoining(false);
    }
  };

  useEffect(() => {
    if (authenticated && currentRole && currentRole !== "scholar") router.replace("/");
  }, [authenticated, currentRole, router]);

  if (!authenticated || currentRole !== "scholar") return null;

  return (
    <div className="min-h-screen pb-24 md:pb-8">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between pl-12 pr-4 md:px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-10 rounded-b-[5px]">
        <div>
          <h1 className="text-[16px] sm:text-[18px] font-black text-slate-900 leading-tight">My Classes</h1>
          <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">Manage and join your classes</p>
        </div>
        <button
          type="button"
          onClick={() => setJoinPanelOpen(v => !v)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-[5px] text-[12px] font-bold text-white transition-colors"
          style={{ backgroundColor: ACCENT }}
        >
          {joinPanelOpen ? <X size={13} /> : <Plus size={13} />}
          {joinPanelOpen ? "Close" : "Join Class"}
        </button>
      </div>

      {/* ── Join class panel (mobile collapsible) ── */}
      {joinPanelOpen && (
        <div className="mx-3 mt-3 bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[13px] font-bold text-slate-800">Join a Class</p>
          <Input
            id="class-code-mobile"
            placeholder="Enter 6-digit class code"
            value={classCode}
            onChange={(value) => setClassCode(value)}
            className="h-11 rounded-xl bg-slate-50 border border-slate-200"
          />
          {joinError && <p className="text-[11px] text-red-600 font-medium">{joinError}</p>}
          <Button
            className="w-full h-9 text-[12px] font-bold rounded-xl text-white"
            onClick={handleJoinClass}
            disabled={joining || loading}
            style={{ backgroundColor: ACCENT }}
          >
            {joining ? "Joining…" : "Join Class"}
          </Button>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="p-3 sm:p-5">
        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">

          {/* Desktop aside — join panel */}
          <aside className="hidden xl:flex flex-col bg-white border border-slate-200 rounded-2xl p-5 h-fit space-y-4 shadow-sm">
            <div>
              <p className="text-[14px] font-black text-slate-800">Join a Class</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Enter your 6-digit class code to enroll.</p>
            </div>
            <Input
              id="class-code"
              placeholder="e.g. 482913"
              value={classCode}
              onChange={(value) => setClassCode(value)}
              className="h-11 rounded-xl bg-slate-50 border border-slate-200"
            />
            {joinError && <p className="text-[11px] text-red-600 font-medium">{joinError}</p>}
            <Button
              className="w-full h-10 text-[13px] font-bold rounded-xl text-white"
              onClick={handleJoinClass}
              disabled={joining || loading}
              style={{ backgroundColor: ACCENT }}
            >
              {joining ? "Joining…" : "Join Class"}
            </Button>
          </aside>

          {/* Class cards grid */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={15} style={{ color: ACCENT }} />
              <p className="text-[14px] font-black text-slate-800">My Classes</p>
              {!loading && (
                <span className="ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500">
                  {joinedClasses.length} {joinedClasses.length === 1 ? "class" : "classes"}
                </span>
              )}
            </div>

            {loading ? (
              /* Skeleton cards */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="w-full h-44 bg-slate-100 animate-pulse" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                      <div className="h-9 bg-slate-100 rounded-xl animate-pulse mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : joinedClasses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <GraduationCap className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-[14px] font-bold text-slate-400">No classes joined yet</p>
                <p className="text-[12px] text-slate-300 mt-1">Use the join panel to add your first class</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {joinedClasses.map((cls) => (
                  <div
                    key={cls.id}
                    className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {/* Cover image */}
                    <Link href={`/manage/scholar-dashboard/lessons?classId=${cls.id}`}>
                      <div className="w-full h-44 bg-slate-100 relative cursor-pointer overflow-hidden">
                        <Image
                          src={cls.cover_image ? `${SERVER_URL}/class-covers/${cls.cover_image}` : "/imageFallback.png"}
                          alt={cls.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                        />
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                      </div>
                    </Link>

                    {/* Card body */}
                    <div className="p-4">
                      <Link href={`/manage/scholar-dashboard/lessons?classId=${cls.id}`}>
                        <p className="text-[15px] font-bold text-slate-800 mb-1 hover:text-[#203A3A] transition-colors cursor-pointer line-clamp-1">
                          {cls.name}
                        </p>
                      </Link>
                      <div className="flex items-center gap-2 flex-wrap mb-4">
                        {cls.grade && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            {cls.grade}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Hash size={10} />
                          {cls.id}
                        </span>
                      </div>

                      {/* Action button */}
                      <Link href={`/manage/scholar-dashboard/lessons?classId=${cls.id}`}>
                        <button
                          type="button"
                          className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          View Lessons
                          <ChevronRight size={13} />
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
