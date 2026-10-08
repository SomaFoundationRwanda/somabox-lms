'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FileTable from './fileTable';
import { getFileMediaType } from './fileRow';
import UniversalPlayerModal from '@/components/ui/UniversalPlayerModal';
import dynamic from "next/dynamic";
import { Button } from '@/components/ui/button';
import { clickableProps } from "@/lib/a11y";
import {
    Check, ChevronDown, ChevronRight, File, FolderPlus, Loader2, Search,
    Upload, X, CheckCircle2, AlertCircle, Music, Video, BookOpen, FolderOpen
} from 'lucide-react';

// react-reader (epub.js) loads only when a book is opened.
const EpubReader = dynamic(() => import("@/components/ui/library/EpubReader"), { ssr: false });

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

/* ─────────────────────────────────────────────
   Modal shell — shared backdrop + panel
───────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────
   Filter dropdown pill
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
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-[5px] border text-[11px] font-semibold transition-all ${
                    isFiltered
                        ? 'border-accent-dark bg-accent-dark text-white'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white'
                }`}
            >
                {label}
                {isFiltered && (
                    <span className="text-[10px] font-bold opacity-80">· {selected?.label}</span>
                )}
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''} ${isFiltered ? 'text-white/70' : 'text-slate-600'}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-[5px] border border-slate-200 shadow-xl z-30 min-w-[160px] py-1 overflow-hidden">
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => { if (!opt.disabled) { onChange(opt.value); setOpen(false); } }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-[12px] font-medium transition-colors text-left gap-6 ${
                                opt.disabled
                                    ? 'text-slate-500 cursor-default'
                                    : opt.value === value
                                    ? 'text-accent-dark bg-slate-50'
                                    : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <span className="flex items-center gap-2">
                                {opt.icon && <opt.icon className="w-3.5 h-3.5 shrink-0" />}
                                {opt.label}
                            </span>
                            {opt.value === value && <Check className="w-3 h-3 text-accent-dark shrink-0" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* Filter option sets */
const TYPE_OPTIONS = [
    { value: 'all',    label: 'All types' },
    { value: 'folder', label: 'Folders',     icon: FolderOpen },
    { value: 'video',  label: 'Video',        icon: Video },
    { value: 'audio',  label: 'Audio',        icon: Music },
    { value: 'pdf',    label: 'PDF',          icon: File },
    { value: 'epub',   label: 'EPUB',         icon: BookOpen },
    { value: 'other',  label: 'Other files',  icon: File },
];

const PEOPLE_OPTIONS  = [{ value: 'all', label: 'All users' }, { value: '_none', label: 'No data yet', disabled: true }];
const MODIFIED_OPTIONS = [
    { value: 'all',   label: 'Any time' },
    { value: 'today', label: 'Today',      disabled: true },
    { value: 'week',  label: 'This week',  disabled: true },
    { value: 'month', label: 'This month', disabled: true },
];
const SOURCE_OPTIONS  = [{ value: 'all', label: 'All sources' }, { value: '_none', label: 'No data yet', disabled: true }];

/* ─────────────────────────────────────────────
   New Folder modal
───────────────────────────────────────────── */
const MAX_FOLDER_NAME = 48;

function NewFolderModal({ onClose, onSubmit }) {
    const [name, setName]     = useState('');
    const [status, setStatus] = useState('idle'); // idle | loading | done | error
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
            setStatus('done');
            setTimeout(onClose, 1000);
        } catch (err) {
            setErrorMsg(err.message || 'Could not create folder.');
            setStatus('error');
        }
    };

    const remaining = MAX_FOLDER_NAME - name.length;
    const isOverLimit = remaining < 0;
    const preview = name.trim() || 'Untitled folder';

    return (
        <Modal onClose={status === 'loading' ? undefined : onClose}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[5px] bg-amber-50 flex items-center justify-center shrink-0">
                        <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <h2 className="text-[14px] font-black text-slate-900">New Folder</h2>
                </div>
                {status !== 'loading' && (
                    <button aria-label="Close"
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-[5px] text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-5">

                    {/* Live preview */}
                    <div className="flex flex-col items-center justify-center py-5 rounded-[5px] bg-slate-50 border border-slate-100 gap-2">
                        <div className="relative">
                            {/* Folder body */}
                            <svg width="56" height="48" viewBox="0 0 56 48" fill="none">
                                <rect x="0" y="10" width="56" height="38" rx="4" fill="#FCD34D" />
                                <rect x="0" y="6"  width="24" height="8"  rx="3" fill="#FBBF24" />
                            </svg>
                            {status === 'done' && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-white drop-shadow" />
                                </div>
                            )}
                        </div>
                        <p className="text-[12px] font-bold text-slate-700 max-w-[200px] truncate text-center">
                            {preview}
                        </p>
                        <p className="text-[10px] text-slate-600 font-medium">New folder · 0 items</p>
                    </div>

                    {/* Name input */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                Folder name
                            </label>
                            <span className={`text-[10px] font-medium tabular-nums ${
                                isOverLimit ? 'text-red-500' : remaining <= 10 ? 'text-amber-500' : 'text-slate-600'
                            }`}>
                                {remaining}
                            </span>
                        </div>
                        <input aria-label="Folder name"
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, MAX_FOLDER_NAME))}
                            placeholder="e.g. Mathematics Grade 4"
                            className={`w-full h-10 px-3 rounded-[5px] border text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] transition-all ${
                                isOverLimit
                                    ? 'border-red-300 bg-red-50 focus:border-red-400'
                                    : 'border-slate-200 bg-slate-50 focus:border-slate-400 focus:bg-white'
                            }`}
                        />
                    </div>

                    {/* Status feedback */}
                    {status === 'done' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[5px] bg-green-50 border border-green-100">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            <p className="text-[12px] font-semibold text-green-700">
                                Folder &ldquo;{name.trim()}&rdquo; created!
                            </p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[5px] bg-red-50 border border-red-100">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                            <p className="text-[12px] font-semibold text-red-600">{errorMsg}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {status !== 'done' && (
                    <div className="flex gap-2 px-5 pb-5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={status === 'loading'}
                            className="flex-1 h-9 rounded-[5px] border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                        >
                            Cancel
                        </button>
                        <Button
                            type="submit"
                            disabled={!name.trim() || isOverLimit || status === 'loading'}
                            className="flex-1 h-9 rounded-[5px] text-[12px] font-semibold gap-1.5"
                        >
                            {status === 'loading'
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                                : <><FolderPlus className="w-3.5 h-3.5" /> Create Folder</>
                            }
                        </Button>
                    </div>
                )}
            </form>
        </Modal>
    );
}

/* ─────────────────────────────────────────────
   Upload modal
───────────────────────────────────────────── */
const CONTENT_TYPES = [
    { value: 'book',  label: 'Book',  Icon: BookOpen, color: 'text-violet-600 bg-violet-50' },
    { value: 'video', label: 'Video', Icon: Video,    color: 'text-blue-600 bg-blue-50' },
    { value: 'audio', label: 'Audio', Icon: Music,    color: 'text-amber-600 bg-amber-50' },
];

function formatBytes(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
}

function UploadModal({ onClose, onSubmit }) {
    const [file, setFile]       = useState(null);
    const [type, setType]       = useState('book');
    const [dragging, setDragging] = useState(false);
    const [status, setStatus]   = useState('idle'); // idle | uploading | done | error
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef(null);

    const handleFile = (f) => { if (f) setFile(f); };

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
            await onSubmit(file, type);
            setStatus('done');
            setTimeout(onClose, 1200);
        } catch (err) {
            setErrorMsg(err.message || 'Upload failed.');
            setStatus('error');
        }
    };

    const selectedType = CONTENT_TYPES.find(t => t.value === type);

    return (
        <Modal onClose={status === 'uploading' ? undefined : onClose}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-[5px] bg-slate-100 flex items-center justify-center shrink-0">
                        <Upload className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <h2 className="text-[14px] font-black text-slate-900">Upload Content</h2>
                </div>
                {status !== 'uploading' && (
                    <button aria-label="Close"
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-[5px] text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <div className="px-5 py-5 space-y-5">

                    {/* Drop zone */}
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                            File
                        </p>
                        <div
                            {...clickableProps(() => fileInputRef.current?.click(), "Choose a file, or drop one here")}
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
                                className="hidden"
                                onChange={(e) => handleFile(e.target.files?.[0])}
                            />

                            {file ? (
                                <>
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-9 h-9 rounded-[5px] flex items-center justify-center shrink-0 ${selectedType?.color}`}>
                                            {selectedType && <selectedType.Icon className="w-4 h-4" />}
                                        </div>
                                        <div className="min-w-0 text-left">
                                            <p className="text-[12px] font-semibold text-slate-800 truncate max-w-[240px]">{file.name}</p>
                                            <p className="text-[10px] text-slate-600 mt-0.5">{formatBytes(file.size)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-600">Click to change file</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-9 h-9 rounded-[5px] bg-slate-100 flex items-center justify-center">
                                        <File className="w-4 h-4 text-slate-600" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[12px] font-semibold text-slate-600">
                                            Drop a file here or <span className="text-accent-dark underline underline-offset-2">browse</span>
                                        </p>
                                        <p className="text-[10px] text-slate-600 mt-0.5">Video, PDF, EPUB, MP3 and more</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Content type */}
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                            Content type
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {CONTENT_TYPES.map(({ value, label, Icon, color }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setType(value)}
                                    className={`flex flex-col items-center gap-1.5 py-3 rounded-[5px] border text-[11px] font-bold transition-all ${
                                        type === value
                                            ? 'border-accent-dark bg-accent-dark text-white shadow-sm'
                                            : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white'
                                    }`}
                                >
                                    <div className={`w-7 h-7 rounded-[5px] flex items-center justify-center ${
                                        type === value ? 'bg-white/20' : color
                                    }`}>
                                        <Icon className="w-3.5 h-3.5" />
                                    </div>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Progress / status */}
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

                {/* Footer */}
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
                            className="flex-1 h-9 rounded-[5px] text-[12px] font-semibold gap-1.5"
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

/* ─────────────────────────────────────────────
   Main FileManager
───────────────────────────────────────────── */
const FileManager = () => {
    const [searchTerm, setSearchTerm]       = useState('');
    const [currentPath, setCurrentPath]     = useState('custom-content');
    const [breadcrumbs, setBreadcrumbs]     = useState([]);
    const [rows, setRows]                   = useState([]);
    const [loading, setLoading]             = useState(false);
    const [showUpload, setShowUpload]       = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [viewItem, setViewItem]           = useState(null); // { file, mediaType }
    const [filters, setFilters]             = useState({ type: 'all', people: 'all', modified: 'all', source: 'all' });

    const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
    const activeFilterCount = Object.values(filters).filter(v => v !== 'all').length;

    const SERVER_URL_CLIENT = process.env.NEXT_PUBLIC_SERVER_URL;

    const handleView = (file, mediaType) => {
        setViewItem({ file, mediaType });
    };

    const handleCloseViewer = () => setViewItem(null);

    /* Build the URL the server uses to serve raw content files */
    const getContentUrl = (pathKey) =>
        `${SERVER_URL_CLIENT}/content/files/${pathKey}`;

    const fetchList = async (pathKey) => {
        setLoading(true);
        try {
            const res = await fetch(`${SERVER_URL}/content/manager/list?path=${encodeURIComponent(pathKey)}`);
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setCurrentPath(data.path);
            setBreadcrumbs(data.breadcrumbs || []);
            const folders = (data.categories || []).map(cat => ({
                id: `cat-${cat.id}`,
                name: cat.title,
                type: 'folder',
                path_key: cat.path_key,
                size: '--',
                is_disabled: !!cat.is_disabled,
            }));
            const files = (data.items || []).map(it => ({
                id: `item-${it.id}`,
                name: it.title,
                type: 'file',
                path_key: it.path_key,
                size: it.size ? `${it.size}` : '--',
                is_disabled: !!it.is_disabled,
            }));
            setRows([...folders, ...files]);
        } catch (e) {
            console.error(e);
            setRows([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchList(currentPath); }, []);

    const filteredRows = useMemo(() => {
        return rows.filter(r => {
            // Search
            if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

            // Type filter
            if (filters.type !== 'all') {
                if (filters.type === 'folder') return r.type === 'folder';
                if (r.type !== 'file') return false; // remaining options are file-type-specific
                const mt = getFileMediaType(r.name);
                if (filters.type === 'other') return mt === null;
                return mt === filters.type;
            }

            return true;
        });
    }, [rows, searchTerm, filters]);

    const handleOpenFolder       = (row) => { if (row.type === 'folder') fetchList(row.path_key); };

    const handleToggleVisibility = async (row, nextDisabled) => {
        try {
            const res = await fetch(`${SERVER_URL}/content/manager/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: row.type === 'folder' ? 'category' : 'content', is_disabled: nextDisabled, path_key: row.path_key }),
            });
            if (!res.ok) throw new Error('Toggle failed');
            fetchList(currentPath);
        } catch (e) { console.error(e); }
    };

    const handleNewFolderSubmit = async (name) => {
        const res = await fetch(`${SERVER_URL}/content/manager/create-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, path: currentPath }),
        });
        if (!res.ok) throw new Error('Create folder failed');
        setShowNewFolder(false);
        fetchList(currentPath);
    };

    const handleUploadSubmit = async (file, type) => {
        const form = new FormData();
        form.append('file', file);
        form.append('path', currentPath);
        form.append('type', type);
        const res = await fetch(`${SERVER_URL}/content/manager/upload`, { method: 'POST', body: form });
        if (!res.ok) throw new Error('Upload failed');
        await res.json();
        fetchList(currentPath);
    };

    const folderCount = filteredRows.filter(r => r.type === 'folder').length;
    const fileCount   = filteredRows.filter(r => r.type === 'file').length;

    return (
        <div className="px-4 md:px-4 pb-24 md:pb-8">

            {/* ── Toolbar (flat, no card) ── */}
            <div className="mb-3">

                {/* Top row */}
                <div className="flex items-center gap-2 py-2 flex-wrap">
                    {/* Search */}
                    <div className="flex items-center gap-2 px-3 h-8 rounded-[5px] border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-slate-400 transition-all flex-1 min-w-[180px] max-w-[280px]">
                        <Search className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <input aria-label="Search files/folders"
                            type="text"
                            placeholder="Search files/folders…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 text-[12px] text-slate-700 placeholder:text-slate-400 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] border-none min-w-0"
                        />
                    </div>

                    {/* Filter dropdowns */}
                    <FilterDropdown label="Type"     options={TYPE_OPTIONS}     value={filters.type}     onChange={v => setFilter('type', v)} />
                    <FilterDropdown label="People"   options={PEOPLE_OPTIONS}   value={filters.people}   onChange={v => setFilter('people', v)} />
                    <FilterDropdown label="Modified" options={MODIFIED_OPTIONS} value={filters.modified} onChange={v => setFilter('modified', v)} />
                    <FilterDropdown label="Source"   options={SOURCE_OPTIONS}   value={filters.source}   onChange={v => setFilter('source', v)} />

                    {/* Clear all — only when a filter is active */}
                    {activeFilterCount > 0 && (
                        <button
                            onClick={() => setFilters({ type: 'all', people: 'all', modified: 'all', source: 'all' })}
                            className="flex items-center gap-1 h-8 px-2.5 rounded-[5px] text-[11px] font-semibold text-slate-600 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
                        >
                            <X className="w-3 h-3" /> Clear
                        </button>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 ml-auto shrink-0">
                        <button
                            onClick={() => setShowNewFolder(true)}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-[5px] border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition-colors bg-white"
                        >
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">New Folder</span>
                        </button>
                        <button
                            onClick={() => setShowUpload(true)}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-[5px] text-[12px] font-semibold text-white transition-colors"
                            style={{ backgroundColor: '#203B3B' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#295656'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#203B3B'}
                        >
                            <Upload className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Upload</span>
                        </button>
                    </div>
                </div>

                {/* Bottom row: breadcrumb + count */}
                <div className="flex items-center justify-between gap-2 py-2">
                    <div className="flex items-center gap-1 text-[11px] flex-wrap min-w-0">
                        {breadcrumbs.length > 0 ? (
                            breadcrumbs.map((b, idx) => {
                                const isLast = idx === breadcrumbs.length - 1;
                                return (
                                    <React.Fragment key={b.path}>
                                        <button
                                            onClick={() => fetchList(b.path)}
                                            className={`font-semibold transition-colors hover:text-slate-800 ${isLast ? 'text-slate-700' : 'text-slate-600 hover:text-slate-600'}`}
                                        >
                                            {b.name}
                                        </button>
                                        {!isLast && <ChevronRight className="w-3 h-3 text-slate-500" />}
                                    </React.Fragment>
                                );
                            })
                        ) : (
                            <span className="text-slate-600 font-semibold">Root</span>
                        )}
                    </div>
                    {!loading && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-600 font-medium shrink-0">
                            {folderCount > 0 && <span>{folderCount} folder{folderCount !== 1 ? 's' : ''}</span>}
                            {folderCount > 0 && fileCount > 0 && <span className="text-slate-200">·</span>}
                            {fileCount > 0 && <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Table ── */}
            <FileTable
                loading={loading}
                files={filteredRows}
                onOpenFolder={handleOpenFolder}
                onToggleVisibility={handleToggleVisibility}
                onView={handleView}
            />

            {/* ── Modals ── */}
            {showNewFolder && (
                <NewFolderModal
                    onClose={() => setShowNewFolder(false)}
                    onSubmit={handleNewFolderSubmit}
                />
            )}
            {showUpload && (
                <UploadModal
                    onClose={() => setShowUpload(false)}
                    onSubmit={handleUploadSubmit}
                />
            )}

            {/* ── Viewers ── */}

            {/* EPUB — uses its own fullscreen reader */}
            {viewItem?.mediaType === 'epub' && (
                <EpubReader
                    url={getContentUrl(viewItem.file.path_key)}
                    title={viewItem.file.name}
                    onClose={handleCloseViewer}
                />
            )}

            {/* Video / Audio / PDF — handled by UniversalPlayerModal */}
            <UniversalPlayerModal
                isOpen={Boolean(viewItem) && viewItem?.mediaType !== 'epub'}
                onClose={handleCloseViewer}
                mediaItem={viewItem ? {
                    title: viewItem.file.name,
                    type:  viewItem.mediaType === 'pdf' ? 'book' : viewItem.mediaType,
                    url:   `/${viewItem.file.path_key}`,
                } : null}
            />
        </div>
    );
};

export default FileManager;
