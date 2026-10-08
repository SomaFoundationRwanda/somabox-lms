import { Eye, File, Folder } from "lucide-react";

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return "--";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(2)} ${units[i]}`;
}

/* Maps a filename extension to a media type + badge colour */
const EXT_MAP = {
    mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video', m4v: 'video',
    mp3: 'audio', wav: 'audio', ogg: 'audio', aac: 'audio', flac: 'audio', m4a: 'audio',
    pdf: 'pdf',
    epub: 'epub',
};

const TYPE_BADGE = {
    video: { label: 'VIDEO', className: 'bg-blue-50 text-blue-600' },
    audio: { label: 'AUDIO', className: 'bg-amber-50 text-amber-600' },
    pdf:   { label: 'PDF',   className: 'bg-red-50 text-red-500' },
    epub:  { label: 'EPUB',  className: 'bg-violet-50 text-violet-600' },
};

export function getFileMediaType(name) {
    const ext = (name?.split('.').pop() || '').toLowerCase();
    return EXT_MAP[ext] || null;
}

const FileRow = ({ file, onOpenFolder, onToggleVisibility, onView }) => {
    const mediaType  = file.type === 'file' ? getFileMediaType(file.name) : null;
    const badge      = mediaType ? TYPE_BADGE[mediaType] : null;
    const canPreview = Boolean(mediaType);

    const handleRowClick = () => {
        if (file.type === 'folder') { onOpenFolder?.(file); return; }
        if (canPreview)             { onView?.(file, mediaType); }
    };

    const handleToggle = (e) => {
        e.stopPropagation();
        onToggleVisibility?.(file, !file.is_disabled);
    };

    return (
        <tr
            className={`group border-b border-slate-50 transition-colors ${
                file.type === 'folder' || canPreview ? 'cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0D9488]' : 'hover:bg-slate-50'
            }`}
            onClick={handleRowClick}
            tabIndex={file.type === 'folder' || canPreview ? 0 : undefined}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleRowClick(e); } }}
        >
            {/* Name */}
            <td className="px-5 py-3">
                <div className="flex items-center gap-2.5">
                    {file.type === 'folder' ? (
                        <Folder className="w-5 h-5 text-amber-500 shrink-0" />
                    ) : (
                        <File className="w-5 h-5 text-slate-600 shrink-0" />
                    )}
                    <span className="text-[12px] font-medium text-slate-800">{file.name}</span>

                    {/* Type badge — always visible for known media types */}
                    {badge && (
                        <span className={`px-1.5 py-0.5 text-[11px] font-black rounded tracking-widest uppercase shrink-0 ${badge.className}`}>
                            {badge.label}
                        </span>
                    )}

                    {/* Preview hint — fades in on row hover */}
                    {canPreview && (
                        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pr-1">
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                        </span>
                    )}
                </div>
            </td>

            {/* Added by */}
            <td className="px-5 py-3 text-[12px] text-slate-600">--</td>

            {/* Size */}
            <td className="px-5 py-3 text-[12px] text-slate-600">
                {file.size ? formatBytes(file.size) : '--'}
            </td>

            {/* Visibility */}
            <td className="px-5 py-3">
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                        file.is_disabled ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'
                    }`}>
                        {file.is_disabled ? 'Hidden' : 'Visible'}
                    </span>
                    <button
                        onClick={handleToggle}
                        className={`text-[11px] h-7 px-3 rounded-[5px] font-semibold transition-colors ${
                            file.is_disabled
                                ? 'bg-slate-100 text-slate-600 hover:bg-accent-dark hover:text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600'
                        }`}
                    >
                        {file.is_disabled ? 'Enable' : 'Disable'}
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default FileRow;
