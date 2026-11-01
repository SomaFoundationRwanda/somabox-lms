"use client";
import React, { useState, useEffect } from 'react';
import { ReactReader } from 'react-reader';
import { AlertTriangle, X } from 'lucide-react';
import { MediaAccessNotice } from '@/components/guest/MediaAccess';
import { useLanguage } from '@/context/LanguageContext';
import SummaryPanel, { SummaryToggleButton, useContentSummary } from '@/components/explore/SummaryPanel';
import FileProgress from "@/components/ui/FileProgress";
import { getErrorMessage } from '@/lib/api'
import { useFileDownload } from '@/lib/useFileDownload'

// `summaryPath`: the book's path_key, to offer its AI summary beside the reader.
const EpubReader = ({ url, title, onClose, summaryPath = null }) => {
    const { t } = useLanguage()
    const [summaryOpen, setSummaryOpen] = useState(false)
    const summary = useContentSummary(summaryPath, { active: Boolean(summaryPath) })
    const [location, setLocation] = useState(null)
    const renditionRef = React.useRef(null)
    // The book is fetched here (with the session token and the media cookie) and handed to epub.js
    // as a Blob, so epub.js itself makes no credentialed requests; the download shows its progress.
    const book = useFileDownload(url, { type: 'application/epub+zip' })
    const access = ['guest', 'expired', 'forbidden'].includes(book.state) ? book.state : null
    const error = book.state === 'error'
        ? (book.error?.status === 0 ? getErrorMessage(book.error) : book.error?.message || t("learner.reader.failed"))
        : null

    // UX Improvements: Escape key and Scroll Lock
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };

        // Disable background scroll
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            // Re-enable background scroll
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const locationChanged = (epubcifi) => {
        setLocation(epubcifi)
    }

    return (
        <div className="fixed inset-0 right-[5%] z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-0 md:p-4">
            <div className="bg-surface w-full h-full max-w-7xl rounded-md overflow-hidden flex flex-col shadow-2xl relative">
                {/* Header */}
                <div className="flex items-center justify-between gap-2 p-4 border-b border-line bg-surface z-10">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-info-soft rounded-lg">
                            <span className="text-section"></span>
                        </div>
                        <div>
                            <h2 className="font-bold text-fg line-clamp-1">{title}</h2>
                            {/* <p className="text-caption text-fg-subtle">Reading Mode</p> */}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                    <SummaryToggleButton
                        state={summary}
                        open={summaryOpen}
                        onToggle={() => setSummaryOpen((v) => !v)}
                        controls="reader-summary"
                        className="bg-brand-soft text-brand-fg hover:bg-brand-soft"
                    />
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-surface-hover rounded-full transition-colors group"
                        title={t("learner.reader.close")}
                        aria-label={t("learner.reader.close")}
                    >
                        <X className="w-6 h-6 text-fg-muted group-hover:text-fg-muted" />
                    </button>
                    </div>
                </div>

                <div className="relative flex-1 min-h-0 flex flex-col md:flex-row">
                {/* Reader Container */}
                <div className="flex-1 min-h-0 min-w-0 relative bg-surface flex items-center justify-center overflow-hidden">
                    {access ? (
                        <MediaAccessNotice state={access} />
                    ) : book.state === 'loading' ? (
                        <FileProgress percent={book.percent} received={book.received} />
                    ) : error ? (
                        <div className="text-center p-8">
                            <AlertTriangle className="w-10 h-10 text-warning-fg mx-auto mb-4" />
                            <h3 className="text-section font-bold text-fg mb-2">{t("learner.reader.failed")}</h3>
                            <p className="text-fg-subtle max-w-md mx-auto">{error}</p>
                            <button
                                onClick={onClose}
                                className="mt-6 px-6 py-2 bg-surface-sunken hover:bg-surface-hover text-fg-muted rounded-lg transition-colors"
                            >
                                {t("learner.reader.goBack")}
                            </button>
                        </div>
                    ) : (
                        <div className="w-full h-full">
                            <ReactReader
                                url={book.blob}
                                location={location}
                                locationChanged={locationChanged}
                                title={title}
                                swipeable={true}
                                getRendition={(rendition) => {
                                    renditionRef.current = rendition
                                    rendition.themes.fontSize('100%')
                                }}
                                epubOptions={{
                                    allowPopups: true,
                                    allowScriptedContent: true,
                                }}
                            />
                        </div>
                    )}
                </div>
                {summaryOpen && summaryPath ? (
                    <aside id="reader-summary" className="bg-surface w-full md:w-[380px] max-h-[50%] md:max-h-none shrink-0 overflow-y-auto p-4 border-t md:border-t-0 md:border-l border-line">
                        <SummaryPanel
                            pathKey={summaryPath}
                            state={summary}
                            onClose={() => setSummaryOpen(false)}
                            headingId="reader-summary-title"
                        />
                    </aside>
                ) : null}
                </div>

                {/* Footer/Progress (Optional) */}
                {/* <div className="p-2 bg-surface-sunken border-t border-line flex justify-center items-center">
                    <p className="text-caption text-fg-muted font-medium">Soma-X Library Reader</p>
                </div> */}
            </div>
        </div>
    )
}

export default EpubReader
