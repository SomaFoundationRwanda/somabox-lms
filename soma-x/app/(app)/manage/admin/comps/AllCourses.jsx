"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DataTable, EmptyState } from "@/components/layout";
import { formatDate } from "@/lib/dates";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import Loader from "@/components/ui/Loader";
import Modal from "@/components/ui/Modal";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/ToastContext";

// Admins give a course another teacher, e.g. when its teacher left (PUT /courses/:id/teacher).
function ChangeTeacher({ serverUrl, course, onClose, onDone }) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [teachers, setTeachers] = useState(null);
  const [email, setEmail] = useState("");
  const [removeOthers, setRemoveOthers] = useState(!course.teachers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${serverUrl}/users?role=teacher&status=active&limit=500&sortBy=name&sortOrder=asc`)
      .then((res) => res.json())
      .then((data) => setTeachers(Array.isArray(data?.users) ? data.users : []))
      .catch(() => setTeachers([]));
  }, [serverUrl]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${serverUrl}/courses/${course.id}/teacher`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, removeOthers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t("admin.courses.changeTeacherFailed"));
      showToast(fill(t("admin.courses.teacherChanged"), { course: course.title }), "success");
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={fill(t("admin.courses.changeTeacherTitle"), { course: course.title })} onClose={onClose} dirty={!!email}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {course.teachers ? fill(t("admin.courses.currentTeachers"), { teachers: course.teachers }) : t("admin.courses.noTeacherNow")}
        </p>
        <div>
          <label htmlFor="change-teacher" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t("admin.courses.newTeacher")}</label>
          {teachers === null ? <Loader size={24} /> : (
            <select id="change-teacher" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-[var(--brand-secondary)]">
              <option value="">{t("admin.courses.chooseTeacher")}</option>
              {teachers.map((u) => <option key={u.id} value={u.email}>{u.full_name ? `${u.full_name} (${u.email})` : u.email}</option>)}
            </select>
          )}
        </div>
        {course.teachers && (
          <div className="flex items-start gap-2.5">
            <Checkbox id="remove-other-teachers" checked={removeOthers} onCheckedChange={(v) => setRemoveOthers(v === true)} className="mt-0.5" />
            <label htmlFor="remove-other-teachers" className="text-sm text-slate-700 dark:text-slate-300 cursor-pointer">{t("admin.courses.removeOthers")}</label>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <Button type="button" onClick={save} disabled={!email || saving} className="w-full">
          {saving ? t("admin.addUser.saving") : t("admin.courses.saveTeacher")}
        </Button>
      </div>
    </Modal>
  );
}

// Every course on this box, for admins (GET /courses/all).
export default function AllCourses({ serverUrl }) {
  const { t } = useLanguage();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [changing, setChanging] = useState(null); // the course whose teacher is being changed

  const load = async () => {
    try {
      const res = await fetch(`${serverUrl}/courses/all`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || t("admin.courses.loadFailed"));
      setCourses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (serverUrl) load();
  }, [serverUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!courses) return <Loader variant="page" size={48} className="min-h-[8rem]" />;
  if (courses.length === 0) {
    return <EmptyState compact title={t("admin.courses.emptyTitle")} description={t("admin.courses.emptyText")} />;
  }

  const q = filter.trim().toLowerCase();
  const rows = q
    ? courses.filter((c) => [c.title, c.id, c.teachers].some((v) => String(v || "").toLowerCase().includes(q)))
    : courses;

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("admin.courses.searchPlaceholder")}
        aria-label={t("admin.courses.searchLabel")}
        className="w-full sm:w-72 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-secondary)]"
      />
      <DataTable
        caption={t("admin.courses.caption")}
        rows={rows}
        empty={t("admin.courses.noMatch")}
        columns={[
          {
            key: "title",
            header: t("admin.courses.colCourse"),
            render: (c) => (
              <div className="min-w-0">
                <Link href={`/course/${c.id}/home`} className="font-semibold text-slate-900 hover:text-[var(--brand-secondary)] hover:underline">{c.title}</Link>
                <div className="text-xs text-slate-500">{fill(t("admin.courses.code"), { code: c.id })}{c.grade ? ` · ${c.grade}` : ""}</div>
              </div>
            ),
          },
          {
            key: "teachers", header: t("admin.courses.colTeacher"),
            render: (c) => (
              <div className="flex flex-col items-start gap-1">
                {c.teachers
                  ? <span className="text-xs text-slate-600">{c.teachers}</span>
                  : <span className="text-xs font-semibold text-rose-700">{t("admin.courses.noTeacher")}</span>}
                <button type="button" onClick={() => setChanging(c)} className="text-xs font-semibold text-[var(--brand-secondary)] hover:underline">
                  {t("admin.courses.changeTeacher")}
                </button>
              </div>
            ),
          },
          { key: "lifecycle", header: t("admin.courses.colStatus"), render: (c) => <span className="text-xs font-semibold text-slate-700">{t(`admin.courses.lifecycle.${["draft", "open", "closed", "archived"].includes(c.lifecycle) ? c.lifecycle : "draft"}`)}</span> },
          { key: "learners", header: t("admin.courses.colLearners"), align: "right" },
          { key: "start_date", header: t("admin.courses.colStarts"), hideOnMobile: true, render: (c) => <span className="text-xs text-slate-600">{c.start_date ? formatDate(c.start_date) : t("admin.common.notSet")}</span> },
        ]}
      />
      {changing && (
        <ChangeTeacher serverUrl={serverUrl} course={changing} onClose={() => setChanging(null)} onDone={() => { setChanging(null); load(); }} />
      )}
    </div>
  );
}
