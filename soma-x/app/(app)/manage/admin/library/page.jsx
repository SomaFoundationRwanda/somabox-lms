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
import EpubReader from "@/components/ui/library/EpubReader";

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
                setBookName(f.name.replace(/\.(epub|pdf)$/i, '').replace(/[-_]/g, ' '));
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
            setErrorMsg(err.message || 'Upload failed.');
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
                    <h2 className="text-[14px] font-black text-slate-900">Upload Content</h2>
                </div>
                {status !== 'uploading' && (
                    <button
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
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                            File
                        </label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
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
                                accept=".epub,.pdf"
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
                                    <p className="text-[10px] text-slate-600 mt-2">Click to change file</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-9 h-9 rounded-[5px] bg-slate-100 flex items-center justify-center">
                                        <File className="w-4 h-4 text-slate-600" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[12px] font-semibold text-slate-600">
                                            Drop a file here or <span className="text-[#0D9488] underline underline-offset-2">browse</span>
                                        </p>
                                        <p className="text-[10px] text-slate-600 mt-0.5">EPUB or PDF files only</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {file && (
                        <div>
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                Book Name
                            </label>
                            <input
                                type="text"
                                value={bookName}
                                onChange={(e) => setBookName(e.target.value)}
                                placeholder="Enter book name"
                                className="w-full h-10 px-3 rounded-[5px] border border-slate-200 bg-white text-[13px] outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488] transition-all"
                                required
                            />
                        </div>
                    )}

                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                            Content type
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            <button
                                type="button"
                                className="flex flex-col items-center gap-1.5 py-3 rounded-[5px] border text-[11px] font-bold transition-all border-accent-dark bg-accent-dark text-white shadow-sm"
                                style={{ backgroundColor: "#0D9488", borderColor: "#0D9488" }}
                            >
                                <div className="w-7 h-7 rounded-[5px] flex items-center justify-center bg-white/20">
                                    <BookOpen className="w-3.5 h-3.5" />
                                </div>
                                Book
                            </button>
                        </div>
                    </div>

                    {status === 'uploading' && (
                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-[5px] bg-blue-50 border border-blue-100">
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold text-blue-700">Uploading…</p>
                                <div className="h-1 w-full bg-blue-100 rounded-full mt-1.5 overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/4" />
                                </div>
                            </div>
                        </div>
                    )}
                    {status === 'done' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[5px] bg-green-50 border border-green-100">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            <p className="text-[12px] font-semibold text-green-700">Upload complete!</p>
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
                            Cancel
                        </button>
                        <Button
                            type="submit"
                            disabled={!file || status === 'uploading'}
                            className="flex-1 h-9 rounded-[5px] text-[12px] font-semibold gap-1.5 bg-[#0D9488] hover:bg-[#0f766e] text-white"
                        >
                            {status === 'uploading'
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                                : <><Upload className="w-3.5 h-3.5" /> Upload</>
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
    const styles = {
        error:   "bg-red-50 border-red-200 text-red-700",
        warning: "bg-amber-50 border-amber-200 text-amber-700",
        success: "bg-green-50 border-green-200 text-green-600",
    };
    return (
        <div className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-[5px] border text-[12px] font-medium ${styles[type]}`}>
            <span className="flex-1">{message}</span>
            {onDismiss && (
                <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};

/* ── Inline confirmation ── */
const ConfirmBanner = ({ message, onConfirm, onCancel }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[5px] border bg-amber-50 border-amber-200">
        <p className="text-[12px] font-medium text-amber-800 flex-1">{message}</p>
        <div className="flex gap-2 shrink-0">
            <button onClick={onCancel} className="text-[11px] px-3 h-7 rounded-full border border-amber-300 text-amber-700 font-semibold hover:bg-amber-100 transition-colors">Cancel</button>
            <button onClick={onConfirm} className="text-[11px] px-3 h-7 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors">Delete</button>
        </div>
    </div>
);

const ManageLibrary = () => {
    const { authenticated } = useContext(DataContext);
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
            setBanner({ type: 'warning', message: 'Please select at least one book to download.' });
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
                setBanner({ type: 'success', message: 'Book deleted successfully.' });
            } else {
                setBanner({ type: 'error', message: 'Failed to delete book.' });
            }
        } catch (err) {
            console.error(err);
            setBanner({ type: 'error', message: 'An error occurred while deleting.' });
        }
    };

    const handleDelete = (id, name) => {
        setConfirm({
            message: `Delete "${name}"? This cannot be undone.`,
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
            setBanner({ type: 'success', message: 'Book uploaded successfully!' });
            loadLocalBooks();
        } else {
            const data = await res.json();
            throw new Error(data.error || 'Failed to upload book.');
        }
    };

    if (!authenticated) return <Unauthorized />;

    const cloudColumns = [
        {
            key: "select",
            header: "Select",
            className: "w-10 whitespace-nowrap",
            render: (book) => {
                const isLocal = localBooks.some(lb => lb.id === parseInt(book.id));
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
            header: "Name",
            render: (book) => {
                const isLocal = localBooks.some(lb => lb.id === parseInt(book.id));
                return (
                    <>
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[12px] font-medium text-slate-800 dark:text-slate-100">{book.book_name}</p>
                            {isLocal && (
                                <span className="text-[9px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold border border-green-100">
                                    Downloaded
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
            header: "Name",
            render: (book) => (
                <>
                    <p className="text-[12px] font-medium text-slate-800 dark:text-slate-100">{book.name}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{book.category_ids}</p>
                </>
            ),
        },
        {
            key: "action",
            header: "Action",
            align: "right",
            render: (book) => (
                <div className="flex items-center justify-end gap-1">
                    <button
                        onClick={() => setViewBook(book)}
                        className="inline-flex items-center gap-1.5 text-[11px] h-7 px-3 rounded-full text-[#0D9488] hover:bg-teal-50 font-semibold transition-colors"
                    >
                        <Eye className="w-3 h-3" />
                        Open
                    </button>
                    <button
                        onClick={() => handleDelete(book.id, book.name)}
                        className="inline-flex items-center gap-1.5 text-[11px] h-7 px-3 rounded-full text-red-600 hover:bg-red-50 font-semibold transition-colors"
                    >
                        <Trash2 className="w-3 h-3" />
                        Delete
                    </button>
                </div>
            ),
        },
    ];

    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <div className="px-4 md:px-4">
                <ManageTitle
                    title="Manage Library"
                    description="Download books from the cloud or add your own, and manage what is stored on this device."
                    actions={
                        <Button
                            onClick={() => setShowUploadModal(true)}
                            className="h-8 px-4 rounded-[5px] text-[12px] gap-1.5 flex items-center bg-[#0D9488] hover:bg-[#0f766e] text-white"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            Add a book from computer
                        </Button>
                    }
                />
            </div>

            <div className="px-4 md:px-4 space-y-6">

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
                        title="Available on Cloud"
                        description={`${books.length} books`}
                        className="min-w-0"
                    >
                        <DataTable
                            caption="Books available on the cloud"
                            columns={cloudColumns}
                            rows={fetching ? [] : books}
                            rowClassName={(book) => (localBooks.some(lb => lb.id === parseInt(book.id)) ? "bg-green-50/60 dark:bg-green-950/20" : "")}
                            empty={fetching ? (
                                <span className="inline-flex items-center gap-2 text-[12px] font-semibold"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading books…</span>
                            ) : "No books available"}
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
                                    {downloadStatus}
                                </span>
                            ) : <span />}
                            <Button
                                onClick={handleDownload}
                                disabled={downloadStatus === "downloading"}
                                className="h-8 px-4 rounded-[5px] text-[12px] gap-1.5"
                            >
                                {downloadStatus === "downloading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Download Selected
                            </Button>
                        </div>
                    </Section>

                    {/* ── Downloaded Books ── */}
                    <Section
                        title="Downloaded Books"
                        description={`${localBooks.length} books`}
                        className="min-w-0"
                    >
                        <DataTable
                            caption="Books downloaded to this device"
                            columns={localColumns}
                            rows={localBooks}
                            empty="No books downloaded yet"
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
            {viewBook && viewBook.ext === 'epub' && (
                <EpubReader
                    url={`${SERVER_URL}/library/file/${viewBook.id}`}
                    title={viewBook.name}
                    onClose={() => setViewBook(null)}
                />
            )}

            {/* PDF / fallback via UniversalPlayerModal */}
            <UniversalPlayerModal
                isOpen={Boolean(viewBook) && viewBook?.ext !== 'epub'}
                onClose={() => setViewBook(null)}
                mediaItem={viewBook ? {
                    title: viewBook.name,
                    type: 'book',
                    url: `${SERVER_URL}/library/file/${viewBook.id}`,
                } : null}
            />
        </div>
    );
};

export default ManageLibrary;
