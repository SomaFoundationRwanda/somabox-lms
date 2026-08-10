export async function getGrowthCurves(serverUrl, scholarEmail) {
    if (!serverUrl) return [];
    try {
        const query = scholarEmail ? `?scholarEmail=${encodeURIComponent(scholarEmail)}` : '';
        const res = await fetch(`${serverUrl}/analytics/growth-curves${query}`);
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
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

export async function triggerMeSync(serverUrl) {
    try {
        const res = await fetch(`${serverUrl}/analytics/me-sync`, { method: "POST" });
        return await res.json();
    } catch (err) {
        return { message: err.message };
    }
}
