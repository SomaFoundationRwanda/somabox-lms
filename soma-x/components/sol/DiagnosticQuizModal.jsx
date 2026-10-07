"use client"
import { useState } from "react";
import { Award, BookOpen, Brain, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitDiagnosticQuiz } from "@/lib/sol-service";
import PracticeLabel from "@/components/sol/PracticeLabel";

const DIAGNOSTIC_QUESTIONS = [
    { id: 1, subject: "Mathematics", question: "What is 15% of 200?", options: ["20", "25", "30", "35"], correct: 2 },
    { id: 2, subject: "Mathematics", question: "Solve for y: 2y + 8 = 20", options: ["y = 4", "y = 6", "y = 8", "y = 10"], correct: 1 },
    { id: 3, subject: "Science", question: "Which organelle is known as the powerhouse of the cell?", options: ["Nucleus", "Ribosome", "Mitochondria", "Golgi Apparatus"], correct: 2 },
    { id: 4, subject: "Science", question: "What is the acceleration due to gravity on Earth (approx)?", options: ["4.8 m/s²", "9.8 m/s²", "12.2 m/s²", "15.0 m/s²"], correct: 1 },
    { id: 5, subject: "Literacy", question: "Choose the synonym for 'Abundant':", options: ["Scarce", "Plentiful", "Tiny", "Difficult"], correct: 1 }
];

export default function DiagnosticQuizModal({ isOpen, onClose, serverUrl, scholarEmail }) {
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl">
                {!isFinished ? (
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="p-2 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400 rounded-xl">
                                <Brain className="w-5 h-5" />
                            </span>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                    Baseline Assessment
                                </span>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                    Getting Started Quiz
                                </h3>
                            </div>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                            Welcome to SOMABOX! A few quick questions to get a sense of where you're starting from.
                        </p>
                        <p className="mb-4"><PracticeLabel /></p>

                        <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                            <span>Subject: {currentQ.subject}</span>
                            <span>Question {step + 1} of {DIAGNOSTIC_QUESTIONS.length}</span>
                        </div>

                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full mb-4 overflow-hidden">
                            <div
                                className="h-full bg-teal-600 transition-all duration-300 rounded-full"
                                style={{ width: `${((step + 1) / DIAGNOSTIC_QUESTIONS.length) * 100}%` }}
                            />
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl mb-4 border border-slate-100 dark:border-slate-800">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
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
                                        className={`w-full text-left p-3.5 text-xs rounded-xl border font-semibold transition-all flex items-center justify-between ${
                                            isSelected
                                                ? "border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 shadow-sm"
                                                : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300"
                                        }`}
                                    >
                                        <span>{opt}</span>
                                        {isSelected && <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex justify-end">
                            <Button
                                onClick={handleNext}
                                disabled={answers[currentQ.id] === undefined || isSubmitting}
                                className="bg-[#203A3A] hover:bg-[#162727] text-white text-xs font-extrabold px-6 h-10 rounded-xl"
                            >
                                {step + 1 < DIAGNOSTIC_QUESTIONS.length ? "Next Question" : (isSubmitting ? "Submitting..." : "Complete Assessment")}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <Award className="w-16 h-16 text-teal-500 mx-auto mb-3 animate-bounce" />
                        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">
                            Done!
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                            Thanks for completing the quiz — you're ready to start your classes.
                        </p>
                        <Button
                            onClick={onClose}
                            className="bg-[#203A3A] hover:bg-[#162727] text-white text-xs font-bold px-8 h-10 rounded-xl"
                        >
                            Go to Dashboard
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
