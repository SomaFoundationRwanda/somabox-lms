"use client"
import Unauthorized from "@/components/sections/Unauthorized";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import DataContext from "@/context/DataContext";
import { useContext, useEffect, useRef, useState } from "react";
import ManageTitle from "@/components/manage/ManageTitle";
import { DataTable, Section } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { BookOpen, CheckCircle2, Loader2, Trash2, X, Upload, File, AlertCircle, Eye } from "lucide-react";
import UniversalPlayerModal from "@/components/ui/UniversalPlayerModal";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { libraryCoverUrl, libraryFileUrl, libraryShelf, libraryViewer } from "@/components/ui/library/libraryEntry";
import Loader from "@/components/ui/Loader";
import { Checkbox, Field, TextInput } from "@/components/form";
import { FileDrop } from "@/components/form";
import TransferProgress from "@/components/ui/TransferProgress";

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
            <div className="relative z-10 bg-surface rounded-[8px] border border-line shadow-2xl w-full max-w-md">
                {children}
            </div>
        </div>
    );
}

function LibraryUploadModal({ onClose, onSubmit }) {
    const { t } = useLanguage();
    const [file, setFile] = useState(null);
    const [bookName, setBookName] = useState('');
    const [status, setStatus] = useState('idle'); // idle | uploading | done | error
    const [percent, setPercent] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    const handleFile = (f) => { 
        if (f) {
            setFile(f); 
            if (!bookName) {
                setBookName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) return;
        setStatus('uploading');
        setPercent(0);
        setErrorMsg('');
        try {
            await onSubmit(file, bookName, setPercent);
            setStatus('done');
            setTimeout(onClose, 1200);
        } catch (err) {
            setErrorMsg(err.message || t("admin.library.uploadFailed"));
            setStatus('error');
        }
    };

    return (
        <Modal onClose={status === 'uploading' ? undefined : onClose}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[5px] bg-surface-sunken flex items-center justify-center shrink-0">
                        <Upload className="w-3.5 h-3.5 text-fg-muted" />
                    </div>
                    <h2 className="text-ui font-extrabold text-fg">{t("admin.library.uploadTitle")}</h2>
                </div>
                {status !== 'uploading' && (
                    <button aria-label={t("admin.library.close")}
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-[5px] text-fg-muted hover:bg-surface-hover transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-5">
                    <div>
                        <p className="text-caption font-bold text-fg-subtle block mb-2">
                            {t("admin.library.file")}
                        </p>
                        <FileDrop
                            accept={LIBRARY_ACCEPT}
                            onFiles={([f]) => handleFile(f)}
                            label={t("admin.library.chooseFile")}
                            icon={File}
                            title={`${t("admin.library.dropHere")} ${t("admin.library.browse")}`}
                            hint={t("explore.manager.allowedTypes")}
                        >
                            {file ? (
                                <>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-[5px] flex items-center justify-center shrink-0 text-info-fg bg-info-soft">
                                            <BookOpen className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 text-left">
                                            <p className="text-caption font-semibold text-fg truncate max-w-[240px]">{file.name}</p>
                                            <p className="text-caption text-fg-muted mt-0.5">{formatBytes(file.size)}</p>
                                        </div>
                                    </div>
                                    <p className="text-caption text-fg-muted mt-2">{t("admin.library.changeFile")}</p>
                                </>
                            ) : undefined}
                        </FileDrop>
                    </div>

                    {file && (
                        <Field label={t("admin.library.bookName")}>
                            <TextInput
                                value={bookName}
                                onChange={(e) => setBookName(e.target.value)}
                                placeholder={t("admin.library.bookNamePlaceholder")}
                                required
                            />
                        </Field>
                    )}

                    {status === 'uploading' && file && (
                        <TransferProgress
                            kind="upload"
                            status="uploading"
                            total={1}
                            done={0}
                            percent={percent}
                            bytesDone={Math.round((file.size * percent) / 100)}
                            bytesTotal={file.size}
                            current={[file.name]}
                        />
                    )}
                    {status === 'done' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[5px] bg-success-soft border border-success/30">
                            <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0" />
                            <p className="text-caption font-semibold text-success-fg">{t("admin.library.uploadDone")}</p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[5px] bg-danger-soft border border-danger/30">
                            <AlertCircle className="w-4 h-4 text-danger-fg shrink-0" />
                            <p className="text-caption font-semibold text-danger-fg">{errorMsg}</p>
                        </div>
                    )}
                </div>

                {status !== 'done' && (
                    <div className="flex gap-2 px-5 pb-5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={status === 'uploading'}
                            className="flex-1 h-9 rounded-[5px] border border-line text-caption font-semibold text-fg-muted hover:bg-surface-hover transition-colors disabled:opacity-40"
                        >
                            {t("admin.common.cancel")}
                        </button>
                        <Button
                            type="submit"
                            disabled={!file || status === 'uploading'}
                            className="flex-1 h-9 rounded-[5px] text-caption font-semibold gap-1.5 bg-brand hover:bg-brand/90 text-on-brand"
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
        error:   "bg-danger-soft border-danger/30 text-danger-fg",
        warning: "bg-warning-soft border-warning/30 text-warning-fg",
        success: "bg-success-soft border-success/30 text-success-fg",
    };
    return (
        <div className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-[5px] border text-caption font-medium ${styles[type]}`}>
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
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[5px] border bg-warning-soft border-warning/30">
        <p className="text-caption font-medium text-warning-fg flex-1">{message}</p>
        <div className="flex gap-2 shrink-0">
            <button onClick={onCancel} className="text-caption px-3 h-7 rounded-full border border-warning/30 text-warning-fg font-semibold hover:bg-warning-soft transition-colors">{t("admin.common.cancel")}</button>
            <button onClick={onConfirm} className="text-caption px-3 h-7 rounded-full bg-warning text-on-warning font-semibold hover:bg-warning transition-colors">{t("admin.common.delete")}</button>
        </div>
    </div>
    );
};

const LIBRARY_DOWNLOAD = ["cloud", "library-download"];

const ManageLibrary = () => {
    const { authenticated } = useContext(DataContext);
    const { t } = useLanguage();
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
    const queryClient = useQueryClient();
    // The box's books (shared with the Library pages) and what the cloud offers.
    const local = useQuery({ queryKey: queryKeys.libraryBooks, queryFn: () => apiFetch("/library/books"), enabled: authenticated });
    const cloud = useQuery({ queryKey: ["cloud", "available-books"], queryFn: () => apiFetch("/library/available-books"), enabled: authenticated });
    const localBooks = Array.isArray(local.data) ? local.data : [];
    const books = Array.isArray(cloud.data) ? cloud.data : [];
    const fetching = cloud.isFetching;
    const loadLocalBooks = () => queryClient.invalidateQueries({ queryKey: queryKeys.libraryBooks });
    const [selectedBooks, setSelectedBooks] = useState({});
    const [starting, setStarting]         = useState(false); // between the click and the box starting
    const [watched, setWatched]           = useState(false); // a download ran while this page was open
    const [banner, setBanner]             = useState(null);
    const [confirm, setConfirm]           = useState(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [viewBook, setViewBook]               = useState(null); // { id, name, ext }

    const handleCheck = (book, isChecked) => {
        setSelectedBooks(prev => ({ ...prev, [book.id]: isChecked ? book : null }));
    };

    // The box's download job: { status, total, done, failed, percent, current, ... }. Read once when
    // the page opens (a download may already be running), then every second while one runs.
    const job = useQuery({
        queryKey: LIBRARY_DOWNLOAD,
        queryFn: () => apiFetch("/library/download-status"),
        enabled: authenticated,
        refetchInterval: (q) => (q.state.data?.status === "downloading" ? 1000 : false),
        retry: false,
    });
    const jobStatus = job.data?.status;
    const downloading = starting || jobStatus === "downloading";

    const handleDownload = async () => {
        const selected = Object.values(selectedBooks).filter(Boolean);
        if (selected.length === 0) {
            setBanner({ type: 'warning', message: t("admin.library.selectBook") });
            return;
        }
        setStarting(true);
        setWatched(true);
        try {
            await apiFetch("/library/download", { method: "POST", json: { books: selected } });
        } catch (err) {
            // 400: another download is already running; its progress shows below.
            if (err?.status !== 400) setBanner({ type: 'error', message: getErrorMessage(err, t) });
        } finally {
            const { data } = await job.refetch();
            setStarting(false);
            // A batch of small books can be over before the first check.
            if (data?.status && data.status !== "downloading") downloadEnded();
        }
    };

    const executeDelete = async (id) => {
        try {
            await apiFetch(`/library/book/${id}`, { method: "DELETE" });
            loadLocalBooks();
            setBanner({ type: 'success', message: t("admin.library.deleted") });
        } catch (err) {
            setBanner({ type: 'error', message: t(err?.status === 0 ? "admin.library.deleteError" : "admin.library.deleteFailed") });
        }
    };

    const handleDelete = (id, name) => {
        setConfirm({
            message: fill(t("admin.library.confirmDelete"), { name }),
            onConfirm: () => { setConfirm(null); executeDelete(id); },
        });
    };

    // When a download ends, the box has new books: show them, and clear what was selected.
    function downloadEnded() {
        loadLocalBooks();
        queryClient.invalidateQueries({ queryKey: ["cloud", "available-books"] });
        setSelectedBooks({});
    }
    const lastStatus = useRef(jobStatus);
    useEffect(() => {
        if (jobStatus === "downloading") setWatched(true);
        if (lastStatus.current === "downloading" && jobStatus && jobStatus !== "downloading") downloadEnded();
        lastStatus.current = jobStatus;
    }, [jobStatus]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleModalSubmit = async (file, bookName, onProgress) => {
        const formData = new FormData();
        formData.append("file", file);
        if (bookName) formData.append("bookName", bookName);

        try {
            await apiUpload("/library/upload", formData, { onProgress }).promise;
        } catch (err) {
            throw new Error(err?.body?.error || getErrorMessage(err, t));
        }
        setBanner({ type: 'success', message: t("admin.library.uploaded") });
        loadLocalBooks();
    };

    // Downloaded cloud books are titled with their cloud name (local ids are the box's own).
    const localTitles = new Set(localBooks.map((lb) => String(lb.title || lb.name || '').trim().toLowerCase()));
    const isDownloaded = (book) => !!book.isDownloaded || localTitles.has(String(book.book_name || '').trim().toLowerCase());
    const selectable = books.filter((book) => !isDownloaded(book));
    const selectedCount = Object.values(selectedBooks).filter(Boolean).length;
    const allSelected = selectable.length > 0 && selectable.every((book) => selectedBooks[book.id]);
    const selectAll = (on) => setSelectedBooks(on ? Object.fromEntries(selectable.map((book) => [book.id, book])) : {});

    if (!authenticated) return <Unauthorized />;

    const cloudColumns = [
        {
            key: "select",
            header: (
                <Checkbox
                    aria-label={t("admin.library.selectAll")}
                    disabled={downloading || selectable.length === 0}
                    checked={allSelected}
                    onCheckedChange={(v) => selectAll(v === true)}
                />
            ),
            className: "w-10 whitespace-nowrap",
            render: (book) => {
                const isLocal = isDownloaded(book);
                return (
                    <Checkbox
                        aria-label={book.book_name}
                        disabled={isLocal || downloading}
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
                            <p className="text-caption font-medium text-fg">{book.book_name}</p>
                            {isLocal && (
                                <span className="text-caption bg-success-soft text-success-fg px-2 py-0.5 rounded-full font-bold border border-success/30">
                                    {t("admin.sync.downloaded")}
                                </span>
                            )}
                        </div>
                        <p className="text-caption text-fg-muted mt-0.5">{book.categories}</p>
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
                        <div className="w-8 h-11 rounded-[3px] overflow-hidden bg-surface-sunken shrink-0 flex items-center justify-center">
                            {coverUrl
                                ? <img src={coverUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                                : <BookOpen className="w-3.5 h-3.5 text-fg-subtle" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-caption font-medium text-fg">{book.name}</p>
                            <p className="text-caption text-fg-muted mt-0.5">{libraryShelf(book) || t("explore.library.other")}</p>
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
                        className="inline-flex items-center gap-1.5 text-caption h-7 px-3 rounded-full text-brand-fg hover:bg-brand-soft font-semibold transition-colors"
                    >
                        <Eye className="w-3 h-3" />
                        {t("admin.library.open")}
                    </button>
                    <button
                        onClick={() => handleDelete(book.id, book.name)}
                        className="inline-flex items-center gap-1.5 text-caption h-7 px-3 rounded-full text-danger-fg hover:bg-danger-soft font-semibold transition-colors"
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
                            className="h-8 px-4 rounded-[5px] text-caption gap-1.5 flex items-center bg-brand hover:bg-brand/90 text-on-brand"
                        >
                            <Upload className="w-3.5 h-3.5" />
                            {t("admin.library.addFromComputer")}
                        </Button>
                    }
                />
            </div>

            <div className="px-4 md:px-4 space-y-6">

                <p className="text-caption text-fg-muted">
                    {t("explore.library.adminNote")}{" "}
                    <Link href="/manage/admin/manage-content" className="font-semibold text-brand-fg underline underline-offset-2">
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
                            rowClassName={(book) => (isDownloaded(book) ? "bg-success-soft/60" : "")}
                            empty={fetching ? (
                                <Loader variant="page" size={56} className="min-h-[30vh]" label={t("admin.library.loadingBooks")} />
                            ) : t("admin.library.noBooks")}
                            className="max-h-[500px] overflow-y-auto"
                        />
                        {watched && job.data && <TransferProgress kind="download" {...job.data} className="mt-3" />}
                        <div className="flex items-center justify-between gap-3 pt-3">
                            <span className="text-caption font-semibold text-fg-subtle">
                                {selectable.length > 0 ? fill(t("shell.transfer.selected"), { count: selectedCount, total: selectable.length }) : null}
                            </span>
                            <Button
                                onClick={handleDownload}
                                disabled={downloading || selectedCount === 0}
                                className="h-8 px-4 rounded-[5px] text-caption gap-1.5"
                            >
                                {downloading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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
