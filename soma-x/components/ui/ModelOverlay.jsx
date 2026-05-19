"use client";

import { useEffect } from "react";

const ModalOverlay = ({ children, onClose }) => {
    useEffect(() => {
        document.body.style.overflow = "hidden";

        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = "unset";
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[500] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-2xl mx-auto rounded-2xl shadow-2xl p-3 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-black text-xl"
                    aria-label="Close modal"
                >
                    ×
                </button>

                {children}
            </div>
        </div>
    );
};

export default ModalOverlay;
