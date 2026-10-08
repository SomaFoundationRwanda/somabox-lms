import { useState } from "react";
import { Eye, EyeOff, File, Folder, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

function formatBytes(bytes) {
    const n = Number(bytes);
    if (!n || Number.isNaN(n)) return "--";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = n, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* Maps a file extension to how it previews (the same types Explore indexes) */
const EXT_MAP = {
    mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', m4v: 'video',
    mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio',
    pdf: 'pdf',
    epub: 'epub',
};

const TYPE_BADGE = {
    video: { label: 'VIDEO', className: 'bg-blue-50 text-blue-600' },
    audio: { label: 'AUDIO', className: 'bg-amber-50 text-amber-600' },
    pdf:   { label: 'PDF',   className: 'bg-red-50 text-red-500' },
    epub:  { label: 'EPUB',  className: 'bg-violet-50 text-violet-600' },
};

/** Preview type from a file name or path_key ("a/b/book.pdf" -> "pdf"), or null. */
export function getFileMediaType(name) {
    const ext = (String(name || '').split('.').pop() || '').toLowerCase();
    return EXT_MAP[ext] || null;
}

/** The cover the server made for a book, if it has one. */
function coverUrl(pathKey) {
    const key = pathKey.replace(/\.(pdf|epub)$/i, '.avif');
    return `${process.env.NEXT_PUBLIC_SERVER_URL}/pdf-book-covers/${encodeURI(key)}`;
}

function Thumb({ file }) {
    const [failed, setFailed] = useState(false);
    if (file.type === 'folder') return <Folder className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />;
    if (file.hasCover && !failed) {
        return (
            <img
                src={coverUrl(file.path_key)}
                alt=""
                loading="lazy"
                onError={() => setFailed(true)}
                className="w-7 h-9 object-cover rounded-[3px] border border-slate-200 shrink-0"
            />
        );
    }
    return <File className="w-5 h-5 text-slate-600 shrink-0" aria-hidden="true" />;
}

const ActionButton = ({ label, onClick, children, danger }) => (
    <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        aria-label={label}
        title={label}
        className={`w-7 h-7 flex items-center justify-center rounded-[5px] text-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] ${
            danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-slate-900'
        }`}
    >
        {children}
    </button>
);

// onSummary (admins): opens the file's AI summary (books, videos and audio).
const FileRow = ({ file, canDelete, onOpenFolder, onToggleVisibility, onView, onRename, onDelete, onSummary }) => {
    const { t } = useLanguage();
    const mediaType  = file.type === 'file' ? getFileMediaType(file.path_key) : null;
    const badge      = mediaType ? TYPE_BADGE[mediaType] : null;
    const canPreview = Boolean(mediaType);
    const hidden     = Boolean(file.is_disabled);

    const handleRowClick = () => {
        if (file.type === 'folder') { onOpenFolder?.(file); return; }
        if (canPreview)             { onView?.(file, mediaType); }
    };

    return (
        <tr
            className={`group border-b border-slate-50 transition-colors ${
                file.type === 'folder' || canPreview ? 'cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0D9488]' : 'hover:bg-slate-50'
            } ${hidden ? 'bg-slate-50/60' : ''}`}
            onClick={handleRowClick}
            tabIndex={file.type === 'folder' || canPreview ? 0 : undefined}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleRowClick(e); } }}
        >
            {/* Name */}
            <td className="px-5 py-3">
                <div className={`flex items-center gap-2.5 ${hidden ? 'opacity-50' : ''}`}>
                    <Thumb file={file} />
                    <div className="min-w-0">
                        <span className="block text-[12px] font-medium text-slate-800 truncate">{file.name}</span>
                        {file.subtitle ? (
                            <span className="block text-[11px] text-slate-600 truncate max-w-[320px]">{file.subtitle}</span>
                        ) : null}
                    </div>

                    {badge && (
                        <span className={`px-1.5 py-0.5 text-[11px] font-black rounded tracking-widest uppercase shrink-0 ${badge.className}`}>
                            {badge.label}
                        </span>
                    )}
                    {hidden && (
                        <span className="px-1.5 py-0.5 text-[11px] font-bold rounded bg-slate-200 text-slate-700 shrink-0">
                            {t("explore.manager.hiddenBadge")}
                        </span>
                    )}

                    {canPreview && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pr-1">
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                            {t("explore.manager.preview")}
                        </span>
                    )}
                </div>
            </td>

            {/* Size */}
            <td className="px-5 py-3 text-[12px] text-slate-600 whitespace-nowrap">
                {file.type === 'file' ? formatBytes(file.size) : '--'}
            </td>

            {/* Actions */}
            <td className="px-5 py-3">
                <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    {onSummary && mediaType && (
                        <ActionButton label={`${t("explore.summary.adminAction")}: ${file.name}`} onClick={() => onSummary(file)}>
                            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        </ActionButton>
                    )}
                    <ActionButton label={`${t("explore.manager.rename")}: ${file.name}`} onClick={() => onRename?.(file)}>
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </ActionButton>
                    <ActionButton
                        label={`${hidden ? t("explore.manager.show") : t("explore.manager.hide")}: ${file.name}`}
                        onClick={() => onToggleVisibility?.(file, !hidden)}
                    >
                        {hidden ? <Eye className="w-3.5 h-3.5" aria-hidden="true" /> : <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />}
                    </ActionButton>
                    {canDelete && (
                        <ActionButton danger label={`${t("explore.manager.delete")}: ${file.name}`} onClick={() => onDelete?.(file)}>
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </ActionButton>
                    )}
                </div>
            </td>
        </tr>
    );
};

export default FileRow;
