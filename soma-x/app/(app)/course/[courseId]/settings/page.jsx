"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Eye, EyeOff, ListChecks, X } from "lucide-react";
import { compareDates, isDateString } from "@somabox/timeline";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section } from "@/components/layout";
import { formatDate, toDateInput } from "@/lib/dates";
import { moduleWeekLabel } from "@/lib/moduleLabels";
import SetupChecklist from "@/components/teacher/SetupChecklist";
import BaselinePanel from "@/components/teacher/BaselinePanel";
import CourseSetupWizard from "@/components/teacher/CourseSetupWizard";
import Explainer from "@/components/help/Explainer";

// Settings > Course setup (teachers): the setup checklist, the Week 0 baseline and the guided wizard.
function CourseSetupSection({ SERVER_URL, courseId, course, userEmail, onCourseChanged }) {
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [baselineKey, setBaselineKey] = useState(0); // remounts the baseline panel after the wizard changes things

  const loadStatus = useCallback(async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/setup-status`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Could not load the setup status");
      setStatus(payload);
      setStatusError("");
    } catch (err) {
      setStatusError(err.message || "Could not load the setup status");
    }
  }, [SERVER_URL, courseId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const isDraft = status ? !status.isOpened : (!course?.lifecycle || course.lifecycle === "draft");

  return (
    <section id="course-setup" aria-labelledby="course-setup-title" className="space-y-6 scroll-mt-4">
      <h2 id="course-setup-title" className="sr-only">Course setup</h2>
      {statusError && <p className="text-xs text-rose-600" role="alert">{statusError}</p>}
      {status && (
        <SetupChecklist
          courseId={courseId}
          SERVER_URL={SERVER_URL}
          status={status}
          showSettingsLink={false}
          onChanged={() => { loadStatus(); onCourseChanged(); }}
        />
      )}

      <Section divided title="Baseline (Week 0)" actions={<Explainer k="pages.baseline" />}>
        <BaselinePanel
          key={baselineKey}
          SERVER_URL={SERVER_URL}
          courseId={courseId}
          isDraft={isDraft}
          onChanged={loadStatus}
        />
      </Section>

      <Section
        divided
        title="Guided setup"
        description="Prefer step by step? Walk through dates, outcomes, baseline and weeks in order."
        actions={
          <button
            type="button"
            onClick={() => {
              if (showWizard) { setBaselineKey((k) => k + 1); loadStatus(); onCourseChanged(); }
              setShowWizard(!showWizard);
            }}
            aria-expanded={showWizard}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488] bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg hover:bg-teal-100 transition-colors"
          >
            {showWizard ? <><X className="w-3.5 h-3.5" aria-hidden="true" /> Close guided setup</> : <><ListChecks className="w-3.5 h-3.5" aria-hidden="true" /> Guided setup</>}
          </button>
        }
      />

      {showWizard && (
        <CourseSetupWizard
          SERVER_URL={SERVER_URL}
          courseId={courseId}
          userEmail={userEmail}
          course={course}
          onCompleted={() => {
            setShowWizard(false);
            setBaselineKey((k) => k + 1);
            loadStatus();
            onCourseChanged();
          }}
        />
      )}
    </section>
  );
}

// "Shift timeline": preview moving dates by N days (whole course or from one module on),
// then apply exactly what was previewed.
function ShiftTimelinePanel({ SERVER_URL, courseId, startDate, onApplied }) {
  const hasStartDate = Boolean(startDate);
  const { showToast } = useToast();
  const [modules, setModules] = useState([]);
  const [days, setDays] = useState("7");
  const [fromModuleId, setFromModuleId] = useState("");
  const [preview, setPreview] = useState(null); // { key, result }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadModules = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules`);
      const payload = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(payload)) return;
      setModules(
        payload
          .filter((m) => m.kind !== "unassigned")
          .sort((a, b) => compareDates(a.startDate || "9999-12-31", b.startDate || "9999-12-31") || (a.position ?? 0) - (b.position ?? 0))
      );
    } catch { /* the select just lists fewer options */ }
  }, [SERVER_URL, courseId]);

  useEffect(() => { loadModules(); }, [loadModules, startDate]);

  const n = Number(days);
  const validDays = days.trim() !== "" && Number.isInteger(n) && n !== 0;
  const key = `${n}|${fromModuleId}`;
  const previewIsCurrent = preview && preview.key === key;

  const send = async (isPreview) => {
    if (!validDays) { setError("Enter a whole number of days other than 0 (negative pulls dates earlier)."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/shift-timeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: n,
          ...(fromModuleId ? { fromModuleId: Number(fromModuleId) } : {}),
          preview: isPreview,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Could not shift the timeline");
      if (isPreview) {
        setPreview({ key, result: payload });
      } else {
        showToast(payload?.message || "Timeline shifted", "success");
        setPreview(null);
        loadModules();
        onApplied();
      }
    } catch (err) {
      setError(err.message || "Could not shift the timeline");
      if (isPreview) setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const result = previewIsCurrent ? preview.result : null;
  const movedModules = Array.isArray(result?.modules) ? result.modules : [];
  const movedItems = Array.isArray(result?.items) ? result.items : [];

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-bold text-slate-900 dark:text-white mb-1 inline-flex items-center gap-2">Shift timeline (&ldquo;We lost days&rdquo;) <Explainer k="pages.shiftTimeline" variant="icon" /></legend>
      {!hasStartDate ? (
        <p className="text-[11px] text-slate-500">Set and save a start date first.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
            <div>
              <label htmlFor="shift-days" className="text-[11px] font-semibold text-slate-600 mb-1 block">Days to move</label>
              <input
                id="shift-days"
                type="number"
                step="1"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none"
              />
              <p className="text-[10px] text-slate-500 mt-0.5">Negative = earlier</p>
            </div>
            <div>
              <label htmlFor="shift-from" className="text-[11px] font-semibold text-slate-600 mb-1 block">Starting from</label>
              <select
                id="shift-from"
                value={fromModuleId}
                onChange={(e) => setFromModuleId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none bg-white"
              >
                <option value="">Whole course (moves the start date)</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {moduleWeekLabel(m)}: {m.title}{m.startDate ? ` (${formatDate(m.startDate)})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-0.5">A module moves together with every module after it.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => send(true)}
              disabled={busy || !validDays}
              className="text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {busy && !previewIsCurrent ? "Working..." : "Preview"}
            </button>
            <button
              type="button"
              onClick={() => send(false)}
              disabled={busy || !previewIsCurrent}
              className="text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              title={previewIsCurrent ? undefined : "Preview these settings first"}
            >
              {busy && previewIsCurrent ? "Applying..." : "Apply"}
            </button>
            {preview && !previewIsCurrent && <span className="text-[11px] text-amber-700">Settings changed — preview again.</span>}
          </div>

          {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}

          {result && (
            <div className="space-y-2 text-xs" aria-live="polite">
              {result.message && <p className="text-slate-700 font-medium">{result.message}</p>}
              {movedModules.length === 0 && movedItems.length === 0 && <p className="text-slate-500">Nothing would move.</p>}
              {movedModules.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold uppercase text-slate-500 mb-1">Modules ({movedModules.length})</h3>
                  <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {movedModules.map((m) => (
                      <li key={m.moduleId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5">
                        <span className="font-medium text-slate-700 flex-1 min-w-[8rem] truncate">{m.title}</span>
                        <span className="text-slate-500">{formatDate(m.fromStart) || "—"}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" aria-label="to" />
                        <span className="font-semibold text-[#0D9488]">{formatDate(m.toStart) || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {movedItems.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-bold uppercase text-slate-500 mb-1">Due dates ({movedItems.length})</h3>
                  <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {movedItems.map((i) => (
                      <li key={i.moduleItemId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5">
                        <span className="font-medium text-slate-700 flex-1 min-w-[8rem] truncate">{i.title}</span>
                        <span className="text-slate-500">{formatDate(i.fromDue) || "—"}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" aria-label="to" />
                        <span className="font-semibold text-[#0D9488]">{formatDate(i.toDue) || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

export default function CourseSettingsPage() {
  const { SERVER_URL, courseId, course, nav, refresh, isTeacher, userEmail } = useCourse();
  const { showToast } = useToast();
  const [detailsError, setDetailsError] = useState("");
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState({ title: "", description: "", grade: "", visibility: "private" });
  const [navItems, setNavItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [coverFile, setCoverFile] = useState(null);

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title || "",
        description: course.description || "",
        grade: course.grade || "",
        visibility: course.visibility || "private",
        startDate: toDateInput(course.start_date),
        endDate: toDateInput(course.end_date),
        lengthWeeks: course.length_weeks || 4,
      });
    }
  }, [course]);

  useEffect(() => {
    setNavItems(nav.map((item) => ({ ...item })));
  }, [nav]);

  // "#course-setup" links (from the Home checklist and setup-status hrefs) open the Course setup tab.
  useEffect(() => {
    if (!isTeacher) return;
    const syncFromHash = () => {
      if (window.location.hash === "#course-setup") {
        setTab("setup");
        requestAnimationFrame(() => document.getElementById("course-setup")?.scrollIntoView({ block: "start" }));
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [isTeacher]);

  const saveDetails = async () => {
    setDetailsError("");
    if (form.startDate && form.endDate && compareDates(form.endDate, form.startDate) < 0) {
      setDetailsError("The end date can't be before the start date.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          startDate: isDateString(form.startDate) ? form.startDate : null,
          endDate: isDateString(form.endDate) ? form.endDate : null,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to save course details");
      }
      if (coverFile) {
        const formData = new FormData();
        formData.append("image", coverFile);
        const coverRes = await fetch(`${SERVER_URL}/courses/${courseId}/cover-image`, { method: "POST", body: formData });
        if (!coverRes.ok) {
          const payload = await coverRes.json().catch(() => ({}));
          throw new Error(payload?.message || "Details saved, but the banner image failed to upload");
        }
      }
      showToast("Course details saved", "success");
      refresh();
    } catch (err) {
      setDetailsError(err.message || "Failed to save course details");
    } finally {
      setSaving(false);
    }
  };

  const enabled = navItems.filter((i) => i.visibleToStudents).sort((a, b) => a.position - b.position);
  const hidden = navItems.filter((i) => !i.visibleToStudents).sort((a, b) => a.position - b.position);

  const toggleVisibility = (navKey) => {
    setNavItems((prev) => prev.map((item) => (item.navKey === navKey ? { ...item, visibleToStudents: !item.visibleToStudents } : item)));
  };

  const moveWithinList = (list, navKey, direction) => {
    const idx = list.findIndex((i) => i.navKey === navKey);
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    return reordered;
  };

  const moveEnabled = (navKey, direction) => {
    const reordered = moveWithinList(enabled, navKey, direction);
    if (!reordered) return;
    setNavItems((prev) => {
      const others = prev.filter((i) => !i.visibleToStudents);
      return [...reordered, ...others];
    });
  };

  const moveHidden = (navKey, direction) => {
    const reordered = moveWithinList(hidden, navKey, direction);
    if (!reordered) return;
    setNavItems((prev) => {
      const others = prev.filter((i) => i.visibleToStudents);
      return [...others, ...reordered];
    });
  };

  const saveNav = async () => {
    setSaving(true);
    const items = [...enabled, ...hidden].map((item, index) => ({
      nav_key: item.navKey,
      position: index,
      visible_to_students: item.visibleToStudents,
    }));
    await fetch(`${SERVER_URL}/courses/${courseId}/nav`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    refresh();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="settings" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="pages.settings" title="Settings" />

        <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto">
          <button onClick={() => setTab("details")} className={`text-sm font-semibold px-3 py-2 border-b-2 ${tab === "details" ? "border-[#203A3A] text-[#203A3A]" : "border-transparent text-slate-500"}`}>Course Details</button>
          <button onClick={() => setTab("navigation")} className={`text-sm font-semibold px-3 py-2 border-b-2 ${tab === "navigation" ? "border-[#203A3A] text-[#203A3A]" : "border-transparent text-slate-500"}`}>Navigation</button>
          {isTeacher && (
            <button onClick={() => setTab("setup")} className={`text-sm font-semibold px-3 py-2 border-b-2 ${tab === "setup" ? "border-[#203A3A] text-[#203A3A]" : "border-transparent text-slate-500"}`}>Course setup</button>
          )}
        </div>

        {tab === "setup" && isTeacher ? (
          <CourseSetupSection
            SERVER_URL={SERVER_URL}
            courseId={courseId}
            course={course}
            userEmail={userEmail}
            onCourseChanged={refresh}
          />
        ) : tab === "details" ? (
          <div className="space-y-8">
            <Section title="Dates" description="Every module and due date is worked out from the start date, so changing it moves all of them.">
            <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="course-start-date" className="text-xs font-semibold text-slate-600 mb-1 block">Start date (first day of Week 1)</label>
                <input id="course-start-date" type="date" value={form.startDate || ""} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
              </div>
              <div>
                <label htmlFor="course-end-date" className="text-xs font-semibold text-slate-600 mb-1 block">End date (optional)</label>
                <input id="course-end-date" type="date" value={form.endDate || ""} min={form.startDate || undefined} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
              </div>
            </div>
            <div>
              <label htmlFor="course-length" className="text-xs font-semibold text-slate-600 mb-1 block">Duration (Weeks)</label>
              <input id="course-length" type="number" min={1} max={52} value={form.lengthWeeks} onChange={(e) => setForm((p) => ({ ...p, lengthWeeks: Number(e.target.value) }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            </div>
            </div>
            </Section>

            <Section divided>
            <ShiftTimelinePanel
              SERVER_URL={SERVER_URL}
              courseId={courseId}
              startDate={toDateInput(course?.start_date)}
              onApplied={refresh}
            />
            </Section>

            <Section divided title="About this course">
            <div className="space-y-3">
            <div>
              <label htmlFor="course-grade" className="text-xs font-semibold text-slate-600 mb-1 block">Grade/Level</label>
              <input id="course-grade" value={form.grade} onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            </div>
            <div>
              <label htmlFor="course-description" className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
              <textarea id="course-description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={4} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            </div>
            <div>
              <label htmlFor="course-banner" className="text-xs font-semibold text-slate-600 mb-1 block">Banner Image</label>
              <input id="course-banner" type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
            <div>
              <label htmlFor="course-visibility" className="text-xs font-semibold text-slate-600 mb-1 block">Visibility</label>
              <select
                id="course-visibility"
                value={form.visibility}
                onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none bg-white"
              >
                <option value="private">Private — invite only</option>
                <option value="public">Public — listed in Discover Courses</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Public courses appear in the platform's course catalog and can be joined by any user without an invite.
              </p>
            </div>
            </div>
            </Section>
            {detailsError && <p className="text-xs text-rose-600" role="alert">{detailsError}</p>}
            <button onClick={saveDetails} disabled={saving} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-4 py-2 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-xs text-slate-500">Enabled items appear in the sidebar for everyone. Hidden items stay visible to you (grayed out) but not to students.</p>

            <Section title="Enabled">
              <ul aria-label="Enabled navigation items" className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                {enabled.map((item, idx) => (
                  <li key={item.navKey} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveEnabled(item.navKey, -1)} disabled={idx === 0} aria-label={`Move ${item.label} up`} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveEnabled(item.navKey, 1)} disabled={idx === enabled.length - 1} aria-label={`Move ${item.label} down`} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => toggleVisibility(item.navKey)} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Hide from students" aria-label={`Hide ${item.label} from students`}><Eye className="w-3.5 h-3.5 text-emerald-600" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Hidden from students">
              <ul aria-label="Hidden navigation items" className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                {hidden.map((item, idx) => (
                  <li key={item.navKey} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900/40">
                    <span className="text-sm text-slate-400">{item.label}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveHidden(item.navKey, -1)} disabled={idx === 0} aria-label={`Move ${item.label} up`} className="p-1 rounded hover:bg-white disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveHidden(item.navKey, 1)} disabled={idx === hidden.length - 1} aria-label={`Move ${item.label} down`} className="p-1 rounded hover:bg-white disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => toggleVisibility(item.navKey)} className="p-1 rounded hover:bg-white text-slate-400" title="Show to students" aria-label={`Show ${item.label} to students`}><EyeOff className="w-3.5 h-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <button onClick={saveNav} disabled={saving} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-4 py-2 disabled:opacity-50">
              {saving ? "Saving..." : "Save Navigation"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
