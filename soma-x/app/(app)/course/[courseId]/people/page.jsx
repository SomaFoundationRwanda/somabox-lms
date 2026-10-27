"use client";

import { useState } from "react";
import { KeyRound, Plus, Trash2, UserPlus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { PageHeader, DataTable } from "@/components/layout";
import { useCourseText } from "@/components/course/useCourseText";
import JoinCodePanel from "@/components/teacher/JoinCodePanel";
import AddLearners from "@/components/teacher/AddLearners";
import CredentialSheet from "@/components/teacher/CredentialSheet";
import Modal from "@/components/ui/Modal";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Select, TextInput } from "@/components/form";

const ROLE_OPTIONS = ["teacher", "ta", "student", "observer"];

export default function PeoplePage() {
  const { courseId, isTeacher, isCourseTeacher, course } = useCourse();
  // Assistants add and remove learners and observers; only the course's teacher changes staff.
  const addableRoles = isCourseTeacher ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r === "student" || r === "observer");
  // Learners don't see observers in the class list, so there's nothing to filter them by.
  const filterRoles = isTeacher ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r !== "observer");
  const { t, tf, tOr } = useCourseText();
  const roleLabel = (r) => tOr(`people.roles.${r}`, r);
  const { data: people, loading, error, refetch } = useCourseSection("people");
  const [roleFilter, setRoleFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: "", role: "student" });
  const [addingLearners, setAddingLearners] = useState(false);
  // A learner's new temporary password, shown once: { fullName, learnerCode, temporaryPassword }.
  const [resetDone, setResetDone] = useState(null);
  const lang = useLanguage();
  const l = (key) => lang.t(`teacher.learners.${key}`);

  const filtered = Array.isArray(people) ? people.filter((p) => roleFilter === "all" || p.role === roleFilter) : people;

  const { showToast } = useToast();
  const queryClient = useQueryClient();
  // Runs a change; the server refuses some (e.g. removing the last teacher): show why.
  const attempt = async (request, fallback) => {
    try {
      return await request();
    } catch (err) {
      showToast(err?.body?.message || (err?.status === 0 ? getErrorMessage(err) : fallback), "error");
      return null;
    }
  };
  // People changed: this list, and the course lists (learner counts) everywhere.
  const peopleChanged = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: queryKeys.courses });
  };

  const addPerson = async () => {
    if (!form.email.trim()) return;
    const done = await attempt(() => apiFetch(`/courses/${courseId}/people`, { method: "POST", json: { email: form.email.trim(), role: form.role } }), t("people.addFailed"));
    if (!done) return;
    setForm({ email: "", role: "student" });
    setAdding(false);
    peopleChanged();
  };

  const removePerson = async (person) => {
    if (!window.confirm(tf("people.removeConfirm", { name: person.fullName || person.email || "" }))) return;
    const enrollmentId = person.id;
    const done = await attempt(() => apiFetch(`/courses/${courseId}/people/${enrollmentId}`, { method: "DELETE", json: {} }).then(() => true), t("people.removeFailed"));
    if (!done) return;
    peopleChanged();
  };

  const resetPassword = async (person) => {
    if (!window.confirm(fill(l("resetConfirm"), { name: person.fullName }))) return;
    const sheet = await attempt(() => apiFetch(`/courses/${courseId}/people/${person.id}/reset-password`, { method: "POST" }), l("resetFailed"));
    if (sheet) setResetDone(sheet);
  };

  return (
    <div>
      <Breadcrumbs sectionKey="people" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader help="pages.people"
          title={t("nav.people")}
          actions={isTeacher ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setAddingLearners(true)} className="flex items-center gap-1.5 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 rounded-lg px-3 py-2">
                <UserPlus className="w-3.5 h-3.5" /> {t("people.addLearners")}
              </button>
              <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 text-caption font-semibold text-fg-muted border border-line hover:bg-surface-hover rounded-lg px-3 py-2">
                <Plus className="w-3.5 h-3.5" /> {t("people.add")}
              </button>
            </div>
          ) : null}
        />

        {/* Learners join with the code; email is for the few who have one (and for staff). */}
        {isCourseTeacher ? <JoinCodePanel courseId={courseId} isDraft={course?.lifecycle === "draft"} /> : null}

        {adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <TextInput value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder={t("people.email")} aria-label={t("people.email")} className="flex-1 min-w-[200px]" />
            <Select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} aria-label={t("people.role")} >
              {addableRoles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </Select>
            <button onClick={addPerson} className="text-caption font-semibold text-on-brand-strong bg-brand-strong rounded-lg px-3 py-2">{t("common.add")}</button>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={t("people.filterByRole")}>
          {["all", ...filterRoles].map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)} aria-pressed={roleFilter === r} className={`text-caption font-semibold px-2.5 py-1 rounded-full border ${roleFilter === r ? "bg-brand-strong text-on-brand-strong border-brand-strong" : "border-line text-fg-muted"}`}>
              {r === "all" ? t("people.all") : roleLabel(r)}
            </button>
          ))}
        </div>

        <AsyncListState loading={loading} error={error} data={filtered} onRetry={refetch} emptyMessage={t("people.empty")}>
          {(list) => (
            <DataTable
              caption={t("people.members")}
              rows={list}
              columns={[
                { key: "fullName", header: t("people.name"), className: "font-medium text-fg-muted" },
                ...(isTeacher ? [
                  { key: "learnerCode", header: l("code"), className: "font-mono text-fg-muted", render: (p) => p.learnerCode || "—" },
                  { key: "email", header: t("people.emailCol"), hideOnMobile: true, className: "text-fg-muted", render: (p) => p.email || "—" },
                ] : []),
                { key: "role", header: t("people.role"), className: "text-fg-muted", render: (p) => roleLabel(p.role) },
                ...(isTeacher ? [
                  { key: "status", header: t("people.status"), className: "text-fg-muted", render: (p) => tOr(`people.statuses.${p.status}`, p.status) },
                ] : []),
                ...(isTeacher ? [{
                  key: "manage",
                  header: t("people.manage"),
                  align: "right",
                  render: (person) => (
                    <div className="flex items-center justify-end gap-1">
                      {person.canResetPassword && (
                        <button onClick={() => resetPassword(person)} aria-label={fill(l("resetNamed"), { name: person.fullName || person.learnerCode || "" })} title={l("resetPassword")} className="p-1.5 rounded-md hover:bg-surface-hover text-fg-muted">
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isCourseTeacher || person.role === "student" || person.role === "observer" ? (
                        <button onClick={() => removePerson(person)} aria-label={tf("people.removeNamed", { name: person.fullName || person.email || "" })} className="p-1.5 rounded-md hover:bg-surface-hover text-danger-fg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ),
                }] : []),
              ]}
            />
          )}
        </AsyncListState>
      </div>

      {addingLearners && (
        <AddLearners courseId={courseId} courseTitle={course?.title} onClose={() => setAddingLearners(false)} onChanged={refetch} />
      )}
      {resetDone && (
        <Modal title={fill(l("resetTitle"), { name: resetDone.fullName })} onClose={() => setResetDone(null)} size="lg" dirty>
          <CredentialSheet rows={[resetDone]} courseTitle={course?.title} onDone={() => setResetDone(null)} />
        </Modal>
      )}
    </div>
  );
}
