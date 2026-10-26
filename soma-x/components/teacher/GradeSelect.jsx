"use client"
import { useId, useState } from "react"
import { useLanguage } from "@/context/LanguageContext"
import { Select, TextInput } from "@/components/form"

export const GRADE_CODES = ["P1", "P2", "P3", "P4", "P5", "P6", "S1", "S2", "S3", "S4", "S5", "S6"]

// The course's class level, the same everywhere it's chosen: a P1–S6 list, or "Other" with a
// short description. value/onChange carry the stored grade (a code, or the teacher's own text).
export default function GradeSelect({ id, value = "", onChange }) {
  const { t } = useLanguage()
  const known = GRADE_CODES.includes(value)
  // "Other" is chosen explicitly (text still empty) or implied by a grade outside the list.
  const [other, setOther] = useState(false)
  // Its own id: inside a Field, the field's id belongs to the dropdown.
  const otherId = `grade-other-${useId()}`
  const selectValue = known ? value : other || value ? "other" : ""

  return (
    <>
      <Select
        id={id}
        aria-label={t("teacher.createCourse.grade")}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value
          setOther(next === "other")
          onChange(next === "other" ? "" : next)
        }}
      >
        <option value="">{t("teacher.createCourse.selectGrade")}</option>
        {GRADE_CODES.map((code) => (
          <option key={code} value={code}>{t(`teacher.grades.${code}`)}</option>
        ))}
        <option value="other">{t("teacher.grades.other")}</option>
      </Select>
      {selectValue === "other" && (
        <TextInput
          id={otherId}
          aria-label={t("teacher.createCourse.describeGrade")}
          placeholder={t("teacher.createCourse.describeGrade")}
          value={known ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2"
        />
      )}
    </>
  )
}
