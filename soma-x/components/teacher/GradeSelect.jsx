"use client"
import { useState } from "react"
import { useLanguage } from "@/context/LanguageContext"

export const GRADE_CODES = ["P1", "P2", "P3", "P4", "P5", "P6", "S1", "S2", "S3", "S4", "S5", "S6"]

const fieldClass = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[var(--brand-secondary)] bg-white"

// The course's class level, the same everywhere it's chosen: a P1–S6 list, or "Other" with a
// short description. value/onChange carry the stored grade (a code, or the teacher's own text).
export default function GradeSelect({ id, value = "", onChange }) {
  const { t } = useLanguage()
  const known = GRADE_CODES.includes(value)
  // "Other" is chosen explicitly (text still empty) or implied by a grade outside the list.
  const [other, setOther] = useState(false)
  const selectValue = known ? value : other || value ? "other" : ""

  return (
    <>
      <select
        id={id}
        aria-label={t("teacher.createCourse.grade")}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value
          setOther(next === "other")
          onChange(next === "other" ? "" : next)
        }}
        className={fieldClass}
      >
        <option value="">{t("teacher.createCourse.selectGrade")}</option>
        {GRADE_CODES.map((code) => (
          <option key={code} value={code}>{t(`teacher.grades.${code}`)}</option>
        ))}
        <option value="other">{t("teacher.grades.other")}</option>
      </select>
      {selectValue === "other" && (
        <input
          aria-label={t("teacher.createCourse.describeGrade")}
          type="text"
          placeholder={t("teacher.createCourse.describeGrade")}
          value={known ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldClass} mt-2`}
        />
      )}
    </>
  )
}
