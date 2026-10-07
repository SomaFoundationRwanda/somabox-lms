"use client"
import formatSize from "@/components/helpers/formatSize";
import Unauthorized from "@/components/sections/Unauthorized";
import DataContext from "@/context/DataContext";
import { useContext, useEffect, useState } from "react";
import ManageTitle from "@/components/manage/ManageTitle";
import { Section, EmptyState } from "@/components/layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, File, FolderClosed, FolderOpen, Loader2, X } from "lucide-react";

/* ── Inline feedback banner ── */
const Banner = ({ type, message, onDismiss }) => {
    const styles = {
        error:   "bg-red-50 border-red-200 text-red-700",
        warning: "bg-amber-50 border-amber-200 text-amber-700",
        success: "bg-green-50 border-green-200 text-green-600",
        info:    "bg-blue-50 border-blue-200 text-blue-700",
    };
    return (
        <div className={`flex items-start justify-between gap-3 px-3 py-2.5 rounded-[5px] border text-[12px] font-medium ${styles[type]}`}>
            <span className="flex-1">{message}</span>
            {onDismiss && (
                <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 mt-0.5">
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};

/* ── Inline confirmation panel ── */
const ConfirmBanner = ({ message, onConfirm, onCancel }) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[5px] border bg-amber-50 border-amber-200">
        <p className="text-[12px] font-medium text-amber-800 flex-1">{message}</p>
        <div className="flex gap-2 shrink-0">
            <button
                onClick={onCancel}
                className="text-[11px] px-3 h-7 rounded-full border border-amber-300 text-amber-700 font-semibold hover:bg-amber-100 transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={onConfirm}
                className="text-[11px] px-3 h-7 rounded-full bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors"
            >
                Confirm
            </button>
        </div>
    </div>
);

/* ── Recursive TreeNode ── */
const TreeNode = ({ node, onCheck, checked }) => {
    const [collapsed, setCollapsed] = useState(true);

    if (node.type === "folder") {
        return (
            <div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-[5px] hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <Checkbox
                        checked={!!checked[node.path]}
                        onCheckedChange={(v) => onCheck(node, v === true)}
                    />
                    <button
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => setCollapsed(!collapsed)}
                    >
                        {collapsed
                            ? <FolderClosed className="w-4 h-4 text-amber-500 shrink-0" />
                            : <FolderOpen    className="w-4 h-4 text-amber-500 shrink-0" />
                        }
                        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{node.name}</span>
                        {node.isDownloaded && (
                            <span className="text-[9px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold">
                                Downloaded
                            </span>
                        )}
                        <span className="ml-auto text-slate-500">
                            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </span>
                    </button>
                </div>
                {!collapsed && node.children && (
                    <div className="ml-6 border-l border-slate-100 dark:border-slate-800 pl-2 mt-0.5 space-y-0.5">
                        {node.children.map((child, i) => (
                            <TreeNode key={i} node={child} onCheck={onCheck} checked={checked} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (node.type === "file") {
        return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[5px] hover:bg-slate-50 transition-colors ml-6">
                <Checkbox
                    checked={!!checked[node.path]}
                    onCheckedChange={(v) => onCheck(node, v === true)}
                />
                <File className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="text-[12px] text-slate-600 flex-1">{node.name}</span>
                {node.isDownloaded && (
                    <span className="text-[9px] bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold">
                        Downloaded
                    </span>
                )}
                <span className="text-[11px] text-slate-600">{formatSize(node.size)}</span>
            </div>
        );
    }

    return null;
};

const ManageSync = () => {
    const { authenticated } = useContext(DataContext);
    const [contentTree, setContentTree]         = useState([]);
    const [checked, setChecked]                 = useState({});
    const [cloudUnavailable, setCloudUnavailable] = useState(false);
    const [fetching, setFetching]               = useState(false);
    const [refetch, setRefetch]                 = useState(false);
    const [downloadStatus, setDownloadStatus]   = useState('init');
    const [deleting, setDeleting]               = useState(false);
    const [banner, setBanner]                   = useState(null);
    const [confirm, setConfirm]                 = useState(null);

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    useEffect(() => {
        async function loadData() {
            setFetching(true);
            setCloudUnavailable(false);
            try {
                const res = await fetch(`${SERVER_URL}/cloud/available-content`);
                if (res.status === 503) { setCloudUnavailable(true); return; }
                setContentTree(await res.json());
            } catch (err) {
                console.error(err);
            } finally {
                setFetching(false);
            }
        }
        if (authenticated) loadData();
    }, [authenticated, refetch, SERVER_URL]);

    const toggleCheckRecursive = (node, isChecked, newChecked = {}) => {
        newChecked[node.path] = isChecked;
        if (node.children) node.children.forEach(child => toggleCheckRecursive(child, isChecked, newChecked));
        return newChecked;
    };

    const handleCheck = (node, isChecked) => {
        setChecked(prev => ({ ...prev, ...toggleCheckRecursive(node, isChecked, {}) }));
    };

    function getCheckedFiles(tree, checked) {
        let files = [];
        tree.forEach(node => {
            if (node.type === 'file' && checked[node.path]) files.push(node.path);
            else if (node.type === 'folder' && node.children) files.push(...getCheckedFiles(node.children, checked));
        });
        return files;
    }

    const executeDownload = async (selected) => {
        try {
            let res = await fetch(`${SERVER_URL}/cloud/download-status`);
            let data0 = await res.json();
            if (data0.status === "downloading") { setDownloadStatus("downloading"); return; }

            setDownloadStatus("downloading");
            await fetch(`${SERVER_URL}/cloud/download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: selected }),
            });
        } catch (err) {
            console.error(err);
            setDownloadStatus("failed");
        }
    };

    const handleDownload = async () => {
        const selected = getCheckedFiles(contentTree, checked);
        if (selected.length === 0) {
            setBanner({ type: 'warning', message: 'Please select at least one file or folder to download.' });
            return;
        }

        const alreadyDownloaded = [];
        const findDownloaded = (tree, paths) => {
            tree.forEach(node => {
                if (paths.includes(node.path) && node.isDownloaded) alreadyDownloaded.push(node.name);
                if (node.children) findDownloaded(node.children, paths);
            });
        };
        findDownloaded(contentTree, selected);

        if (alreadyDownloaded.length > 0) {
            setConfirm({
                message: `${alreadyDownloaded.length} selected item${alreadyDownloaded.length > 1 ? 's are' : ' is'} already downloaded and will be skipped. Proceed?`,
                onConfirm: () => { setConfirm(null); executeDownload(selected); },
            });
            return;
        }
        executeDownload(selected);
    };

    const executeDelete = async () => {
        const selectedPaths = Object.keys(checked).filter(p => checked[p]);
        setDeleting(true);
        try {
            const res = await fetch(`${SERVER_URL}/cloud/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: selectedPaths }),
            });
            if (res.ok) {
                setBanner({ type: 'success', message: 'Content deleted successfully.' });
                setChecked({});
                setRefetch(r => !r);
            } else {
                const data = await res.json();
                setBanner({ type: 'error', message: `Delete failed: ${data.error || 'Unknown error'}` });
            }
        } catch (err) {
            console.error(err);
            setBanner({ type: 'error', message: 'An error occurred while deleting content.' });
        } finally {
            setDeleting(false);
        }
    };

    const handleDelete = () => {
        const selectedPaths = Object.keys(checked).filter(p => checked[p]);
        if (selectedPaths.length === 0) {
            setBanner({ type: 'warning', message: 'Please select at least one file or folder to delete.' });
            return;
        }
        setConfirm({
            message: `Delete ${selectedPaths.length} item${selectedPaths.length > 1 ? 's' : ''}? This will remove files and database records.`,
            onConfirm: () => { setConfirm(null); executeDelete(); },
        });
    };

    useEffect(() => {
        if (downloadStatus !== "downloading") return;
        const checkStatus = async () => {
            try {
                const res = await fetch(`${SERVER_URL}/cloud/download-status`);
                const data = await res.json();
                if (data.status === "finished") setDownloadStatus("finished");
                else if (data.status === "failed") setDownloadStatus("failed");
            } catch (err) {
                console.error(err);
                setDownloadStatus("failed");
            }
        };
        checkStatus();
        const id = setInterval(checkStatus, 2000);
        return () => clearInterval(id);
    }, [downloadStatus, SERVER_URL]);

    if (!authenticated) return <Unauthorized />;

    const selectedCount = Object.values(checked).filter(Boolean).length;

    return (
        <div className="min-h-screen pb-24 md:pb-8">
            <div className="px-4 md:px-4">
                <ManageTitle
                    title="Sync Content"
                    description="Choose folders and files from the cloud to download to this device, or remove downloaded content."
                />
            </div>

            <div className="px-4 md:px-4 space-y-4">
                {/* Feedback banners */}
                {(banner || confirm) && (
                    <div className="space-y-2">
                        {banner && (
                            <Banner
                                type={banner.type}
                                message={banner.message}
                                onDismiss={() => setBanner(null)}
                            />
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

                <Section title="Cloud content">
                    {/* Tree */}
                    {fetching ? (
                        <div className="flex flex-col gap-2 py-4">
                            {[1,2,3].map(i => (
                                <div key={i} className="h-9 bg-slate-100 dark:bg-slate-800 rounded-[5px] animate-pulse" />
                            ))}
                        </div>
                    ) : cloudUnavailable ? (
                        <EmptyState
                            icon={<AlertCircle className="w-8 h-8 text-red-300" />}
                            title="Remote server is not available"
                        />
                    ) : contentTree.length === 0 ? (
                        <EmptyState
                            icon={<FolderClosed className="w-8 h-8" />}
                            title="No content available"
                        />
                    ) : (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-0.5 overflow-x-auto">
                            {contentTree.map((node, i) => (
                                <TreeNode key={i} node={node} onCheck={handleCheck} checked={checked} />
                            ))}
                        </div>
                    )}

                    {/* Action bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                        {/* Left: status + selection count */}
                        <div className="flex items-center gap-3 flex-wrap">
                            {selectedCount > 0 && (
                                <span className="text-[11px] font-semibold text-slate-500">
                                    {selectedCount} selected
                                </span>
                            )}
                            {downloadStatus !== 'init' && (
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    downloadStatus === 'finished'   ? 'bg-green-50 text-green-600' :
                                    downloadStatus === 'failed'     ? 'bg-red-50 text-red-600' :
                                    downloadStatus === 'downloading' ? 'bg-blue-50 text-blue-600' :
                                    'bg-slate-100 text-slate-500'
                                }`}>
                                    {downloadStatus === 'downloading' && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {downloadStatus === 'finished'    && <CheckCircle2 className="w-3 h-3" />}
                                    {downloadStatus}
                                </span>
                            )}
                        </div>

                        {/* Right: action buttons */}
                        <div className="flex gap-2 shrink-0">
                            {cloudUnavailable || fetching ? (
                                <Button
                                    onClick={() => setRefetch(r => !r)}
                                    className="h-8 px-4 rounded-[5px] text-[12px]"
                                >
                                    Retry
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        onClick={handleDownload}
                                        disabled={downloadStatus === "downloading"}
                                        className="h-8 px-4 rounded-[5px] text-[12px] gap-1.5"
                                    >
                                        {downloadStatus === "downloading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Download
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleDelete}
                                        disabled={deleting}
                                        className="h-8 px-4 rounded-[5px] text-[12px] gap-1.5"
                                    >
                                        {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Delete
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </Section>
            </div>
        </div>
    );
};

export default ManageSync;
