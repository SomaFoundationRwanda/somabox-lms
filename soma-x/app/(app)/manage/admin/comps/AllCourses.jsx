"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, EmptyState } from "@/components/layout";
import { formatDate } from "@/lib/dates";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import Loader from "@/components/ui/Loader";
import Modal from "@/components/ui/Modal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useUserList } from "@/lib/queries/users";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/ToastContext";
import { Checkbox, Field, Label, Select, TextInput } from "@/components/form";

// Admins give a course another teacher, e.g. when its teacher left (PUT /courses/:id/teacher).
function ChangeTeacher({ course, onClose, onDone }) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  // The same kept list as the admin's user list (a teacher just added shows up here too).
  const teacherList = useUserList({ role: "teacher", status: "active", limit: "500", sortBy: "name", sortOrder: "asc" });
  const teachers = teacherList.isPending ? null : teacherList.data?.users || [];
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [removeOthers, setRemoveOthers] = useState(!course.teachers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/courses/${course.id}/teacher`, { method: "PUT", json: { email, removeOthers } });
      queryClient.invalidateQueries({ queryKey: queryKeys.allCourses });
      queryClient.invalidateQueries({ queryKey: queryKeys.course(course.id) });
      showToast(fill(t("admin.courses.teacherChanged"), { course: course.title }), "success");
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={fill(t("admin.courses.changeTeacherTitle"), { course: course.title })} onClose={onClose} dirty={!!email}>
      <div className="space-y-4">
        <p className="text-ui text-fg-muted">
          {course.teachers ? fill(t("admin.courses.currentTeachers"), { teachers: course.teachers }) : t("admin.courses.noTeacherNow")}
        </p>
        <Field id="change-teacher" label={t("admin.courses.newTeacher")}>
          {teachers === null ? <Loader size={24} /> : (
            <Select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("admin.courses.chooseTeacher")}
              options={teachers.map((u) => ({ value: u.email, label: u.full_name ? `${u.full_name} (${u.email})` : u.email }))}
            />
          )}
        </Field>
        {course.teachers && (
          <div className="flex items-start gap-2.5">
            <Checkbox id="remove-other-teachers" checked={removeOthers} onCheckedChange={(v) => setRemoveOthers(v === true)} className="mt-0.5" />
            <Label htmlFor="remove-other-teachers">{t("admin.courses.removeOthers")}</Label>
          </div>
        )}
        {error && <p role="alert" className="text-ui text-danger-fg">{error}</p>}
        <Button type="button" onClick={save} disabled={!email || saving} className="w-full">
          {saving ? t("admin.addUser.saving") : t("admin.courses.saveTeacher")}
        </Button>
      </div>
    </Modal>
  );
}

// Every course on this box, for admins (GET /courses/all).
export default function AllCourses() {
  const { t } = useLanguage();
  const query = useQuery({ queryKey: queryKeys.allCourses, queryFn: () => apiFetch("/courses/all") });
  const courses = query.data ? (Array.isArray(query.data) ? query.data : []) : null;
  const error = query.isError ? getErrorMessage(query.error, t) : "";
  const [filter, setFilter] = useState("");
  const [changing, setChanging] = useState(null); // the course whose teacher is being changed

  if (error) return <p className="text-ui text-danger-fg">{error}</p>;
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
      <TextInput
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("admin.courses.searchPlaceholder")}
        aria-label={t("admin.courses.searchLabel")}
        className="sm:w-72"
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
                <Link href={`/course/${c.id}/home`} className="font-semibold text-fg hover:text-brand-fg hover:underline">{c.title}</Link>
                <div className="text-caption text-fg-subtle">{fill(t("admin.courses.code"), { code: c.id })}{c.grade ? ` · ${c.grade}` : ""}</div>
              </div>
            ),
          },
          {
            key: "teachers", header: t("admin.courses.colTeacher"),
            render: (c) => (
              <div className="flex flex-col items-start gap-1">
                {c.teachers
                  ? <span className="text-caption text-fg-muted">{c.teachers}</span>
                  : <span className="text-caption font-semibold text-danger-fg">{t("admin.courses.noTeacher")}</span>}
                <button type="button" onClick={() => setChanging(c)} className="text-caption font-semibold text-brand-fg hover:underline">
                  {t("admin.courses.changeTeacher")}
                </button>
              </div>
            ),
          },
          { key: "lifecycle", header: t("admin.courses.colStatus"), render: (c) => <span className="text-caption font-semibold text-fg-muted">{t(`admin.courses.lifecycle.${["draft", "open", "closed", "archived"].includes(c.lifecycle) ? c.lifecycle : "draft"}`)}</span> },
          { key: "learners", header: t("admin.courses.colLearners"), align: "right" },
          { key: "start_date", header: t("admin.courses.colStarts"), hideOnMobile: true, render: (c) => <span className="text-caption text-fg-muted">{c.start_date ? formatDate(c.start_date) : t("admin.common.notSet")}</span> },
        ]}
      />
      {changing && (
        <ChangeTeacher course={changing} onClose={() => setChanging(null)} onDone={() => setChanging(null)} />
      )}
    </div>
  );
}
