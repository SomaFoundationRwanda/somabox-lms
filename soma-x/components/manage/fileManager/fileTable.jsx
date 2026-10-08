import { Folder } from "lucide-react";
import FileRow from './fileRow';
import { useLanguage } from "@/context/LanguageContext";

const FileTable = ({ files, loading, emptyText, canDelete, onOpenFolder, onToggleVisibility, onView, onRename, onDelete }) => {
    const { t } = useLanguage();
    return (
        <div className="bg-white dark:bg-transparent rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full min-w-[560px]">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t("explore.manager.colName")}</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t("explore.manager.colSize")}</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t("explore.manager.colActions")}</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        [...Array(4)].map((_, i) => (
                            <tr key={i}>
                                <td className="px-5 py-3" colSpan={3}>
                                    <div className="h-9 bg-slate-100 rounded-[5px] animate-pulse" />
                                </td>
                            </tr>
                        ))
                    ) : files.length === 0 ? (
                        <tr>
                            <td className="px-5 py-12 text-center" colSpan={3}>
                                <div className="flex flex-col items-center gap-2">
                                    <Folder className="w-8 h-8 text-slate-300" aria-hidden="true" />
                                    <p className="text-[12px] font-semibold text-slate-600">{emptyText || t("explore.manager.emptyFolder")}</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        files.map((file) => (
                            <FileRow
                                key={file.id}
                                file={file}
                                canDelete={canDelete}
                                onOpenFolder={onOpenFolder}
                                onToggleVisibility={onToggleVisibility}
                                onView={onView}
                                onRename={onRename}
                                onDelete={onDelete}
                            />
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default FileTable;
