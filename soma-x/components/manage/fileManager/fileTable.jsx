import { Folder } from "lucide-react";
import FileRow from './fileRow';
import { useLanguage } from "@/context/LanguageContext";
import Loader from "@/components/ui/Loader";

const FileTable = ({ files, loading, emptyText, canDelete, onOpenFolder, onToggleVisibility, onView, onRename, onDelete, onSummary }) => {
    const { t } = useLanguage();
    return (
        <div className="bg-surface rounded-xl border border-line overflow-x-auto">
            <table className="w-full min-w-[560px]">
                <thead className="bg-surface-sunken">
                    <tr>
                        <th className="px-5 py-3 text-left text-caption font-bold text-fg-muted">{t("explore.manager.colName")}</th>
                        <th className="px-5 py-3 text-left text-caption font-bold text-fg-muted">{t("explore.manager.colSize")}</th>
                        <th className="px-5 py-3 text-right text-caption font-bold text-fg-muted">{t("explore.manager.colActions")}</th>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr>
                            <td className="px-5 py-3" colSpan={3}>
                                <Loader variant="page" size={56} className="min-h-[30vh]" />
                            </td>
                        </tr>
                    ) : files.length === 0 ? (
                        <tr>
                            <td className="px-5 py-12 text-center" colSpan={3}>
                                <div className="flex flex-col items-center gap-2">
                                    <Folder className="w-8 h-8 text-fg-subtle" aria-hidden="true" />
                                    <p className="text-caption font-semibold text-fg-muted">{emptyText || t("explore.manager.emptyFolder")}</p>
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
                                onSummary={onSummary}
                            />
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default FileTable;
