export async function getPendingSpacedReviews(serverUrl, scholarEmail) {
    if (!serverUrl || !scholarEmail) return [];
    try {
        const res = await fetch(`${serverUrl}/sol/spaced/pending?scholarEmail=${encodeURIComponent(scholarEmail)}`);
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export async function completeSpacedReview(serverUrl, reviewId, scholarEmail) {
    try {
        const res = await fetch(`${serverUrl}/sol/spaced/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewId, scholarEmail })
        });
        return await res.json();
    } catch (err) {
        return { message: err.message };
    }
}

export async function getDiagnosticStatus(serverUrl, scholarEmail) {
    if (!serverUrl || !scholarEmail) return { isCompleted: true };
    try {
        const res = await fetch(`${serverUrl}/sol/diagnostic/status?scholarEmail=${encodeURIComponent(scholarEmail)}`);
        if (!res.ok) return { isCompleted: true };
        return await res.json();
    } catch {
        return { isCompleted: true };
    }
}

export async function submitDiagnosticQuiz(serverUrl, scholarEmail, overallScore, subjectBreakdown) {
    try {
        const res = await fetch(`${serverUrl}/sol/diagnostic/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scholarEmail, overallScore, subjectBreakdown })
        });
        return await res.json();
    } catch (err) {
        return { message: err.message };
    }
}
