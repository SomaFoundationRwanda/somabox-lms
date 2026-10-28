"use client"
import { useState } from "react";
import { Award, BookOpen, Brain, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitDiagnosticQuiz } from "@/lib/sol-service";
import PracticeLabel from "@/components/sol/PracticeLabel";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

// The questions themselves stay in English: they test English-language items (e.g. synonyms),
// so translating them would change what they measure. The screen around them is translated.
const SUBJECT_KEYS = { Mathematics: "math", Science: "science", Literacy: "literacy" };

const DIAGNOSTIC_QUESTIONS = [
    { id: 1, subject: "Mathematics", question: "What is 15% of 200?", options: ["20", "25", "30", "35"], correct: 2 },
    { id: 2, subject: "Mathematics", question: "Solve for y: 2y + 8 = 20", options: ["y = 4", "y = 6", "y = 8", "y = 10"], correct: 1 },
    { id: 3, subject: "Science", question: "Which organelle is known as the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi Apparatus"], correct: 2 },
    { id: 4, subject: "Science", question: "What is the acceleration due to gravity on Earth (approx)?", options: ["4.8 m/s²", "9.8 m/s²", "12.2 m/s²", "15.0 m/s²"], correct: 1 },
    { id: 5, subject: "Literacy", question: "Choose the synonym for 'Abundant':", options: ["Scarce", "Plentiful", "Tiny", "Difficult"], correct: 1 }
];

export default function DiagnosticQuizModal({ isOpen, onClose, serverUrl, scholarEmail }) {
    const { t } = useLanguage();
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isFinished, setIsFinished] = useState(false);

    if (!isOpen) return null;

    const currentQ = DIAGNOSTIC_QUESTIONS[step];

    const handleSelectOption = (optIdx) => {
        setAnswers(prev => ({ ...prev, [currentQ.id]: optIdx }));
    };

    const handleNext = async () => {
        if (step + 1 < DIAGNOSTIC_QUESTIONS.length) {
            setStep(step + 1);
        } else {
            setIsSubmitting(true);
            let correctCount = 0;
            const breakdown = { Mathematics: 0, Science: 0, Literacy: 0 };
            const counts = { Mathematics: 0, Science: 0, Literacy: 0 };

            DIAGNOSTIC_QUESTIONS.forEach(q => {
                counts[q.subject]++;
                if (answers[q.id] === q.correct) {
                    correctCount++;
                    breakdown[q.subject]++;
                }
            });

            const overallScore = Math.round((correctCount / DIAGNOSTIC_QUESTIONS.length) * 100);
            const subjectPct = {
                Mathematics: Math.round((breakdown.Mathematics / counts.Mathematics) * 100),
                Science: Math.round((breakdown.Science / counts.Science) * 100),
                Literacy: Math.round((breakdown.Literacy / counts.Literacy) * 100),
            };

            await submitDiagnosticQuiz(serverUrl, overallScore, subjectPct);
            setIsSubmitting(false);
            setIsFinished(true);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim backdrop-blur-md p-4">
            <div className="bg-surface-raised border border-line rounded-3xl max-w-xl w-full p-6 shadow-2xl">
                {!isFinished ? (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="p-2 bg-brand-soft text-brand-fg rounded-xl">
                                <Brain className="w-5 h-5" />
                            </span>
                            <div>
                                <span className="text-caption font-extrabold text-brand-fg">
                                    {t("learner.diagnostic.eyebrow")}
                                </span>
                                <h3 className="text-section font-extrabold text-fg">
                                    {t("learner.diagnostic.title")}
                                </h3>
                            </div>
                        </div>

                        <p className="text-caption text-fg-subtle mb-4">
                            {t("learner.diagnostic.intro")}
                        </p>
                        <p className="mb-4"><PracticeLabel /></p>

                        <div className="flex items-center justify-between text-caption font-bold text-fg-subtle mb-2">
                            <span>{fill(t("learner.diagnostic.subject"), { subject: t(`learner.diagnostic.subjects.${SUBJECT_KEYS[currentQ.subject]}`) || currentQ.subject })}</span>
                            <span>{fill(t("learner.diagnostic.questionOf"), { n: step + 1, total: DIAGNOSTIC_QUESTIONS.length })}</span>
                        </div>

                        <div className="h-1.5 w-full bg-surface-sunken rounded-full mb-4 overflow-hidden">
                            <div
                                className="h-full bg-brand transition-all duration-300 rounded-full"
                                style={{ width: `${((step + 1) / DIAGNOSTIC_QUESTIONS.length) * 100}%` }}
                            />
                        </div>

                        <div className="bg-surface-sunken p-4 rounded-2xl mb-4 border border-line">
                            <p className="text-ui font-bold text-fg">
                                {currentQ.question}
                            </p>
                        </div>

                        <div className="space-y-2 mb-6">
                            {currentQ.options.map((opt, idx) => {
                                const isSelected = answers[currentQ.id] === idx;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectOption(idx)}
                                        className={`w-full text-left p-3.5 text-caption rounded-xl border font-semibold transition-all flex items-center justify-between ${
                                            isSelected
                                                ? "border-brand bg-brand-soft text-brand-fg shadow-sm"
                                                : "border-line hover:bg-surface-hover text-fg-muted"
                                        }`}
                                    >
                                        <span>{opt}</span>
                                        {isSelected && <CheckCircle className="w-4 h-4 text-brand-fg shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex justify-end">
                            <Button
                                onClick={handleNext}
                                disabled={answers[currentQ.id] === undefined || isSubmitting}
                                className="bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-caption font-extrabold px-6 h-10 rounded-xl"
                            >
                                {step + 1 < DIAGNOSTIC_QUESTIONS.length ? t("learner.diagnostic.next") : (isSubmitting ? t("learner.diagnostic.submitting") : t("learner.diagnostic.finish"))}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <Award className="w-16 h-16 text-brand-fg mx-auto mb-3 animate-bounce" />
                        <h3 className="text-section font-extrabold text-fg mb-1">
                            {t("learner.diagnostic.done")}
                        </h3>
                        <p className="text-caption text-fg-subtle max-w-md mx-auto mb-6">
                            {t("learner.diagnostic.doneBody")}
                        </p>
                        <Button
                            onClick={onClose}
                            className="bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-caption font-bold px-8 h-10 rounded-xl"
                        >
                            {t("learner.diagnostic.toDashboard")}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
