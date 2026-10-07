"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { compareDates, isDateString } from "@somabox/timeline";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { formatDate, toDateInput } from "@/lib/dates";
import { moduleWeekLabel } from "@/lib/moduleLabels";

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
    <fieldset className="rounded-xl border border-slate-200 p-3 space-y-3">
      <legend className="text-xs font-semibold text-slate-600 px-1">Shift timeline (&ldquo;We lost days&rdquo;)</legend>
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
  const { SERVER_URL, courseId, course, nav, refresh } = useCourse();
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
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <h1 className="text-lg font-bold text-slate-900">Settings</h1>

        <div className="flex items-center gap-1.5 border-b border-slate-200">
          <button onClick={() => setTab("details")} className={`text-sm font-semibold px-3 py-2 border-b-2 ${tab === "details" ? "border-[#203A3A] text-[#203A3A]" : "border-transparent text-slate-500"}`}>Course Details</button>
          <button onClick={() => setTab("navigation")} className={`text-sm font-semibold px-3 py-2 border-b-2 ${tab === "navigation" ? "border-[#203A3A] text-[#203A3A]" : "border-transparent text-slate-500"}`}>Navigation</button>
        </div>

        {tab === "details" ? (
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
              <p className="sm:col-span-2 text-[11px] text-slate-500 -mt-1">Every module and due date is worked out from the start date, so changing it moves all of them.</p>
            </div>
            <div>
              <label htmlFor="course-length" className="text-xs font-semibold text-slate-600 mb-1 block">Duration (Weeks)</label>
              <input id="course-length" type="number" min={1} max={52} value={form.lengthWeeks} onChange={(e) => setForm((p) => ({ ...p, lengthWeeks: Number(e.target.value) }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            </div>
            <ShiftTimelinePanel
              SERVER_URL={SERVER_URL}
              courseId={courseId}
              startDate={toDateInput(course?.start_date)}
              onApplied={refresh}
            />
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Grade/Level</label>
              <input value={form.grade} onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={4} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Banner Image</label>
              <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} className="text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Visibility</label>
              <select
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
            {detailsError && <p className="text-xs text-rose-600" role="alert">{detailsError}</p>}
            <button onClick={saveDetails} disabled={saving} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-4 py-2 disabled:opacity-50">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Enabled items appear in the sidebar for everyone. Hidden items stay visible to you (grayed out) but not to students.</p>

            <div>
              <h2 className="text-xs font-bold uppercase text-slate-500 mb-2">Enabled</h2>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {enabled.map((item, idx) => (
                  <div key={item.navKey} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-sm text-slate-700">{item.label}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveEnabled(item.navKey, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveEnabled(item.navKey, 1)} disabled={idx === enabled.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => toggleVisibility(item.navKey)} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Hide from students"><Eye className="w-3.5 h-3.5 text-emerald-600" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold uppercase text-slate-500 mb-2">Hidden from students</h2>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {hidden.map((item, idx) => (
                  <div key={item.navKey} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50">
                    <span className="text-sm text-slate-400">{item.label}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveHidden(item.navKey, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-white disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveHidden(item.navKey, 1)} disabled={idx === hidden.length - 1} className="p-1 rounded hover:bg-white disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => toggleVisibility(item.navKey)} className="p-1 rounded hover:bg-white text-slate-400" title="Show to students"><EyeOff className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={saveNav} disabled={saving} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-4 py-2 disabled:opacity-50">
              {saving ? "Saving..." : "Save Navigation"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
