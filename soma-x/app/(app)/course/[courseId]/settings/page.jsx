"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function CourseSettingsPage() {
  const { SERVER_URL, courseId, userEmail, course, nav, refresh } = useCourse();
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState({ title: "", description: "", grade: "" });
  const [navItems, setNavItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [coverFile, setCoverFile] = useState(null);

  useEffect(() => {
    if (course) setForm({ title: course.title || "", description: course.description || "", grade: course.grade || "" });
  }, [course]);

  useEffect(() => {
    setNavItems(nav.map((item) => ({ ...item })));
  }, [nav]);

  const saveDetails = async () => {
    setSaving(true);
    await fetch(`${SERVER_URL}/courses/${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, ...form }),
    });
    if (coverFile) {
      const formData = new FormData();
      formData.append("teacherEmail", userEmail);
      formData.append("image", coverFile);
      await fetch(`${SERVER_URL}/courses/${courseId}/cover-image`, { method: "POST", body: formData });
    }
    setSaving(false);
    refresh();
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
      body: JSON.stringify({ teacherEmail: userEmail, items }),
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
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Title</label>
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            </div>
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
