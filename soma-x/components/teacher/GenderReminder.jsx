"use client";

// Teachers aren't asked anything at first sign-in, but the school reports on gender: until a
// teacher's gender is recorded (by them, or by the admin), every teacher page reminds them, with
// the answer one tap away. It can't be dismissed: it goes once answered.
import { useContext, useState } from "react";
import { UserRound } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/api";
import { GENDERS } from "@/lib/profileOptions";

export const MY_PROFILE_KEY = ["me", "profile"];

/** The signed-in person's profile (gender, phone…), shared by the reminder and Settings. */
export function useMyProfile(enabled = true) {
  return useQuery({ queryKey: MY_PROFILE_KEY, queryFn: () => apiFetch("/users/profile/view"), enabled });
}

export default function GenderReminder() {
  const { user, authenticated } = useContext(DataContext);
  const { t } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isTeacher = authenticated && user?.role === "teacher" && !user?.mustChangePassword;
  const profile = useMyProfile(isTeacher);
  const [saving, setSaving] = useState("");

  if (!isTeacher || !profile.data || ["male", "female", "other"].includes(profile.data.gender)) return null;

  const answer = async (gender) => {
    setSaving(gender);
    try {
      await apiFetch("/users/profile/update", { method: "PATCH", json: { gender } });
      await queryClient.invalidateQueries({ queryKey: MY_PROFILE_KEY });
      showToast(t("teacher.genderReminder.saved"), "success");
    } catch {
      showToast(t("teacher.common.somethingWrong"), "error");
    } finally {
      setSaving("");
    }
  };

  return (
    <section role="region" aria-label={t("teacher.genderReminder.title")} className="mb-4 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <UserRound className="w-4 h-4 mt-0.5 text-warning-fg shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-ui font-semibold text-warning-fg">{t("teacher.genderReminder.title")}</p>
          <p className="text-caption text-warning-fg/90">{t("teacher.genderReminder.body")}</p>
        </div>
      </div>
      <div className="flex gap-2 shrink-0" role="group" aria-label={t("shell.people.gender")}>
        {GENDERS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => answer(g)}
            disabled={!!saving}
            className="text-caption font-semibold rounded-lg px-3 py-1.5 border border-warning/40 bg-surface text-fg hover:bg-surface-hover disabled:opacity-50"
          >
            {t(`shell.people.genders.${g}`)}
          </button>
        ))}
      </div>
    </section>
  );
}
