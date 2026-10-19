"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, KeyRound, Users } from "lucide-react";
import DataContext from "@/context/DataContext";
import AsyncListState from "@/components/course/AsyncListState";
import { useGuestGate } from "@/components/guest/GuestGate";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { startRouteLoading } from "@/components/global/RouteLoader";

export default function DiscoverCoursesPage() {
  const router = useRouter();
  const { SERVER_URL, user } = useContext(DataContext);
  const [courses, setCourses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joiningId, setJoiningId] = useState(null);
  const { t } = useLanguage();
  // Guests can see public courses; joining one needs an account.
  const { isGuest, requireAccount } = useGuestGate();
  // Back from signing up to join a course: ?join=<id> points it out (joining stays a click).
  const [highlightId, setHighlightId] = useState(null);

  const userEmail = user?.email || "";

  const load = useCallback(async () => {
    if (!SERVER_URL) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${SERVER_URL}/courses/public`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || t("learner.discover.loadFailed"));
      setCourses(payload.courses || []);
    } catch (err) {
      setError(err.message || t("learner.discover.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [SERVER_URL, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isGuest || !courses?.length) return;
    let joinId = null;
    try { joinId = new URLSearchParams(window.location.search).get("join"); } catch { /* ignore */ }
    if (!joinId) return;
    setHighlightId(joinId);
    window.history.replaceState(null, "", window.location.pathname);
    requestAnimationFrame(() => {
      document.getElementById(`course-${joinId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [isGuest, courses]);

  // Join with the code a teacher shares: works for private courses too.
  const [joinCode, setJoinCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const joinByCode = async (e) => {
    e.preventDefault();
    if (!joinCode.trim() || !requireAccount("/discover-courses")) return;
    setCodeBusy(true);
    setCodeError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/join-by-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((payload.code && t(`learner.discover.code.errors.${payload.code}`)) || payload.message || t("learner.discover.joinFailed"));
      startRouteLoading();
      router.push(`/course/${payload.courseId}/home`);
    } catch (err) {
      setCodeError(err.message || t("learner.discover.joinFailed"));
      setCodeBusy(false);
    }
  };

  const join = async (courseId) => {
    if (!requireAccount(`/discover-courses?join=${encodeURIComponent(courseId)}`)) return;
    if (!userEmail) return;
    setJoiningId(courseId);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).message || t("learner.discover.joinFailed"));
      startRouteLoading();
      router.push(`/course/${courseId}/home`);
    } catch (err) {
      setError(err.message || t("learner.discover.joinFailed"));
      setJoiningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 md:pb-8">
      <div className="flex items-center justify-between pl-12 pr-4 md:px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-slate-500" />
          <div>
            <h1 className="text-[17px] font-bold text-slate-900">{t("shell.nav.discoverCourses")}</h1>
            <p className="text-[11px] text-slate-600 hidden sm:block">{t("learner.discover.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6">
        <form onSubmit={joinByCode} className="max-w-xl rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <label htmlFor="join-code" className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[var(--brand-primary)]" aria-hidden="true" /> {t("learner.discover.code.title")}
          </label>
          <p className="text-xs text-slate-600">{t("learner.discover.code.help")}</p>
          <div className="flex flex-wrap gap-2">
            <input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t("learner.discover.code.placeholder")}
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={12}
              className="flex-1 min-w-[10rem] text-base font-mono tracking-widest border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-primary)]"
            />
            <button type="submit" disabled={codeBusy || !joinCode.trim()} className="text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] disabled:opacity-50 rounded-lg px-4 py-2">
              {codeBusy ? t("learner.discover.joining") : t("learner.discover.code.button")}
            </button>
          </div>
          {codeError ? <p role="alert" className="text-xs text-rose-600">{codeError}</p> : null}
        </form>

        <AsyncListState
          loading={loading}
          error={error}
          data={courses}
          onRetry={load}
          emptyMessage={t("learner.discover.empty")}
        >
          {(list) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((course) => (
                <div
                  key={course.id}
                  id={`course-${course.id}`}
                  className={`rounded-xl border bg-white overflow-hidden flex flex-col ${String(course.id) === highlightId ? "border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/40" : "border-slate-200"}`}
                >
                  {course.coverImageUrl ? (
                    <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-28 object-cover" />
                  ) : (
                    <div className="w-full h-28 bg-slate-100 flex items-center justify-center">
                      <Compass className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 truncate">{course.title}</h2>
                    {course.grade ? <span className="text-[10px] font-semibold uppercase text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 w-fit">{course.grade}</span> : null}
                    {course.description ? <p className="text-xs text-slate-600 line-clamp-2">{course.description}</p> : null}
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-auto pt-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{fill(t(course.studentCount === 1 ? "learner.discover.oneEnrolled" : "learner.discover.nEnrolled"), { n: course.studentCount })}</span>
                    </div>
                    <button
                      onClick={() => join(course.id)}
                      disabled={joiningId === course.id}
                      className="mt-1 text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg px-3 py-2 disabled:opacity-50"
                    >
                      {isGuest ? t("guest.signUpToJoin") : joiningId === course.id ? t("learner.discover.joining") : t("learner.discover.join")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
