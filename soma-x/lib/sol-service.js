// Practice (spaced reviews, the diagnostic): loaded once per visit, never refreshed behind the
// learner, so the questions don't change mid-practice. The first argument (the server address)
// is kept for the existing callers; requests go through apiFetch.
import { apiFetch } from "@/lib/api";

export async function getPendingSpacedReviews() {
    try {
        return await apiFetch("/sol/spaced/pending");
    } catch {
        return [];
    }
}

export async function completeSpacedReview(_serverUrl, reviewId) {
    try {
        return await apiFetch("/sol/spaced/complete", { method: "POST", json: { reviewId } });
    } catch (err) {
        return { message: err.body?.message || err.message };
    }
}

export async function getDiagnosticStatus() {
    try {
        return await apiFetch("/sol/diagnostic/status");
    } catch {
        return { isCompleted: true };
    }
}

export async function submitDiagnosticQuiz(_serverUrl, overallScore, subjectBreakdown) {
    try {
        return await apiFetch("/sol/diagnostic/submit", { method: "POST", json: { overallScore, subjectBreakdown } });
    } catch (err) {
        return { message: err.body?.message || err.message };
    }
}
