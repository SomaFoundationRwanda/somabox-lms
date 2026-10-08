'use client'
// The Explore content manager. It works on the folders on the box:
// - "School content" (custom-content): teachers and admins add, rename, hide and delete here.
// - "Rwandan education": downloaded from the cloud on the Sync page (admins only); here it can
//   only be renamed and hidden.
// Every change refreshes the Explore catalogue (DataContext.refreshExplore).
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import FileTable from './fileTable';
import { getFileMediaType } from './fileRow';
import UniversalPlayerModal from '@/components/ui/UniversalPlayerModal';
import dynamic from "next/dynamic";
import { Button } from '@/components/ui/button';
import { clickableProps } from "@/lib/a11y";
import { getSessionToken } from "@/lib/session";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import {
    Check, ChevronDown, ChevronRight, File, FolderPlus, Loader2, Search, Info,
    Upload, X, CheckCircle2, AlertCircle, Music, Video, BookOpen, FolderOpen, RefreshCw, Pencil, Trash2,
} from 'lucide-react';

// react-reader (epub.js) loads only when a book is opened.
const EpubReader = dynamic(() => import("@/components/ui/library/EpubReader"), { ssr: false });

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

// What Explore can open; uploads of anything else are refused by the server.
const ACCEPT = ".mp4,.webm,.mkv,.m4v,.mov,.mp3,.wav,.ogg,.m4a,.pdf,.epub";

/** "{n} files" style templates. */
const fill = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

/** The error text a manager endpoint sent ({ error }), or another endpoint ({ message }). */
async function serverMessage(res, fallback) {
    try {
        const body = await res.json();
        return body?.error || body?.message || fallback;
    } catch {
        return fallback;
    }
}

function useRelativeTime() {
    const { lang } = useLanguage();
    return useCallback((date) => {
        const then = new Date(date).getTime();
        if (!then) return '';
        const seconds = Math.round((then - Date.now()) / 1000);
        let rtf;
        try { rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }); } catch { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }); }
        const abs = Math.abs(seconds);
        if (abs < 60) return rtf.format(seconds, 'second');
        if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
        if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
        return rtf.format(Math.round(seconds / 86400), 'day');
    }, [lang]);
}

/* ─────────────────────────────────────────────
   Modal shell — shared backdrop + panel
───────────────────────────────────────────── */
function Modal({ onClose, labelledBy, children, wide }) {
    useEffect(() => {
        if (!onClose) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                className={`relative z-10 bg-white rounded-[8px] border border-slate-100 shadow-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}
            >
                {children}
            </div>
        </div>
    );
}

function ModalHeader({ id, icon, title, onClose }) {
    const { t } = useLanguage();
    return (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-[5px] bg-slate-100 flex items-center justify-center shrink-0">{icon}</div>
                <h2 id={id} className="text-[14px] font-black text-slate-900">{title}</h2>
            </div>
            {onClose && (
                <button
                    type="button"
                    aria-label={t("explore.manager.close")}
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-[5px] text-slate-600 hover:bg-slate-100 transition-colors"
                >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

function Notice({ tone, children }) {
    const styles = tone === 'error'
        ? 'bg-red-50 border-red-100 text-red-700'
        : tone === 'success'
            ? 'bg-green-50 border-green-100 text-green-700'
            : 'bg-slate-50 border-slate-200 text-slate-700';
    const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
    return (
        <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-[5px] border ${styles}`}>
            <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[12px] font-semibold">{children}</p>
        </div>
    );
}

function FooterButtons({ onCancel, busy, disabled, children }) {
    const { t } = useLanguage();
    return (
        <div className="flex gap-2 px-5 pb-5">
            <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 h-9 rounded-[5px] border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
                {t("explore.manager.cancel")}
            </button>
            <Button type="submit" disabled={disabled || busy} className="flex-1 h-9 rounded-[5px] text-[12px] font-semibold gap-1.5">
                {children}
            </Button>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Type filter dropdown
───────────────────────────────────────────── */
function FilterDropdown({ label, options, value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const selected  = options.find(o => o.value === value);
    const isFiltered = value !== options[0]?.value;

    return (
        <div className="relative shrink-0" ref={ref}>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-[5px] border text-[11px] font-semibold transition-all ${
                    isFiltered
                        ? 'border-accent-dark bg-accent-dark text-white'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-700 bg-white'
                }`}
            >
                {label}
                {isFiltered && <span className="text-[10px] font-bold opacity-80">· {selected?.label}</span>}
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-[5px] border border-slate-200 shadow-xl z-30 min-w-[160px] py-1 overflow-hidden">
                    {options.map(opt => (
                        <button
                            type="button"
                            key={opt.value}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium transition-colors text-left gap-6 ${
                                opt.value === value ? 'text-accent-dark bg-slate-50' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                {opt.icon && <opt.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                                {opt.label}
                            </span>
                            {opt.value === value && <Check className="w-3 h-3 text-accent-dark shrink-0" aria-hidden="true" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────
   New folder
───────────────────────────────────────────── */
const MAX_FOLDER_NAME = 48;

function NewFolderModal({ onClose, onSubmit }) {
    const { t } = useLanguage();
    const [name, setName]     = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | error
    const [errorMsg, setErrorMsg] = useState('');
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        setStatus('loading');
        setErrorMsg('');
        try {
            await onSubmit(trimmed);
            onClose();
        } catch (err) {
            setErrorMsg(err.message);
            setStatus('error');
        }
    };

    const remaining = MAX_FOLDER_NAME - name.length;

    return (
        <Modal onClose={status === 'loading' ? undefined : onClose} labelledBy="new-folder-title">
            <ModalHeader
                id="new-folder-title"
                icon={<FolderPlus className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />}
                title={t("explore.manager.newFolder")}
                onClose={status === 'loading' ? undefined : onClose}
            />
            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label htmlFor="new-folder-name" className="text-[11px] font-bold text-slate-600 uppercase tracking-widest">
                                {t("explore.manager.folderName")}
                            </label>
                            <span className={`text-[10px] font-medium tabular-nums ${remaining <= 10 ? 'text-amber-600' : 'text-slate-600'}`}>
                                {remaining}
                            </span>
                        </div>
                        <input
                            id="new-folder-name"
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, MAX_FOLDER_NAME))}
                            placeholder={t("explore.manager.folderNamePlaceholder")}
                            className="w-full h-10 px-3 rounded-[5px] border border-slate-200 bg-slate-50 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:bg-white focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                        />
                    </div>
                    {status === 'error' && <Notice tone="error">{errorMsg}</Notice>}
                </div>
                <FooterButtons onCancel={onClose} busy={status === 'loading'} disabled={!name.trim()}>
                    {status === 'loading'
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> {t("explore.manager.creating")}</>
                        : <><FolderPlus className="w-3.5 h-3.5" aria-hidden="true" /> {t("explore.manager.createFolder")}</>}
                </FooterButtons>
            </form>
        </Modal>
    );
}

/* ─────────────────────────────────────────────
   Upload: several files, one after another, each with its own result
───────────────────────────────────────────── */
function formatBytes(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
}

/** POSTs one file with progress. Resolves to { status, message }. */
function uploadOne(file, folderPath, onProgress) {
    return new Promise((resolve) => {
        const form = new FormData();
        form.append('path', folderPath);
        form.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${SERVER_URL}/content/manager/upload`);
        xhr.withCredentials = true;
        const token = getSessionToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
            let body = null;
            try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
            resolve({ status: xhr.status, message: body?.error || body?.message || '' });
        };
        xhr.onerror = () => resolve({ status: 0, message: '' });
        xhr.send(form);
    });
}

const FILE_ICON = { video: Video, audio: Music, pdf: BookOpen, epub: BookOpen };

function UploadModal({ folderPath, folderTitle, onClose, onUploaded }) {
    const { t } = useLanguage();
    const [entries, setEntries]   = useState([]); // { key, file, state: waiting|uploading|added|exists|unsupported|failed, progress, message }
    const [dragging, setDragging] = useState(false);
    const [running, setRunning]   = useState(false);
    const fileInputRef = useRef(null);

    const addFiles = (list) => {
        const files = Array.from(list || []);
        if (!files.length) return;
        setEntries((prev) => [
            ...prev.filter((e) => e.state === 'waiting' || running),
            ...files.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, state: 'waiting', progress: 0, message: '' })),
        ]);
    };

    const update = (key, patch) => setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        if (!running) addFiles(e.dataTransfer.files);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const waiting = entries.filter((x) => x.state === 'waiting');
        if (!waiting.length) return;
        setRunning(true);
        let added = 0;
        for (const entry of waiting) {
            update(entry.key, { state: 'uploading', progress: 0 });
            const { status, message } = await uploadOne(entry.file, folderPath, (progress) => update(entry.key, { progress }));
            if (status === 201 || status === 200) {
                added += 1;
                update(entry.key, { state: 'added', progress: 100 });
            } else if (status === 409) {
                update(entry.key, { state: 'exists', message });
            } else if (status === 400) {
                update(entry.key, { state: 'unsupported', message: message || t("explore.manager.notSupported") });
            } else {
                update(entry.key, { state: 'failed', message: message || t("explore.manager.uploadFailed") });
            }
        }
        setRunning(false);
        if (added) onUploaded();
    };

    const waitingCount = entries.filter((x) => x.state === 'waiting').length;
    const done = entries.length > 0 && !running && waitingCount === 0;

    const stateText = (entry) => {
        switch (entry.state) {
            case 'waiting': return formatBytes(entry.file.size);
            case 'uploading': return `${t("explore.manager.uploading")} ${entry.progress}%`;
            case 'added': return t("explore.manager.added");
            case 'exists': return t("explore.manager.alreadyExists");
            case 'unsupported': return entry.message;
            default: return entry.message;
        }
    };
    const stateColor = {
        waiting: 'text-slate-600', uploading: 'text-blue-700', added: 'text-green-700',
        exists: 'text-amber-700', unsupported: 'text-red-700', failed: 'text-red-700',
    };

    return (
        <Modal onClose={running ? undefined : onClose} labelledBy="upload-title" wide>
            <ModalHeader
                id="upload-title"
                icon={<Upload className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />}
                title={fill(t("explore.manager.uploadTo"), { folder: folderTitle })}
                onClose={running ? undefined : onClose}
            />
            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-4">
                    <div
                        {...clickableProps(() => { if (!running) fileInputRef.current?.click(); }, t("explore.manager.chooseFiles"))}
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        className={`flex flex-col items-center justify-center gap-2 h-[110px] rounded-[5px] border-2 border-dashed cursor-pointer transition-all ${
                            dragging ? 'border-accent-dark bg-accent-dark/5' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ACCEPT}
                            className="hidden"
                            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                        />
                        <File className="w-5 h-5 text-slate-600" aria-hidden="true" />
                        <p className="text-[12px] font-semibold text-slate-600 text-center">
                            {t("explore.manager.dropFiles")}
                        </p>
                        <p className="text-[11px] text-slate-600 text-center px-4">{t("explore.manager.allowedTypes")}</p>
                    </div>

                    {entries.length > 0 && (
                        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-[5px]" aria-live="polite">
                            {entries.map((entry) => {
                                const Icon = FILE_ICON[getFileMediaType(entry.file.name)] || File;
                                return (
                                    <li key={entry.key} className="px-3 py-2 flex items-start gap-2.5">
                                        <Icon className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" aria-hidden="true" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] font-semibold text-slate-800 truncate">{entry.file.name}</p>
                                            <p className={`text-[11px] font-medium ${stateColor[entry.state]}`}>{stateText(entry)}</p>
                                            {entry.state === 'uploading' && (
                                                <div className="h-1 w-full bg-blue-100 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${entry.progress}%` }} />
                                                </div>
                                            )}
                                        </div>
                                        {entry.state === 'waiting' && !running && (
                                            <button
                                                type="button"
                                                aria-label={`${t("explore.manager.remove")}: ${entry.file.name}`}
                                                onClick={() => setEntries((prev) => prev.filter((e) => e.key !== entry.key))}
                                                className="w-6 h-6 flex items-center justify-center rounded text-slate-600 hover:bg-slate-100"
                                            >
                                                <X className="w-3 h-3" aria-hidden="true" />
                                            </button>
                                        )}
                                        {entry.state === 'added' && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />}
                                        {['exists', 'unsupported', 'failed'].includes(entry.state) && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {entries.some((e) => e.state === 'exists') && (
                        <Notice>{t("explore.manager.existsHelp")}</Notice>
                    )}
                </div>
                {done ? (
                    <div className="px-5 pb-5">
                        <Button type="button" onClick={onClose} className="w-full h-9 rounded-[5px] text-[12px] font-semibold">
                            {t("explore.manager.done")}
                        </Button>
                    </div>
                ) : (
                    <FooterButtons onCancel={onClose} busy={running} disabled={!waitingCount}>
                        {running
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> {t("explore.manager.uploading")}</>
                            : <><Upload className="w-3.5 h-3.5" aria-hidden="true" /> {waitingCount > 1 ? fill(t("explore.manager.uploadN"), { n: waitingCount }) : t("explore.manager.upload")}</>}
                    </FooterButtons>
                )}
            </form>
        </Modal>
    );
}

/* ─────────────────────────────────────────────
   Rename (shown title and description; the file on disk keeps its name)
───────────────────────────────────────────── */
function RenameModal({ row, onClose, onSubmit }) {
    const { t } = useLanguage();
    const [title, setTitle] = useState(row.name || '');
    const [subtitle, setSubtitle] = useState(row.subtitle || '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        setError('');
        try {
            await onSubmit(row, { title: title.trim(), subtitle: subtitle.trim() });
            onClose();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <Modal onClose={busy ? undefined : onClose} labelledBy="rename-title">
            <ModalHeader
                id="rename-title"
                icon={<Pencil className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />}
                title={t("explore.manager.renameTitle")}
                onClose={busy ? undefined : onClose}
            />
            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-4">
                    <div>
                        <label htmlFor="rename-name" className="text-[11px] font-bold text-slate-600 uppercase tracking-widest block mb-2">
                            {t("explore.manager.shownTitle")}
                        </label>
                        <input
                            id="rename-name"
                            type="text"
                            value={title}
                            maxLength={200}
                            autoFocus
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full h-10 px-3 rounded-[5px] border border-slate-200 bg-slate-50 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:bg-white focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                        />
                    </div>
                    <div>
                        <label htmlFor="rename-description" className="text-[11px] font-bold text-slate-600 uppercase tracking-widest block mb-2">
                            {t("explore.manager.description")}
                        </label>
                        <textarea
                            id="rename-description"
                            value={subtitle}
                            maxLength={1000}
                            rows={3}
                            onChange={(e) => setSubtitle(e.target.value)}
                            className="w-full px-3 py-2 rounded-[5px] border border-slate-200 bg-slate-50 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:bg-white focus-visible:ring-2 focus-visible:ring-[#0D9488]"
                        />
                    </div>
                    <p className="text-[11px] text-slate-600">{t("explore.manager.renameHelp")}</p>
                    {error && <Notice tone="error">{error}</Notice>}
                </div>
                <FooterButtons onCancel={onClose} busy={busy} disabled={!title.trim()}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                    {t("explore.manager.save")}
                </FooterButtons>
            </form>
        </Modal>
    );
}

/* ─────────────────────────────────────────────
   Delete (folders with files ask a second time)
───────────────────────────────────────────── */
function DeleteModal({ row, onClose, onSubmit }) {
    const { t } = useLanguage();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [needsRecursive, setNeedsRecursive] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await onSubmit(row, needsRecursive);
            if (result === 'not-empty') {
                setNeedsRecursive(true);
                setBusy(false);
                return;
            }
            onClose();
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    };

    return (
        <Modal onClose={busy ? undefined : onClose} labelledBy="delete-title">
            <ModalHeader
                id="delete-title"
                icon={<Trash2 className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />}
                title={row.type === 'folder' ? t("explore.manager.deleteFolderTitle") : t("explore.manager.deleteFileTitle")}
                onClose={busy ? undefined : onClose}
            />
            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-4">
                    <p className="text-[13px] text-slate-800">
                        {needsRecursive
                            ? fill(t("explore.manager.deleteNotEmpty"), { name: row.name })
                            : fill(t("explore.manager.deleteConfirm"), { name: row.name })}
                    </p>
                    <p className="text-[12px] text-slate-600">{t("explore.manager.deleteWarning")}</p>
                    {error && <Notice tone="error">{error}</Notice>}
                </div>
                <FooterButtons onCancel={onClose} busy={busy}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                    {needsRecursive ? t("explore.manager.deleteEverything") : t("explore.manager.delete")}
                </FooterButtons>
            </form>
        </Modal>
    );
}

/* ─────────────────────────────────────────────
   Main FileManager
───────────────────────────────────────────── */
const FileManager = () => {
    const { t } = useLanguage();
    const { role, refreshExplore } = useContext(DataContext);
    const isAdmin = role === 'admin';
    const relativeTime = useRelativeTime();

    const [roots, setRoots]               = useState(null); // [{ path, title }]
    const [indexInfo, setIndexInfo]       = useState({ lastIndexRun: null, coversWaiting: 0 });
    const [rootsError, setRootsError]     = useState('');
    const [activeRoot, setActiveRoot]     = useState(null);
    const [folder, setFolder]             = useState(null); // the list response
    const [rows, setRows]                 = useState([]);
    const [loading, setLoading]           = useState(false);
    const [listError, setListError]       = useState('');
    const [actionError, setActionError]   = useState('');
    const [searchTerm, setSearchTerm]     = useState('');
    const [typeFilter, setTypeFilter]     = useState('all');
    const [modal, setModal]               = useState(null); // { kind: 'upload'|'folder'|'rename'|'delete', row? }
    const [viewItem, setViewItem]         = useState(null); // { file, mediaType }
    const [rescanning, setRescanning]     = useState(false);
    const [rescanResult, setRescanResult] = useState('');

    const rootTitle = useCallback(
        (root) => t(`explore.categories.${root.path}`) || root.title,
        [t]
    );

    const loadRoots = useCallback(async () => {
        try {
            const res = await fetch(`${SERVER_URL}/content/manager/roots`);
            if (!res.ok) throw new Error(await serverMessage(res, t("explore.manager.loadFailed")));
            const data = await res.json();
            setRoots(data.roots || []);
            setIndexInfo({ lastIndexRun: data.lastIndexRun || null, coversWaiting: Number(data.coversWaiting) || 0 });
            setRootsError('');
            return data.roots || [];
        } catch (e) {
            setRootsError(e.message || t("explore.manager.loadFailed"));
            setRoots((prev) => prev ?? []);
            return [];
        }
    }, [t]);

    const fetchList = useCallback(async (pathKey) => {
        setLoading(true);
        setListError('');
        try {
            const res = await fetch(`${SERVER_URL}/content/manager/list?path=${encodeURIComponent(pathKey)}`);
            if (!res.ok) throw new Error(await serverMessage(res, t("explore.manager.loadFailed")));
            const data = await res.json();
            setFolder(data);
            const folders = (data.categories || []).map(cat => ({
                id: `cat-${cat.id}`,
                name: cat.title,
                subtitle: cat.subtitle || '',
                type: 'folder',
                path_key: cat.path_key,
                is_disabled: !!Number(cat.is_disabled),
            }));
            const files = (data.items || []).map(it => ({
                id: `item-${it.id}`,
                name: it.title,
                subtitle: it.subtitle || '',
                type: 'file',
                mediaKind: it.type,
                path_key: it.path_key,
                size: it.size,
                hasCover: !!it.hasCover,
                is_disabled: !!Number(it.is_disabled),
            }));
            setRows([...folders, ...files]);
        } catch (e) {
            setListError(e.message || t("explore.manager.loadFailed"));
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [t]);

    // Start from the roots this person may manage (teachers: School content only).
    useEffect(() => {
        (async () => {
            const list = await loadRoots();
            const first = list.find((r) => r.path === 'custom-content') || list[0];
            if (first) {
                setActiveRoot(first.path);
                fetchList(first.path);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // While covers are being made, check back now and then so the count (and thumbnails) update.
    useEffect(() => {
        if (!indexInfo.coversWaiting) return undefined;
        const timer = setTimeout(() => {
            loadRoots();
            if (folder?.path) fetchList(folder.path);
        }, 20000);
        return () => clearTimeout(timer);
    }, [indexInfo.coversWaiting, folder?.path, loadRoots, fetchList]);

    const currentPath = folder?.path || activeRoot;
    const canChangeFiles = folder ? folder.canChangeFiles !== false : false;
    const isTopFolder = roots?.some((r) => r.path === currentPath);

    // After any change: reload this folder, the index status and the Explore catalogue.
    const afterChange = useCallback(() => {
        if (currentPath) fetchList(currentPath);
        loadRoots();
        refreshExplore?.();
    }, [currentPath, fetchList, loadRoots, refreshExplore]);

    const switchRoot = (path) => {
        setActiveRoot(path);
        setSearchTerm('');
        setActionError('');
        fetchList(path);
    };

    const filteredRows = useMemo(() => rows.filter((r) => {
        if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (typeFilter === 'all') return true;
        if (typeFilter === 'folder') return r.type === 'folder';
        if (r.type !== 'file') return false;
        return getFileMediaType(r.path_key) === typeFilter;
    }), [rows, searchTerm, typeFilter]);

    const TYPE_OPTIONS = [
        { value: 'all',    label: t("explore.manager.allTypes") },
        { value: 'folder', label: t("explore.manager.folders"), icon: FolderOpen },
        { value: 'video',  label: t("explore.types.video"),     icon: Video },
        { value: 'audio',  label: t("explore.types.audio"),     icon: Music },
        { value: 'pdf',    label: 'PDF',                         icon: File },
        { value: 'epub',   label: 'EPUB',                        icon: BookOpen },
    ];

    /* ── Actions ── */
    const handleToggleVisibility = async (row, nextDisabled) => {
        setActionError('');
        try {
            const res = await fetch(`${SERVER_URL}/content/manager/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: row.type === 'folder' ? 'category' : 'content', is_disabled: nextDisabled, path_key: row.path_key }),
            });
            if (!res.ok) throw new Error(await serverMessage(res, t("explore.manager.actionFailed")));
            afterChange();
        } catch (e) {
            setActionError(e.message);
        }
    };

    const handleNewFolder = async (name) => {
        const res = await fetch(`${SERVER_URL}/content/manager/create-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path: currentPath }),
        });
        if (res.status === 409) throw new Error(t("explore.manager.folderExists"));
        if (!res.ok) throw new Error(await serverMessage(res, t("explore.manager.actionFailed")));
        afterChange();
    };

    const handleRename = async (row, { title, subtitle }) => {
        const res = await fetch(`${SERVER_URL}/content/manager/details`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: row.type === 'folder' ? 'category' : 'content', path_key: row.path_key, title, subtitle }),
        });
        if (!res.ok) throw new Error(await serverMessage(res, t("explore.manager.actionFailed")));
        afterChange();
    };

    const handleDelete = async (row, recursive) => {
        const res = await fetch(`${SERVER_URL}/content/manager/item`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path_key: row.path_key, ...(recursive ? { recursive: true } : {}) }),
        });
        if (res.status === 409) {
            let body = null;
            try { body = await res.json(); } catch { /* ignore */ }
            if (body?.code === 'FOLDER_NOT_EMPTY') return 'not-empty';
            throw new Error(body?.error || body?.message || t("explore.manager.actionFailed"));
        }
        if (!res.ok) throw new Error(await serverMessage(res, t("explore.manager.actionFailed")));
        afterChange();
        return 'deleted';
    };

    const handleRescan = async () => {
        setRescanning(true);
        setRescanResult('');
        setActionError('');
        try {
            const res = await fetch(`${SERVER_URL}/content/manager/rescan`, { method: 'POST' });
            if (!res.ok) throw new Error(await serverMessage(res, t("explore.manager.actionFailed")));
            setRescanResult(t("explore.manager.rescanDone"));
            afterChange();
        } catch (e) {
            setActionError(e.message);
        } finally {
            setRescanning(false);
        }
    };

    /* ── Status line ── */
    const run = indexInfo.lastIndexRun;
    const statusLine = run?.finishedAt ? fill(t("explore.manager.lastChecked"), {
        when: relativeTime(run.finishedAt),
        added: (Number(run.foldersAdded) || 0) + (Number(run.filesAdded) || 0),
        updated: Number(run.filesUpdated) || 0,
        removed: (Number(run.foldersRemoved) || 0) + (Number(run.filesRemoved) || 0),
    }) : t("explore.manager.notCheckedYet");

    const folderCount = filteredRows.filter(r => r.type === 'folder').length;
    const fileCount   = filteredRows.filter(r => r.type === 'file').length;
    const breadcrumbs = folder?.breadcrumbs || [];
    const currentTitle = breadcrumbs.length ? breadcrumbs[breadcrumbs.length - 1].name : '';

    if (roots && roots.length === 0) {
        return (
            <div className="px-4 pb-24 md:pb-8">
                <Notice tone="error">{rootsError || t("explore.manager.noAccess")}</Notice>
            </div>
        );
    }

    return (
        <div className="px-4 md:px-4 pb-24 md:pb-8">

            {/* ── Roots (admins see both) ── */}
            {roots && roots.length > 1 && (
                <div role="tablist" aria-label={t("explore.manager.sections")} className="flex gap-2 mb-3 overflow-x-auto">
                    {roots.map((root) => (
                        <button
                            key={root.path}
                            type="button"
                            role="tab"
                            aria-selected={activeRoot === root.path}
                            onClick={() => switchRoot(root.path)}
                            className={`h-9 px-4 rounded-full text-[12px] font-bold transition-colors shrink-0 ${
                                activeRoot === root.path ? 'bg-accent-dark text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            {rootTitle(root)}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Index status ── */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-slate-600 font-medium">
                <span>{statusLine}</span>
                {indexInfo.coversWaiting > 0 && (
                    <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                        {fill(t("explore.manager.coversWaiting"), { n: indexInfo.coversWaiting })}
                    </span>
                )}
                {isAdmin && (
                    <button
                        type="button"
                        onClick={handleRescan}
                        disabled={rescanning}
                        title={t("explore.manager.rescanHelp")}
                        className="flex items-center gap-1 h-7 px-2.5 rounded-[5px] border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3 h-3 ${rescanning ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {rescanning ? t("explore.manager.rescanning") : t("explore.manager.rescan")}
                    </button>
                )}
                {rescanResult && <span role="status" className="text-green-700">{rescanResult}</span>}
            </div>

            {folder && !canChangeFiles && (
                <div className="mb-3">
                    <Notice>{t("explore.manager.cloudNotice")}</Notice>
                </div>
            )}
            {(actionError || listError) && (
                <div className="mb-3">
                    <Notice tone="error">{actionError || listError}</Notice>
                </div>
            )}

            {/* ── Toolbar ── */}
            <div className="mb-3">
                <div className="flex items-center gap-2 py-2 flex-wrap">
                    <div className="flex items-center gap-2 px-3 h-8 rounded-[5px] border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-slate-400 transition-all flex-1 min-w-[180px] max-w-[280px]">
                        <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
                        <input
                            aria-label={t("explore.manager.search")}
                            type="text"
                            placeholder={t("explore.manager.search")}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 text-[12px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none border-none min-w-0"
                        />
                    </div>

                    <FilterDropdown label={t("explore.manager.type")} options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />

                    {typeFilter !== 'all' && (
                        <button
                            type="button"
                            onClick={() => setTypeFilter('all')}
                            className="flex items-center gap-1 h-8 px-2.5 rounded-[5px] text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                        >
                            <X className="w-3 h-3" aria-hidden="true" /> {t("explore.manager.clear")}
                        </button>
                    )}

                    <div className="flex gap-2 ml-auto shrink-0">
                        <button
                            type="button"
                            onClick={() => setModal({ kind: 'folder' })}
                            disabled={!canChangeFiles || !folder}
                            title={!canChangeFiles ? t("explore.manager.cloudNotice") : undefined}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-[5px] border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">{t("explore.manager.newFolder")}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setModal({ kind: 'upload' })}
                            disabled={!canChangeFiles || !folder}
                            title={!canChangeFiles ? t("explore.manager.cloudNotice") : undefined}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-[5px] text-[12px] font-semibold text-white transition-colors bg-[#203B3B] hover:bg-[#295656] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">{t("explore.manager.upload")}</span>
                        </button>
                    </div>
                </div>

                {/* Breadcrumbs + counts */}
                <div className="flex items-center justify-between gap-2 py-2">
                    <nav aria-label={t("explore.manager.breadcrumbs")} className="flex items-center gap-1 text-[11px] flex-wrap min-w-0">
                        {breadcrumbs.map((b, idx) => {
                            const isLast = idx === breadcrumbs.length - 1;
                            const name = idx === 0 ? (t(`explore.categories.${b.path}`) || b.name) : b.name;
                            return (
                                <React.Fragment key={b.path}>
                                    <button
                                        type="button"
                                        onClick={() => fetchList(b.path)}
                                        aria-current={isLast ? 'page' : undefined}
                                        className={`font-semibold transition-colors hover:text-slate-900 ${isLast ? 'text-slate-800' : 'text-slate-600'}`}
                                    >
                                        {name}
                                    </button>
                                    {!isLast && <ChevronRight className="w-3 h-3 text-slate-500" aria-hidden="true" />}
                                </React.Fragment>
                            );
                        })}
                    </nav>
                    {!loading && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-600 font-medium shrink-0">
                            {folderCount > 0 && <span>{fill(t(folderCount === 1 ? "explore.manager.oneFolder" : "explore.manager.nFolders"), { n: folderCount })}</span>}
                            {fileCount > 0 && <span>{fill(t(fileCount === 1 ? "explore.manager.oneFileCount" : "explore.manager.nFiles"), { n: fileCount })}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Table ── */}
            <FileTable
                loading={loading || roots === null}
                files={filteredRows}
                canDelete={canChangeFiles}
                emptyText={rows.length > 0 ? t("explore.manager.noMatches") : (canChangeFiles ? t("explore.manager.emptyFolderUpload") : t("explore.manager.emptyFolder"))}
                onOpenFolder={(row) => { setSearchTerm(''); fetchList(row.path_key); }}
                onToggleVisibility={handleToggleVisibility}
                onView={(file, mediaType) => setViewItem({ file, mediaType })}
                onRename={(row) => setModal({ kind: 'rename', row })}
                onDelete={(row) => setModal({ kind: 'delete', row })}
            />

            {/* ── Modals ── */}
            {modal?.kind === 'folder' && (
                <NewFolderModal onClose={() => setModal(null)} onSubmit={handleNewFolder} />
            )}
            {modal?.kind === 'upload' && (
                <UploadModal
                    folderPath={currentPath}
                    folderTitle={isTopFolder ? (t(`explore.categories.${currentPath}`) || currentTitle) : currentTitle}
                    onClose={() => setModal(null)}
                    onUploaded={afterChange}
                />
            )}
            {modal?.kind === 'rename' && (
                <RenameModal row={modal.row} onClose={() => setModal(null)} onSubmit={handleRename} />
            )}
            {modal?.kind === 'delete' && (
                <DeleteModal row={modal.row} onClose={() => setModal(null)} onSubmit={handleDelete} />
            )}

            {/* ── Viewers ── */}
            {viewItem?.mediaType === 'epub' && (
                <EpubReader
                    url={`${SERVER_URL}/content/files/${encodeURI(viewItem.file.path_key)}`}
                    title={viewItem.file.name}
                    onClose={() => setViewItem(null)}
                />
            )}
            <UniversalPlayerModal
                isOpen={Boolean(viewItem) && viewItem?.mediaType !== 'epub'}
                onClose={() => setViewItem(null)}
                mediaItem={viewItem && viewItem.mediaType !== 'epub' ? {
                    title: viewItem.file.name,
                    type:  viewItem.mediaType === 'pdf' ? 'book' : viewItem.mediaType,
                    url:   `/${viewItem.file.path_key}`,
                } : null}
            />
        </div>
    );
};

export default FileManager;
