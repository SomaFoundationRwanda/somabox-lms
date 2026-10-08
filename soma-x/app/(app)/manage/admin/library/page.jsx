"use client"
import Unauthorized from "@/components/sections/Unauthorized";
import DataContext from "@/context/DataContext";
import { useContext, useEffect, useState, useRef } from "react";
import ManageTitle from "@/components/manage/ManageTitle";
import { DataTable, Section } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, CheckCircle2, Loader2, Trash2, X, Upload, File, AlertCircle, Eye } from "lucide-react";
import { useCallback } from "react";
import UniversalPlayerModal from "@/components/ui/UniversalPlayerModal";
import dynamic from "next/dynamic";
import { clickableProps } from "@/lib/a11y";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { libraryCoverUrl, libraryFileUrl, libraryShelf, libraryViewer } from "@/components/ui/library/libraryEntry";
import Loader from "@/components/ui/Loader";

// What the library can hold: books, videos and audio.
const LIBRARY_ACCEPT = ".pdf,.epub,.mp4,.webm,.mkv,.m4v,.mov,.mp3,.wav,.ogg,.m4a";

// react-reader (epub.js) loads only when a book is opened.
const EpubReader = dynamic(() => import("@/components/ui/library/EpubReader"), { ssr: false });

function formatBytes(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
}

function Modal({ onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
                onClick={onClose}
            />
            <div className="relative z-10 bg-white rounded-[8px] border border-slate-100 shadow-2xl w-full max-w-md">
                {children}
            </div>
        </div>
    );
}

function LibraryUploadModal({ onClose, onSubmit }) {
    const { t } = useLanguage();
    const [file, setFile] = useState(null);
    const [bookName, setBookName] = useState('');
    const [dragging, setDragging] = useState(false);
    const [status, setStatus] = useState('idle'); // idle | uploading | done | error
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef(null);

    const handleFile = (f) => { 
        if (f) {
            setFile(f); 
            if (!bookName) {
                setBookName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
            }
        }
    };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    }, []);

    const handleDragOver  = (e) => { e.preventDefault(); setDragging(true); };
    const handleDragLeave = ()  => setDragging(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) return;
        setStatus('uploading');
        setErrorMsg('');
        try {
            await onSubmit(file, bookName);
            setStatus('done');
            setTimeout(onClose, 1200);
        } catch (err) {
            setErrorMsg(err.message || t("admin.library.uploadFailed"));
            setStatus('error');
        }
    };

    return (
        <Modal onClose={status === 'uploading' ? undefined : onClose}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[5px] bg-slate-100 flex items-center justify-center shrink-0">
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <h2 className="text-[14px] font-black text-slate-900">{t("admin.library.uploadTitle")}</h2>
                </div>
                {status !== 'uploading' && (
                    <button aria-label={t("admin.library.close")}
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-[5px] text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-5">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                            {t("admin.library.file")}
                        </p>
                        <div
                            {...clickableProps(() => fileInputRef.current?.click(), t("admin.library.chooseFile"))}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            className={`relative flex flex-col items-center justify-center gap-2 h-[120px] rounded-[5px] border-2 border-dashed cursor-pointer transition-all ${
                                dragging
                                    ? 'border-accent-dark bg-accent-dark/5 scale-[1.01]'
                                    : file
                                    ? 'border-slate-300 bg-slate-50'
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={LIBRARY_ACCEPT}
                                className="hidden"
                                onChange={(e) => handleFile(e.target.files?.[0])}
                            />

                            {file ? (
                                <>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-[5px] flex items-center justify-center shrink-0 text-violet-600 bg-violet-50">
                                            <BookOpen className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 text-left">
                                            <p className="text-[12px] font-semibold text-slate-800 truncate max-w-[240px]">{file.name}</p>
                                            <p className="text-[10px] text-slate-600 mt-0.5">{formatBytes(file.size)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-2">{t("admin.library.changeFile")}</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-9 h-9 rounded-[5px] bg-slate-100 flex items-center justify-center">
                                        <File className="w-4 h-4 text-slate-600" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[12px] font-semibold text-slate-600">
                                            {t("admin.library.dropHere")} <span className="text-[#0D9488] underline underline-offset-2">{t("admin.library.browse")}</span>
                                        </p>
                                        <p className="text-[10px] text-slate-600 mt-0.5">{t("explore.manager.allowedTypes")}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {file && (
                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                {t("admin.library.bookName")}
                            </label>
                            <input aria-label={t("admin.library.bookName")}
                                type="text"
                                value={bookName}
                                onChange={(e) => setBookName(e.target.value)}
                                placeholder={t("admin.library.bookNamePlaceholder")}
                                className="w-full h-10 px-3 rounded-[5px] border border-slate-200 bg-white text-[13px] outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] transition-all"
                                required
                            />
                        </div>
                    )}

                    {status === 'uploading' && (
                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-[5px] bg-blue-50 border border-blue-100">
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-blue-700">{t("admin.library.uploading")}</p>
                                <div className="h-1 w-full bg-blue-100 rounded-full mt-1.5 overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/4" />
                                </div>
                            </div>
                        </div>
                    )}
                    {status === 'done' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[5px] bg-green-50 border border-green-100">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            <p className="text-[12px] font-semibold text-green-700">{t("admin.library.uploadDone")}</p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[5px] bg-red-50 border border-red-100">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                            <p className="text-[12px] font-semibold text-red-600">{errorMsg}</p>
                        </div>
                    )}
                </div>

                {status !== 'done' && (
                    <div className="flex gap-2 px-5 pb-5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={status === 'uploading'}
                            className="flex-1 h-9 rounded-[5px] border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                        >
                            {t("admin.common.cancel")}
                        </button>
                        <Button
                            type="submit"
                            disabled={!file || status === 'uploading'}
                            className="flex-1 h-9 rounded-[5px] text-[12px] font-semibold gap-1.5 bg-[#0D9488] hover:bg-[#0f766e] text-white"
                        >
                            {status === 'uploading'
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("admin.library.uploading")}</>
                                : <><Upload className="w-3.5 h-3.5" /> {t("admin.library.upload")}</>
                            }
                        </Button>
                    </div>
                )}
            </form>
        </Modal>
    );
}

/* ── Inline feedback banner ── */
const Banner = ({ type, message, onDismiss }) => {
    const { t } = useLanguage();
    const styles = {
        error:   "bg-red-50 border-red-200 text-red-700",
        warning: "bg-amber-50 border-amber-200 text-amber-700",
        success: "bg-green-50 border-green-200 text-green-600",
    };
    return (
        <div className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-[5px] border text-[12px] font-medium ${styles[type]}`}>
            <span className="flex-1">{message}</span>
            {onDismiss && (
                <button aria-label={t("admin.sync.dismiss")} onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};

/* ── Inline confirmation ── */
const ConfirmBanner = ({ message, onConfirm, onCancel }) => {
    const { t } = useLanguage();
    return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[5px] border bg-amber-50 border-amber-200">
        <p className="text-[12px] font-medium text-amber-800 flex-1">{message}</p>
        <div className="flex gap-2 shrink-0">
            <button onClick={onCancel} className="text-[11px] px-3 h-7 rounded-full border border-amber-300 text-amber-700 font-semibold hover:bg-amber-100 transition-colors">{t("admin.common.cancel")}</button>
            <button onClick={onConfirm} className="text-[11px] px-3 h-7 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors">{t("admin.common.delete")}</button>
        </div>
    </div>
    );
};

const ManageLibrary = () => {
    const { authenticated } = useContext(DataContext);
    const { t } = useLanguage();
    const [localBooks, setLocalBooks]     = useState([]);
    const [books, setBooks]               = useState([]);
    const [selectedBooks, setSelectedBooks] = useState({});
    const [downloadStatus, setDownloadStatus] = useState('init');
    const [fetching, setFetching]         = useState(false);
    const [banner, setBanner]             = useState(null);
    const [confirm, setConfirm]           = useState(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [viewBook, setViewBook]               = useState(null); // { id, name, ext }

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    const loadLocalBooks = async () => {
        try {
            const res = await fetch(`${SERVER_URL}/library/books`);
            if (res.ok) setLocalBooks(await res.json());
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        async function loadBooks() {
            setFetching(true);
            try {
                const res = await fetch(`${SERVER_URL}/library/available-books`);
                if (res.ok) setBooks(await res.json());
            } catch (err) { console.error(err); }
            finally { setFetching(false); }
        }
        if (authenticated) { loadBooks(); loadLocalBooks(); }
    }, [authenticated, SERVER_URL]);

    const handleCheck = (book, isChecked) => {
        setSelectedBooks(prev => ({ ...prev, [book.id]: isChecked ? book : null }));
    };

    const handleDownload = async () => {
        const selected = Object.values(selectedBooks).filter(Boolean);
        if (selected.length === 0) {
            setBanner({ type: 'warning', message: t("admin.library.selectBook") });
            return;
        }
        try {
            setDownloadStatus("downloading");
            await fetch(`${SERVER_URL}/library/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ books: selected }),
            });
        } catch (err) {
            console.error(err);
            setDownloadStatus("failed");
        }
    };

    const executeDelete = async (id) => {
        try {
            const res = await fetch(`${SERVER_URL}/library/book/${id}`, { method: 'DELETE' });
            if (res.ok) {
                loadLocalBooks();
                setBanner({ type: 'success', message: t("admin.library.deleted") });
            } else {
                setBanner({ type: 'error', message: t("admin.library.deleteFailed") });
            }
        } catch (err) {
            console.error(err);
            setBanner({ type: 'error', message: t("admin.library.deleteError") });
        }
    };

    const handleDelete = (id, name) => {
        setConfirm({
            message: fill(t("admin.library.confirmDelete"), { name }),
            onConfirm: () => { setConfirm(null); executeDelete(id); },
        });
    };

    useEffect(() => {
        if (downloadStatus !== "downloading") return;
        const id = setInterval(async () => {
            try {
                const res = await fetch(`${SERVER_URL}/library/download-status`);
                const data = await res.json();
                if (data.status === "finished" || data.status === "failed") {
                    setDownloadStatus(data.status);
                    if (data.status === "finished") loadLocalBooks();
                    clearInterval(id);
                }
            } catch (err) { console.error(err); }
        }, 2000);
        return () => clearInterval(id);
    }, [downloadStatus, SERVER_URL]);

    const handleModalSubmit = async (file, bookName) => {
        const formData = new FormData();
        formData.append("file", file);
        if (bookName) formData.append("bookName", bookName);

        const res = await fetch(`${SERVER_URL}/library/upload`, {
            method: "POST",
            body: formData,
        });

        if (res.ok) {
            setBanner({ type: 'success', message: t("admin.library.uploaded") });
            loadLocalBooks();
        } else {
            const data = await res.json();
            throw new Error(data.error || t("admin.library.uploadFailed"));
        }
    };

    // Downloaded cloud books are titled with their cloud name (local ids are the box's own).
    const localTitles = new Set(localBooks.map((lb) => String(lb.title || lb.name || '').trim().toLowerCase()));
    const isDownloaded = (book) => localTitles.has(String(book.book_name || '').trim().toLowerCase());

    if (!authenticated) return <Unauthorized />;

    const cloudColumns = [
        {
            key: "select",
            header: t("admin.library.colSelect"),
            className: "w-10 whitespace-nowrap",
            render: (book) => {
                const isLocal = isDownloaded(book);
                return (
                    <Checkbox
                        disabled={isLocal}
                        onCheckedChange={(v) => handleCheck(book, v)}
                        checked={!!selectedBooks[book.id]}
                    />
                );
            },
        },
        {
            key: "name",
            header: t("admin.library.colName"),
            render: (book) => {
                const isLocal = isDownloaded(book);
                return (
                    <>
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[12px] font-medium text-slate-800 dark:text-slate-100">{book.book_name}</p>
                            {isLocal && (
                                <span className="text-[11px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold border border-green-100">
                                    {t("admin.sync.downloaded")}
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{book.categories}</p>
                    </>
                );
            },
        },
    ];

    const localColumns = [
        {
            key: "name",
            header: t("admin.library.colName"),
            render: (book) => {
                const coverUrl = libraryCoverUrl(SERVER_URL, book);
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-11 rounded-[3px] overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 flex items-center justify-center">
                            {coverUrl
                                ? <img src={coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                                : <BookOpen className="w-3.5 h-3.5 text-slate-500" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] font-medium text-slate-800 dark:text-slate-100">{book.name}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{libraryShelf(book) || t("explore.library.other")}</p>
                        </div>
                    </div>
                );
            },
        },
        {
            key: "action",
            header: t("admin.library.colAction"),
            align: "right",
            render: (book) => (
                <div className="flex items-center justify-end gap-1">
                    <button
                        onClick={() => setViewBook(book)}
                        className="inline-flex items-center gap-1.5 text-[11px] h-7 px-3 rounded-full text-[#0D9488] hover:bg-teal-50 font-semibold transition-colors"
                    >
                        <Eye className="w-3 h-3" />
                        {t("admin.library.open")}
                    </button>
                    <button
                        onClick={() => handleDelete(book.id, book.name)}
                        className="inline-flex items-center gap-1.5 text-[11px] h-7 px-3 rounded-full text-red-600 hover:bg-red-50 font-semibold transition-colors"
                    >
                        <Trash2 className="w-3 h-3" />
                        {t("admin.common.delete")}
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <div className="px-4 md:px-4">
                <ManageTitle
                    title={t("admin.home.libraryTitle")}
                    description={t("admin.library.description")}
                    actions={
                        <Button
                            onClick={() => setShowUploadModal(true)}
                            className="h-8 px-4 rounded-[5px] text-[12px] gap-1.5 flex items-center bg-[#0D9488] hover:bg-[#0f766e] text-white"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {t("admin.library.addFromComputer")}
                        </Button>
                    }
                />
            </div>

            <div className="px-4 md:px-4 space-y-6">

                <p className="text-[12px] text-slate-600 dark:text-slate-400">
                    {t("explore.library.adminNote")}{" "}
                    <Link href="/manage/admin/manage-content" className="font-semibold text-[#0D9488] underline underline-offset-2">
                        {t("explore.library.openContentManager")}
                    </Link>
                </p>

                {/* Feedback banners */}
                {(banner || confirm) && (
                    <div className="space-y-3">
                        {banner && (
                            <Banner type={banner.type} message={banner.message} onDismiss={() => setBanner(null)} />
                        )}
                        {confirm && (
                            <ConfirmBanner
                                message={confirm.message}
                                onConfirm={confirm.onConfirm}
                                onCancel={() => setConfirm(null)}
                            />
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-w-0">

                    {/* ── Available on Cloud ── */}
                    <Section
                        title={t("admin.library.onCloud")}
                        description={fill(t(books.length === 1 ? "admin.library.oneBook" : "admin.library.manyBooks"), { count: books.length })}
                        className="min-w-0"
                    >
                        <DataTable
                            caption={t("admin.library.cloudCaption")}
                            columns={cloudColumns}
                            rows={fetching ? [] : books}
                            rowClassName={(book) => (isDownloaded(book) ? "bg-green-50/60 dark:bg-green-950/20" : "")}
                            empty={fetching ? (
                                <Loader variant="page" size={56} className="min-h-[30vh]" label={t("admin.library.loadingBooks")} />
                            ) : t("admin.library.noBooks")}
                            className="max-h-[500px] overflow-y-auto"
                        />
                        <div className="flex items-center justify-between gap-3 pt-3">
                            {downloadStatus !== 'init' ? (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    downloadStatus === 'finished'    ? 'bg-green-50 text-green-600' :
                                    downloadStatus === 'failed'      ? 'bg-red-50 text-red-600' :
                                    'bg-blue-50 text-blue-600'
                                }`}>
                                    {downloadStatus === 'downloading' && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {downloadStatus === 'finished'    && <CheckCircle2 className="w-3 h-3" />}
                                    {["downloading", "finished", "failed"].includes(downloadStatus) ? t(`admin.sync.status.${downloadStatus}`) : downloadStatus}
                                </span>
                            ) : <span />}
                            <Button
                                onClick={handleDownload}
                                disabled={downloadStatus === "downloading"}
                                className="h-8 px-4 rounded-[5px] text-[12px] gap-1.5"
                            >
                                {downloadStatus === "downloading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {t("admin.library.downloadSelected")}
                            </Button>
                        </div>
                    </Section>

                    {/* ── Downloaded Books ── */}
                    <Section
                        title={t("admin.library.downloadedBooks")}
                        description={fill(t(localBooks.length === 1 ? "admin.library.oneBook" : "admin.library.manyBooks"), { count: localBooks.length })}
                        className="min-w-0"
                    >
                        <DataTable
                            caption={t("admin.library.localCaption")}
                            columns={localColumns}
                            rows={localBooks}
                            empty={t("admin.library.noneDownloaded")}
                            className="max-h-[500px] overflow-y-auto"
                        />
                    </Section>

                </div>
            </div>
            {showUploadModal && (
                <LibraryUploadModal 
                    onClose={() => setShowUploadModal(false)}
                    onSubmit={handleModalSubmit}
                />
            )}

            {/* EPUB Reader */}
            {viewBook && libraryViewer(viewBook) === 'epub' && (
                <EpubReader
                    url={libraryFileUrl(SERVER_URL, viewBook)}
                    title={viewBook.name}
                    onClose={() => setViewBook(null)}
                    summaryPath={viewBook.path_key || null}
                />
            )}

            {/* PDF, video and audio via UniversalPlayerModal */}
            <UniversalPlayerModal
                isOpen={Boolean(viewBook) && libraryViewer(viewBook) !== 'epub'}
                onClose={() => setViewBook(null)}
                summaryPath={viewBook && libraryViewer(viewBook) !== 'epub' ? (viewBook.path_key || null) : null}
                mediaItem={viewBook && libraryViewer(viewBook) !== 'epub' ? {
                    title: viewBook.name,
                    type: libraryViewer(viewBook),
                    url: libraryFileUrl(SERVER_URL, viewBook),
                } : null}
            />
        </div>
    );
};

export default ManageLibrary;
