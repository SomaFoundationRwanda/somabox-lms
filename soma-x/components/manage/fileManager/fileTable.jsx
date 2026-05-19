import { Folder } from "lucide-react";
import FileRow from './fileRow';

const FileTable = ({ files, loading, onOpenFolder, onToggleVisibility, onView }) => {
    return (
        <div className="bg-white rounded-[5px] border border-slate-100 overflow-hidden">
            <table className="w-full">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Added by</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Size</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visibility</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        [...Array(4)].map((_, i) => (
                            <tr key={i}>
                                <td className="px-5 py-3" colSpan={4}>
                                    <div className="h-9 bg-slate-100 rounded-[5px] animate-pulse" />
                                </td>
                            </tr>
                        ))
                    ) : files.length === 0 ? (
                        <tr>
                            <td className="px-5 py-12 text-center" colSpan={4}>
                                <div className="flex flex-col items-center gap-2">
                                    <Folder className="w-8 h-8 text-slate-200" />
                                    <p className="text-[12px] font-semibold text-slate-400">This folder is empty</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        files.map((file) => (
                            <FileRow
                                key={file.id}
                                file={file}
                                onOpenFolder={onOpenFolder}
                                onToggleVisibility={onToggleVisibility}
                                onView={onView}
                            />
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default FileTable;
