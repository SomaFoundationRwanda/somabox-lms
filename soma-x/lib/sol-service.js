export async function getPendingSpacedReviews(serverUrl) {
    if (!serverUrl) return [];
    try {
        const res = await fetch(`${serverUrl}/sol/spaced/pending`);
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export async function completeSpacedReview(serverUrl, reviewId) {
    try {
        const res = await fetch(`${serverUrl}/sol/spaced/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewId })
        });
        return await res.json();
    } catch (err) {
        return { message: err.message };
    }
}

export async function getDiagnosticStatus(serverUrl) {
    if (!serverUrl) return { isCompleted: true };
    try {
        const res = await fetch(`${serverUrl}/sol/diagnostic/status`);
        if (!res.ok) return { isCompleted: true };
        return await res.json();
    } catch {
        return { isCompleted: true };
    }
}

export async function submitDiagnosticQuiz(serverUrl, overallScore, subjectBreakdown) {
    try {
        const res = await fetch(`${serverUrl}/sol/diagnostic/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ overallScore, subjectBreakdown })
        });
        return await res.json();
    } catch (err) {
        return { message: err.message };
    }
}
