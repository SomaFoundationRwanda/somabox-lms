"use client";
import React, { useState, useEffect } from 'react';
import { ReactReader } from 'react-reader';
import { AlertTriangle, X } from 'lucide-react';
import { MediaAccessNotice } from '@/components/guest/MediaAccess';
import { getSessionToken } from '@/lib/session';
import SummaryPanel, { SummaryToggleButton, useContentSummary } from '@/components/explore/SummaryPanel';

// `summaryPath`: the book's path_key, to offer its AI summary beside the reader.
const EpubReader = ({ url, title, onClose, summaryPath = null }) => {
    const [summaryOpen, setSummaryOpen] = useState(false)
    const summary = useContentSummary(summaryPath, { active: Boolean(summaryPath) })
    const [location, setLocation] = useState(null)
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    // "guest" | "expired" | "forbidden" when the book couldn't be opened for sign-in reasons.
    const [access, setAccess] = useState(null)
    const renditionRef = React.useRef(null)

    useEffect(() => {
        async function loadEpub() {
            try {
                setLoading(true)
                setError(null)
                setAccess(null)
                // The book is fetched here (with the session token and the media cookie,
                // credentials: "include" via the fetch wrapper) and handed to epub.js as a Blob,
                // so epub.js itself makes no credentialed requests.
                const signedIn = Boolean(getSessionToken())
                const response = await fetch(url, { credentials: 'include' })
                if (response.status === 401) {
                    setAccess(signedIn ? 'expired' : 'guest')
                    return
                }
                if (response.status === 403) {
                    setAccess('forbidden')
                    return
                }
                if (!response.ok) throw new Error(`Failed to fetch book: ${response.statusText}`)
                const buffer = await response.arrayBuffer()
                // Convert to Blob for better compatibility with epub.js
                const blob = new Blob([buffer], { type: 'application/epub+zip' })
                setData(blob)
            } catch (err) {
                console.error("Error loading EPUB:", err)
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        if (url) loadEpub()
    }, [url])

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
            <div className="bg-white w-full h-full max-w-7xl rounded-md overflow-hidden flex flex-col shadow-2xl relative">
                {/* Header */}
                <div className="flex items-center justify-between gap-2 p-4 border-b border-gray-100 bg-white z-10">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-blue-50 rounded-lg">
                            <span className="text-xl"></span>
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800 line-clamp-1">{title}</h2>
                            {/* <p className="text-xs text-gray-500">Reading Mode</p> */}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                    <SummaryToggleButton
                        state={summary}
                        open={summaryOpen}
                        onToggle={() => setSummaryOpen((v) => !v)}
                        controls="reader-summary"
                        className="bg-teal-50 text-teal-900 hover:bg-teal-100"
                    />
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                        title="Close Reader"
                        aria-label="Close Reader"
                    >
                        <X className="w-6 h-6 text-gray-600 group-hover:text-gray-600" />
                    </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col md:flex-row">

                {/* Reader Container */}
                <div className="flex-1 min-h-0 min-w-0 relative bg-white flex items-center justify-center overflow-hidden">
                    {access ? (
                        <MediaAccessNotice state={access} />
                    ) : loading ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                            <p className="text-gray-500 font-medium">Opening your book...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center p-8">
                            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-800 mb-2">Failed to load book</h3>
                            <p className="text-gray-500 max-w-md mx-auto">{error}</p>
                            <button
                                onClick={onClose}
                                className="mt-6 px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                            >
                                Go Back
                            </button>
                        </div>
                    ) : (
                        <div className="w-full h-full">
                            <ReactReader
                                url={data}
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
                    <aside id="reader-summary" className="bg-white w-full md:w-[380px] max-h-[50%] md:max-h-none shrink-0 overflow-y-auto p-4 border-t md:border-t-0 md:border-l border-slate-200">
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
                {/* <div className="p-2 bg-gray-50 border-t border-gray-100 flex justify-center items-center">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">Soma-X Library Reader</p>
                </div> */}
            </div>
        </div>
    )
}

export default EpubReader
