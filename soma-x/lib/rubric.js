// Rubric grade preview. Mirrors the server: criteria with a max of 0 are skipped;
// grade = pointsPossible * Σ(w * p / max) / Σ(w), rounded to 2 decimals. Null when nothing counts.
export function rubricGradePreview(criteria, scoresById, pointsPossible) {
  let weighted = 0;
  let weights = 0;
  for (const c of criteria || []) {
    const raw = scoresById?.[c.id];
    if (raw === undefined || raw === null || raw === "") continue;
    const p = Number(raw);
    const max = Number(c.points);
    if (!Number.isFinite(p) || !(max > 0)) continue;
    const w = Number(c.weight) > 0 ? Number(c.weight) : 1;
    weighted += w * (p / max);
    weights += w;
  }
  if (weights === 0) return null;
  return Math.round(Number(pointsPossible || 0) * (weighted / weights) * 100) / 100;
}

export const fmtPoints = (n) => {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
};

export const pctOf = (grade, possible) =>
  grade != null && Number(possible) > 0 ? Math.round((Number(grade) / Number(possible)) * 1000) / 10 : null;
