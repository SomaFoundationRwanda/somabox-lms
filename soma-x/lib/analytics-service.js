const EMPTY_GROWTH = { weeks: [], baselineAverage: null, baselineLearners: 0 };

/**
 * Weekly average of outcome results (baseline excluded) plus the baseline average:
 * { ok, message, data: { weeks: [{ weekStart, averagePct, learners, results }], baselineAverage, baselineLearners } }.
 * Admins get the whole school, teachers the learners they teach, learners themselves.
 */
export async function getGrowthCurves(serverUrl, scholarEmail, weeks = 26) {
    if (!serverUrl) return { ok: false, message: "No server configured", data: EMPTY_GROWTH };
    try {
        const params = new URLSearchParams();
        if (scholarEmail) params.set('scholarEmail', scholarEmail);
        if (weeks) params.set('weeks', String(weeks));
        const res = await fetch(`${serverUrl}/analytics/growth-curves?${params.toString()}`);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, message: payload.message || "Couldn't load growth over time", data: EMPTY_GROWTH };
        return {
            ok: true,
            message: "",
            data: {
                weeks: Array.isArray(payload.weeks) ? payload.weeks : [],
                baselineAverage: payload.baselineAverage ?? null,
                baselineLearners: Number(payload.baselineLearners || 0),
            },
        };
    } catch (err) {
        return { ok: false, message: err?.message || "Couldn't reach the server", data: EMPTY_GROWTH };
    }
}

export async function getInclusivityGap(serverUrl) {
    if (!serverUrl) return null;
    try {
        const res = await fetch(`${serverUrl}/analytics/inclusivity-gap`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export async function getSoLOutcomes(serverUrl, scholarEmail) {
    if (!serverUrl) return null;
    try {
        const query = scholarEmail ? `?scholarEmail=${encodeURIComponent(scholarEmail)}` : '';
        const res = await fetch(`${serverUrl}/analytics/sol-outcomes${query}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export async function getUnitBranding(serverUrl) {
    if (!serverUrl) return null;
    try {
        const res = await fetch(`${serverUrl}/analytics/branding`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export async function saveUnitBranding(serverUrl, brandingData) {
    try {
        const res = await fetch(`${serverUrl}/analytics/branding`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(brandingData)
        });
        return await res.json();
    } catch (err) {
        return { message: err.message };
    }
}

// Sends this box's waiting changes to the cloud now. Returns { ok, message } either way
// (200 when sent, 503 when the cloud couldn't be reached).
export async function triggerMeSync(serverUrl) {
    try {
        const res = await fetch(`${serverUrl}/analytics/me-sync`, { method: "POST" });
        const payload = await res.json().catch(() => ({}));
        return { ...payload, ok: res.ok, message: payload.message || (res.ok ? "Sync finished" : "Sync failed") };
    } catch {
        return { ok: false, message: "Couldn't reach this box. Check the connection and try again." };
    }
}
