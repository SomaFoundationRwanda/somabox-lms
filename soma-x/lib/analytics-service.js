"use client";

// School-wide reports. They take real work on the box, so each is loaded once and kept until the
// app reloads (no refreshing behind the admin's back).
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";

const EMPTY_GROWTH = { weeks: [], baselineAverage: null, baselineLearners: 0 };

/**
 * Weekly average of outcome results (baseline excluded) plus the baseline average:
 * { data: { weeks: [{ weekStart, averagePct, learners, results }], baselineAverage, baselineLearners }, error, loading }.
 * Admins get the whole school, teachers the learners they teach, learners themselves.
 */
export function useGrowthCurves(scholarEmail, weeks = 26) {
    const params = new URLSearchParams();
    if (scholarEmail) params.set("scholarEmail", scholarEmail);
    if (weeks) params.set("weeks", String(weeks));
    const query = useQuery({
        queryKey: ["analytics", "growth", scholarEmail || "all", weeks],
        queryFn: async () => {
            const payload = await apiFetch(`/analytics/growth-curves?${params}`);
            return {
                weeks: Array.isArray(payload.weeks) ? payload.weeks : [],
                baselineAverage: payload.baselineAverage ?? null,
                baselineLearners: Number(payload.baselineLearners || 0),
            };
        },
    });
    return { data: query.data || EMPTY_GROWTH, error: query.isError ? getErrorMessage(query.error) : "", loading: query.isPending };
}

/** Average results by rural/urban, gender and accessibility needs (null if it can't be loaded). */
export function useInclusivityGap() {
    const query = useQuery({ queryKey: ["analytics", "inclusivity-gap"], queryFn: () => apiFetch("/analytics/inclusivity-gap") });
    return { report: query.data ?? null, loading: query.isPending };
}
