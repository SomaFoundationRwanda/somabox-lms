"use client";

import { CheckboxField, Label, Select } from "@/components/form";
import { useProgressText } from "@/components/progress/text";
import { GRADE_CATEGORIES, categoryLabel } from "@/lib/gradeCategories";

// Graded work's type (required: it decides the work's group in Grades) and whether learners
// wait for the teacher to publish the scores. Shared by the assignment and quiz editors.
export default function GradingFields({ id, category, onCategory, scoresHidden, onScoresHidden }) {
  const { tp } = useProgressText();
  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Label htmlFor={`${id}-category`}>{tp("categories.label")} *</Label>
        <Select id={`${id}-category`} value={category} onChange={(e) => onCategory(e.target.value)} placeholder={tp("categories.choose")} required className="w-full">
          {GRADE_CATEGORIES.map((k) => <option key={k} value={k}>{categoryLabel(tp, k)}</option>)}
        </Select>
        <span className="block text-caption text-fg-subtle">{tp("categories.help")}</span>
      </div>
      <CheckboxField id={`${id}-scores-hidden`} label={tp("categories.hideScores")} hint={tp("categories.hideScoresHelp")} checked={scoresHidden} onCheckedChange={onScoresHidden} />
    </div>
  );
}
