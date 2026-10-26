"use client";

// Gender and accessibility needs: the same field, options and words wherever someone answers
// them (the first-visit profile form, the account page).
import { useLanguage } from "@/context/LanguageContext";
import { ChoiceGroup, Field, Select } from "@/components/form";
import { ACCESS_NEEDS, GENDERS } from "@/lib/profileOptions";

/** variant "choices" (buttons, for a form with room) or "select" (a dropdown, for a compact one). */
export function GenderField({ value, onChange, variant = "choices", error, required = true, size = "md", showHelp = true }) {
    const { t } = useLanguage();
    const options = GENDERS.map((g) => ({ value: g, label: t(`shell.people.genders.${g}`) }));
    return (
        <Field label={t("shell.people.gender")} hint={showHelp ? t("shell.people.genderHelp") : undefined} error={error} required={required}>
            {variant === "select"
                ? <Select value={value || ""} onChange={(e) => onChange(e.target.value)} options={options} placeholder={t("shell.people.chooseOne")} size={size} />
                : <ChoiceGroup value={value} onChange={onChange} options={options} columns={3} size={size} />}
        </Field>
    );
}

export function AccessibilityField({ value, onChange, error, required = true, size = "md" }) {
    const { t } = useLanguage();
    const options = ACCESS_NEEDS.map((a) => ({ value: a, label: t(`shell.people.access.${a}`) }));
    return (
        <Field label={t("shell.people.accessibility")} error={error} required={required}>
            <Select value={value || ""} onChange={(e) => onChange(e.target.value)} options={options} placeholder={t("shell.people.chooseOne")} size={size} />
        </Field>
    );
}
