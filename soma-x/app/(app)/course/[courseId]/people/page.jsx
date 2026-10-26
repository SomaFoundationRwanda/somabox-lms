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

const ROLE_OPTIONS = ["teacher", "ta", "student", "observer"];

export default function PeoplePage() {
  const { courseId, isTeacher, course } = useCourse();
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

  const removePerson = async (enrollmentId) => {
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
              <button onClick={() => setAddingLearners(true)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] rounded-lg px-3 py-2">
                <UserPlus className="w-3.5 h-3.5" /> {t("people.addLearners")}
              </button>
              <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-3 py-2">
                <Plus className="w-3.5 h-3.5" /> {t("people.add")}
              </button>
            </div>
          ) : null}
        />

        {/* Learners join with the code; email is for the few who have one (and for staff). */}
        {isTeacher ? <JoinCodePanel courseId={courseId} isDraft={course?.lifecycle === "draft"} /> : null}

        {adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder={t("people.email")} aria-label={t("people.email")} className="flex-1 min-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-primary)]" />
            <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} aria-label={t("people.role")} className="text-sm border border-slate-200 rounded-lg px-2 py-2">
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <button onClick={addPerson} className="text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg px-3 py-2">{t("common.add")}</button>
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={t("people.filterByRole")}>
          {["all", ...ROLE_OPTIONS].map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)} aria-pressed={roleFilter === r} className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${roleFilter === r ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]" : "border-slate-200 text-slate-600"}`}>
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
                { key: "fullName", header: t("people.name"), className: "font-medium text-slate-700 dark:text-slate-200" },
                ...(isTeacher ? [
                  { key: "learnerCode", header: l("code"), className: "font-mono text-slate-600 dark:text-slate-400", render: (p) => p.learnerCode || "—" },
                  { key: "email", header: t("people.emailCol"), hideOnMobile: true, className: "text-slate-600 dark:text-slate-400", render: (p) => p.email || "—" },
                ] : []),
                { key: "role", header: t("people.role"), className: "text-slate-600 dark:text-slate-400", render: (p) => roleLabel(p.role) },
                { key: "status", header: t("people.status"), className: "text-slate-600 dark:text-slate-400", render: (p) => tOr(`people.statuses.${p.status}`, p.status) },
                ...(isTeacher ? [{
                  key: "manage",
                  header: t("people.manage"),
                  align: "right",
                  render: (person) => (
                    <div className="flex items-center justify-end gap-1">
                      {person.canResetPassword && (
                        <button onClick={() => resetPassword(person)} aria-label={fill(l("resetNamed"), { name: person.fullName || person.learnerCode || "" })} title={l("resetPassword")} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600">
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => removePerson(person.id)} aria-label={tf("people.removeNamed", { name: person.fullName || person.email || "" })} className="p-1.5 rounded-md hover:bg-slate-100 text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
