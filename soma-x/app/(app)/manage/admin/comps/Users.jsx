"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddUserDrawer } from "@/components/AddUserDrawer";
import UserProfileModal from "@/components/manage/UserProfileModal";
import { DataTable } from "@/components/layout";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import { useToast } from "@/context/ToastContext";
import {
    ArrowUpDown, CheckSquare, ChevronLeft, ChevronRight, Download, Eye, Filter,
    GraduationCap, KeyRound, MoreVertical, Pencil, Phone, School, Search,
    ShieldAlert, ShieldCheck, Square, Trash2, User, UserCheck, Users2, UserX, X
} from "lucide-react";
import { startRouteLoading } from "@/components/global/RouteLoader";
import Loader from "@/components/ui/Loader";
import { shownEmail } from "@/lib/session";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { useSettled, useUserList, useUsersChanged } from "@/lib/queries/users";
import { Field, PasswordInput, Select, TextInput } from "@/components/form";

function getInitials(name, email) {
    if (name?.trim()) return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (email?.[0] || "?").toUpperCase();
}

// A date in the UI language ("rw" falls back to English where Intl lacks Kinyarwanda).
function formatDate(raw, lang) {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    const opts = { month: "short", day: "numeric", year: "numeric" };
    try { return d.toLocaleDateString(lang === "rw" ? ["rw", "en-RW", "en"] : lang, opts); } catch { return d.toLocaleDateString("en", opts); }
}

export default function Users() {
    const { t, lang } = useLanguage();
    const { showToast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Filter & Search State initialized from URL query params
    const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
    const [roleFilter, setRoleFilter]   = useState(searchParams.get("role") || "all");
    const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
    const [dateFilter, setDateFilter]   = useState(searchParams.get("dateRange") || "all");
    const [sortBy, setSortBy]           = useState(searchParams.get("sortBy") || "created_at");
    const [sortOrder, setSortOrder]     = useState(searchParams.get("sortOrder") || "desc");
    const [page, setPage]               = useState(parseInt(searchParams.get("page") || "1", 10));

    // User Data & Selection State
    const settledSearch = useSettled(searchQuery);
    const list = useUserList({
        search: settledSearch, role: roleFilter, status: statusFilter, dateRange: dateFilter,
        sortBy, sortOrder, page: String(page), limit: "10",
    });
    const users = list.data?.users || [];
    const total = list.data?.total || 0;
    const totalPages = list.data?.totalPages || 1;
    const loading = list.isPending;
    const usersChanged = useUsersChanged();
    const [selectedRows, setSelectedRows] = useState(new Set());

    // Modals
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [viewProfileUser, setViewProfileUser] = useState(null);
    const [deleteModalUser, setDeleteModalUser] = useState(null);
    const [typedConfirmName, setTypedConfirmName] = useState("");
    // As the box says: the user's full name or their email (email in any case).
    const typedConfirm = typedConfirmName.trim();
    const deleteConfirmed = !!deleteModalUser && !!typedConfirm && (
        typedConfirm === String(deleteModalUser.full_name || "").trim()
        || typedConfirm.toLowerCase() === String(deleteModalUser.email || "").trim().toLowerCase()
    );
    const [resetPassUser, setResetPassUser] = useState(null);
    const [newPassword, setNewPassword] = useState("");
    const [bulkRoleModal, setBulkRoleModal] = useState(false);
    const [selectedBulkRole, setSelectedBulkRole] = useState("scholar");

    // Sync State to URL
    useEffect(() => {
        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (roleFilter !== "all") params.set("role", roleFilter);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (dateFilter !== "all") params.set("dateRange", dateFilter);
        if (sortBy !== "created_at") params.set("sortBy", sortBy);
        if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
        if (page > 1) params.set("page", page.toString());

        const queryStr = params.toString();
        const newUrl = queryStr ? `?${queryStr}` : window.location.pathname;
        window.history.replaceState(null, "", newUrl);
    }, [searchQuery, roleFilter, statusFilter, dateFilter, sortBy, sortOrder, page]);

    useEffect(() => {
        if (list.isError) showToast(t("admin.users.loadListFailed"), "error");
    }, [list.isError]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear filters
    const clearFilters = () => {
        setSearchQuery("");
        setRoleFilter("all");
        setStatusFilter("all");
        setDateFilter("all");
        setPage(1);
    };

    const hasActiveFilters = searchQuery || roleFilter !== "all" || statusFilter !== "all" || dateFilter !== "all";

    // Row selection toggle
    const toggleSelectRow = (id) => {
        const next = new Set(selectedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRows(next);
    };

    const toggleSelectAll = () => {
        if (selectedRows.size === users.length && users.length > 0) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(users.map(u => u.id)));
        }
    };

    // User Lifecycle Handlers
    const handleToggleStatus = async (user) => {
        const newStatus = user.is_active === 0;
        try {
            const data = await apiFetch(`/users/${user.id}/status`, { method: "PATCH", json: { isActive: newStatus } });

            showToast(fill(t(newStatus ? "admin.users.reactivated" : "admin.users.deactivated"), { name: user.full_name || user.email }), "success");
            // A teacher's courses can be left with no teacher: say which, so the admin gives them one.
            const stranded = data.coursesWithoutTeacher || [];
            if (stranded.length) {
                showToast(fill(t("admin.users.coursesWithoutTeacher"), { courses: stranded.map((c) => c.title).join(", ") }), "warning", 12000);
            }
            usersChanged();
        } catch (err) {
            showToast(getErrorMessage(err, t), "error");
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteModalUser) return;
        try {
            await apiFetch(`/users/${deleteModalUser.id}`, { method: "DELETE", json: {} });
            showToast(t("admin.users.deleted"), "success");
            setDeleteModalUser(null);
            setTypedConfirmName("");
            usersChanged();
        } catch (err) {
            showToast(getErrorMessage(err, t), "error");
        }
    };

    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        if (!resetPassUser || newPassword.length < 6) {
            showToast(t("admin.users.passwordShort"), "error");
            return;
        }
        try {
            await apiFetch(`/users/${resetPassUser.id}/reset-password`, { method: "PATCH", json: { newPassword } });
            showToast(t("admin.users.resetDone"), "success");
            setResetPassUser(null);
            setNewPassword("");
        } catch (err) {
            showToast(getErrorMessage(err, t), "error");
        }
    };

    // Bulk Handlers
    const handleBulkAction = async (action, extraData = {}) => {
        const ids = Array.from(selectedRows);
        if (ids.length === 0) return;
        try {
            const data = await apiFetch("/users/bulk-action", { method: "POST", json: { userIds: ids, action, ...extraData } });
            showToast(data.message || t("admin.users.bulkDone"), "success");
            setSelectedRows(new Set());
            setBulkRoleModal(false);
            usersChanged();
        } catch (err) {
            showToast(getErrorMessage(err, t), "error");
        }
    };

    const handleExportCSV = () => {
        const selectedUsersList = users.filter(u => selectedRows.has(u.id));
        const listToExport = selectedUsersList.length > 0 ? selectedUsersList : users;

        const headers = ["ID", "Full Name", "Email", "Learner code", "Role", "Status", "Phone", "School", "Grade", "Joined Date"];
        const rows = listToExport.map(u => [
            u.id,
            `"${u.full_name || ''}"`,
            `"${u.email || ''}"`,
            `"${u.learner_code || ''}"`,
            u.role,
            u.is_active === 0 ? "Inactive" : "Active",
            `"${u.phone || ''}"`,
            `"${u.school_name || ''}"`,
            `"${u.grade_level || ''}"`,
            `"${u.created_at || ''}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `somabox_users_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(t("admin.users.exported"), "success");
    };

    const roleStyle = {
        admin: "bg-brand-soft text-brand-fg",
        teacher: "bg-success-soft text-success-fg",
        scholar: "bg-info-soft text-info-fg",
    };
    const roleIcons = { admin: ShieldCheck, teacher: User, scholar: GraduationCap };

    const toggleSort = (key, firstOrder = "asc") => {
        if (sortBy === key) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        else { setSortBy(key); setSortOrder(firstOrder); }
    };

    const SortHeader = ({ label, sortKey, firstOrder }) => (
        <button
            type="button"
            onClick={() => toggleSort(sortKey, firstOrder)}
            className="inline-flex items-center gap-1 font-semibold select-none text-fg-subtle hover:text-fg"
        >
            {label}
            <ArrowUpDown className="w-3 h-3 opacity-60" />
        </button>
    );

    const allSelected = selectedRows.size === users.length && users.length > 0;

    const columns = [
        {
            key: "select",
            className: "w-10",
            header: (
                <button type="button" onClick={toggleSelectAll} aria-label={t("admin.users.selectAll")} className="text-fg-muted hover:text-fg-muted align-middle">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-brand-fg" /> : <Square className="w-4 h-4" />}
                </button>
            ),
            render: (user) => (
                <button type="button" onClick={() => toggleSelectRow(user.id)} aria-label={t("admin.users.selectUser")} className="text-fg-muted hover:text-fg-muted align-middle">
                    {selectedRows.has(user.id) ? <CheckSquare className="w-4 h-4 text-brand-fg" /> : <Square className="w-4 h-4" />}
                </button>
            ),
        },
        {
            key: "user",
            header: <SortHeader label={t("admin.users.colUser")} sortKey="name" />,
            render: (user) => {
                const isInactive = user.is_active === 0;
                return (
                    <button
                        type="button"
                        onClick={() => setViewProfileUser(user)}
                        className="flex items-center gap-3 min-w-0 text-left group hover:opacity-85 transition-opacity"
                    >
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-on-brand-strong text-caption font-extrabold group-hover:ring-2 group-hover:ring-brand transition-all ${isInactive ? "bg-line-strong" : "bg-brand-strong"}`}
                        >
                            {getInitials(user.full_name, user.email)}
                        </div>
                        <div className="min-w-0">
                            <p className={`text-caption font-bold truncate leading-tight group-hover:text-brand-fg transition-colors ${isInactive ? "line-through text-fg-subtle" : "text-fg"}`}>
                                {user.full_name || <em>{t("admin.users.noName")}</em>}
                            </p>
                            <p className="text-caption truncate mt-0.5 text-fg-subtle">{shownEmail(user)}</p>
                            {user.learner_code && (
                                <p className="text-caption font-mono font-bold truncate mt-0.5 text-fg">
                                    <span className="sr-only">{t("school.learnerCode")}: </span>{user.learner_code}
                                </p>
                            )}
                        </div>
                    </button>
                );
            },
        },
        {
            key: "details",
            header: t("admin.users.colDetails"),
            hideOnMobile: true,
            render: (user) => (
                <div className="space-y-0.5">
                    {user.phone && (
                        <div className="flex items-center gap-1.5 text-caption text-fg-subtle">
                            <Phone className="w-3 h-3 shrink-0 text-fg-subtle" />
                            {user.phone}
                        </div>
                    )}
                    {user.school_name && (
                        <div className="flex items-center gap-1.5 text-caption text-fg-subtle">
                            <School className="w-3 h-3 shrink-0 text-fg-subtle" />
                            <span className="truncate max-w-[140px]">{user.school_name}</span>
                        </div>
                    )}
                    {user.grade_level && (
                        <span className="inline-block text-caption font-semibold px-2 py-0.5 rounded-full bg-surface-sunken text-fg-muted">
                            {user.grade_level}
                        </span>
                    )}
                    {!user.phone && !user.school_name && !user.grade_level && (
                        <span className="text-caption text-fg-subtle">—</span>
                    )}
                </div>
            ),
        },
        {
            key: "status",
            header: <SortHeader label={t("admin.courses.colStatus")} sortKey="status" />,
            render: (user) => {
                const isInactive = user.is_active === 0;
                return (
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-extrabold whitespace-nowrap ${
                        isInactive
                            ? "bg-surface-sunken text-fg-subtle border border-line"
                            : "bg-success-soft text-success-fg border border-success/30"
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isInactive ? "bg-line-strong" : "bg-success"}`} />
                        {isInactive ? t("admin.user.inactive") : t("admin.users.active")}
                    </span>
                );
            },
        },
        {
            key: "role",
            header: <SortHeader label={t("admin.users.colRole")} sortKey="role" />,
            render: (user) => {
                const RoleIcon = roleIcons[user.role] || User;
                return (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-bold whitespace-nowrap ${roleStyle[user.role] || roleStyle.teacher}`}>
                        <RoleIcon className="w-3 h-3" />
                        {t(`role.${user.role}`)}
                    </span>
                );
            },
        },
        {
            key: "joined",
            header: <SortHeader label={t("admin.users.colJoined")} sortKey="created_at" firstOrder="desc" />,
            hideOnMobile: true,
            render: (user) => (
                <span className="text-caption font-medium whitespace-nowrap text-fg-subtle">
                    {formatDate(user.created_at, lang) || "—"}
                </span>
            ),
        },
        {
            key: "actions",
            header: t("admin.users.colActions"),
            align: "right",
            render: (user) => {
                const isInactive = user.is_active === 0;
                return (
                    <div className="relative inline-block text-left">
                        <button
                            type="button"
                            aria-label={t("admin.users.userActions")}
                            onClick={() => setActiveMenuId(activeMenuId === user.id ? null : user.id)}
                            className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-subtle transition-colors"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {/* Kebab Dropdown Menu */}
                        {activeMenuId === user.id && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setActiveMenuId(null)} />
                                <div className="absolute right-0 mt-1 w-48 bg-surface-raised rounded-xl shadow-xl border border-line z-30 py-1 text-left animate-in fade-in zoom-in-95 duration-100">

                                    {/* View Profile */}
                                    <button
                                        type="button"
                                        onClick={() => { setActiveMenuId(null); startRouteLoading(); router.push(`/manage/admin/users/${user.id}`); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-caption font-semibold text-fg-muted hover:bg-surface-hover transition-colors"
                                    >
                                        <Eye className="w-3.5 h-3.5 text-brand-fg" /> {t("admin.users.viewDetails")}
                                    </button>

                                    {/* Edit */}
                                    <AddUserDrawer
                                        user={user}
                                        onSuccess={() => { setActiveMenuId(null); usersChanged(); }}
                                        trigger={
                                            <button className="w-full flex items-center gap-2 px-3 py-2 text-caption font-semibold text-fg-muted hover:bg-surface-hover transition-colors">
                                                <Pencil className="w-3.5 h-3.5 text-fg-subtle" /> {t("admin.users.editProfile")}
                                            </button>
                                        }
                                    />

                                    {/* Deactivate / Reactivate */}
                                    <button
                                        type="button"
                                        onClick={() => { setActiveMenuId(null); handleToggleStatus(user); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-caption font-semibold text-fg-muted hover:bg-surface-hover transition-colors"
                                    >
                                        {isInactive ? (
                                            <><UserCheck className="w-3.5 h-3.5 text-success-fg" /> {t("admin.users.reactivateUser")}</>
                                        ) : (
                                            <><UserX className="w-3.5 h-3.5 text-warning-fg" /> {t("admin.users.deactivateUser")}</>
                                        )}
                                    </button>

                                    {/* Reset Password */}
                                    <button
                                        type="button"
                                        onClick={() => { setActiveMenuId(null); setResetPassUser(user); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-caption font-semibold text-fg-muted hover:bg-surface-hover transition-colors border-t border-line"
                                    >
                                        <KeyRound className="w-3.5 h-3.5 text-warning-fg" />
                                        {t("admin.users.resetPassword")}
                                    </button>

                                    {/* Delete */}
                                    <button
                                        type="button"
                                        onClick={() => { setActiveMenuId(null); setDeleteModalUser(user); setTypedConfirmName(""); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-caption font-bold text-danger-fg hover:bg-danger-soft transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-danger-fg" />
                                        {t("admin.users.deleteUser")}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                );
            },
        },
    ];

    return (
        <div className="space-y-4">

            {/* ── Search & Filter Bar ── */}
            <div className="space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    
                    {/* Live Search */}
                    <TextInput aria-label={t("admin.users.searchLabel")}
                        placeholder={t("admin.users.searchPlaceholder")}
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                        icon={Search}
                        onClear={() => setSearchQuery("")}
                        clearLabel={t("admin.users.clearSearch")}
                        className="flex-1"
                    />

                    {/* Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Role */}
                        <div className="flex items-center gap-1.5">
                            <Filter className="w-3.5 h-3.5 text-fg-muted" aria-hidden="true" />
                            <Select
                                aria-label={t("admin.users.filterRole")} value={roleFilter}
                                onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                                size="sm" className="w-auto"
                                options={[
                                    { value: "all", label: t("admin.users.allRoles") },
                                    { value: "scholar", label: t("admin.users.roleScholar") },
                                    { value: "teacher", label: t("admin.users.roleTeacherMe") },
                                    { value: "admin", label: t("admin.users.roleAdmin") },
                                ]}
                            />
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-caption font-bold text-fg-muted" aria-hidden="true">{t("admin.users.statusLabel")}</span>
                            <Select
                                aria-label={t("admin.users.filterStatus")} value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                size="sm" className="w-auto"
                                options={[
                                    { value: "all", label: t("admin.users.allStatus") },
                                    { value: "active", label: t("admin.users.activeOnly") },
                                    { value: "inactive", label: t("admin.users.inactiveOnly") },
                                ]}
                            />
                        </div>

                        {/* Joined Date */}
                        <Select
                            aria-label={t("admin.users.filterDate")} value={dateFilter}
                            onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
                            size="sm" className="w-auto"
                            options={[
                                { value: "all", label: t("admin.users.allTime") },
                                { value: "7days", label: t("admin.users.last7") },
                                { value: "30days", label: t("admin.users.last30") },
                            ]}
                        />
                    </div>
                </div>

                {/* Active Filter Chips */}
                {hasActiveFilters && (
                    <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-line">
                        <span className="text-caption font-bold text-fg-muted">{t("admin.users.activeFilters")}</span>
                        {searchQuery && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-bold bg-brand-soft text-brand-fg border border-brand/40">
                                {t("admin.users.searchChip")} &quot;{searchQuery}&quot;
                                <X className="w-3 h-3 cursor-pointer hover:text-brand-fg" onClick={() => setSearchQuery("")} />
                            </span>
                        )}
                        {roleFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-bold bg-info-soft text-info-fg border border-info/30">
                                {t("admin.users.roleChip")} {t(`role.${roleFilter}`) || roleFilter}
                                <X className="w-3 h-3 cursor-pointer hover:text-info-fg" onClick={() => setRoleFilter("all")} />
                            </span>
                        )}
                        {statusFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-bold bg-warning-soft text-warning-fg border border-warning/30">
                                {t("admin.users.statusLabel")} {statusFilter === "active" ? t("admin.users.active") : statusFilter === "inactive" ? t("admin.user.inactive") : statusFilter}
                                <X className="w-3 h-3 cursor-pointer hover:text-warning-fg" onClick={() => setStatusFilter("all")} />
                            </span>
                        )}
                        {dateFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-bold bg-info-soft text-info-fg border border-info/30">
                                {t("admin.users.dateChip")} {dateFilter === "7days" ? t("admin.users.last7") : dateFilter === "30days" ? t("admin.users.last30") : dateFilter}
                                <X className="w-3 h-3 cursor-pointer hover:text-info-fg" onClick={() => setDateFilter("all")} />
                            </span>
                        )}
                        <button
                            onClick={clearFilters}
                            className="text-caption font-extrabold text-danger-fg hover:underline ml-auto"
                        >
                            {t("admin.users.clearAll")}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Bulk Actions Toolbar (Visible when rows selected) ── */}
            {selectedRows.size > 0 && (
                <div className="dark bg-surface-raised text-fg p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                        <span className="text-caption font-extrabold bg-brand/20 text-brand-fg border border-brand/30 px-3 py-1 rounded-lg">
                            {fill(t("admin.users.selectedCount"), { count: selectedRows.size })}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setBulkRoleModal(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-line hover:bg-line-strong text-caption font-bold transition-colors"
                        >
                            {t("admin.users.changeRole")}
                        </button>
                        <button
                            onClick={() => handleBulkAction("bulk_deactivate")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-warning/20 text-warning-fg border border-warning/30 hover:bg-warning/30 text-caption font-bold transition-colors"
                        >
                            <UserX className="w-3.5 h-3.5" /> {t("admin.users.deactivate")}
                        </button>
                        <button
                            onClick={() => handleBulkAction("bulk_reactivate")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-success/20 text-success-fg border border-success/30 hover:bg-success/30 text-caption font-bold transition-colors"
                        >
                            <UserCheck className="w-3.5 h-3.5" /> {t("admin.users.reactivate")}
                        </button>
                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand/20 text-brand-fg border border-brand/30 hover:bg-brand/30 text-caption font-bold transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" /> {t("admin.users.exportCsv")}
                        </button>
                        <button
                            onClick={() => {
                                if (confirm(fill(t("admin.users.confirmBulkDelete"), { count: selectedRows.size }))) {
                                    handleBulkAction("bulk_delete");
                                }
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-danger/20 text-danger-fg border border-danger/30 hover:bg-danger/30 text-caption font-bold transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> {t("admin.users.bulkDelete")}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main Users Table ── */}
            <DataTable
                caption={t("AdminTable.tableTitle")}
                columns={columns}
                rows={loading ? [] : users}
                rowClassName={(u) => (u.is_active === 0 ? "opacity-60 bg-surface-sunken/50" : "")}
                empty={loading ? (
                    <Loader variant="page" size={56} className="min-h-[30vh]" label={t("admin.users.loading")} />
                ) : (
                    <div className="flex flex-col items-center gap-2 py-6">
                        <Users2 className="w-9 h-9 text-fg-subtle" />
                        <p className="text-ui font-bold text-fg">{t("admin.users.noMatch")}</p>
                        <p className="text-caption text-fg-subtle">{t("admin.users.noMatchHelp")}</p>
                        {hasActiveFilters && (
                            <button
                                onClick={clearFilters}
                                className="mt-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-on-brand text-caption font-bold transition-colors"
                            >
                                {t("admin.users.clearFilters")}
                            </button>
                        )}
                    </div>
                )}
            />

            {/* ── Pagination Footer ── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
                <p className="text-caption font-semibold text-fg-subtle">
                    {String(t("admin.users.showing")).split(/(\{shown\}|\{total\})/).map((part, i) =>
                        part === "{shown}" ? <span key={i} className="font-bold text-fg">{users.length}</span>
                        : part === "{total}" ? <span key={i} className="font-bold text-fg">{total}</span>
                        : part)}
                </p>

                <div className="flex items-center gap-2">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-xl border border-line-strong text-caption font-bold text-fg-muted disabled:opacity-40 hover:bg-surface-hover transition-colors flex items-center gap-1"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" /> {t("admin.users.previous")}
                    </button>

                    <span className="text-caption font-extrabold px-3 py-1 rounded-xl bg-surface-sunken text-fg">
                        {fill(t("admin.users.pageOf"), { page, total: totalPages })}
                    </span>

                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1.5 rounded-xl border border-line-strong text-caption font-bold text-fg-muted disabled:opacity-40 hover:bg-surface-hover transition-colors flex items-center gap-1"
                    >
                        {t("admin.users.next")} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ── Typed Delete Confirmation Modal ── */}
            {deleteModalUser && (
                <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-scrim backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-surface-raised border-2 border-danger/30 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center gap-3 text-danger-fg">
                            <div className="w-10 h-10 rounded-xl bg-danger-soft flex items-center justify-center shrink-0">
                                <ShieldAlert size={20} />
                            </div>
                            <div>
                                <h3 className="text-item font-extrabold text-fg">{t("admin.users.deleteTitle")}</h3>
                                <p className="text-caption text-danger-fg font-semibold">{t("admin.users.irreversible")}</p>
                            </div>
                        </div>

                        <div className="bg-danger-soft border border-danger/30 rounded-xl p-3.5 text-caption text-danger-fg leading-relaxed">
                            <strong>{t("admin.users.warning")}</strong> {t("admin.users.warnBefore")} <strong>({shownEmail(deleteModalUser)})</strong> {t("admin.users.warnAfter")}
                        </div>

                        <Field label={<>{t("admin.users.typeBefore")} <span className="font-mono text-danger-fg font-extrabold">{deleteModalUser.full_name || deleteModalUser.email}</span> {t("admin.users.typeAfter")}</>}>
                            <TextInput aria-label={t("admin.users.typeToConfirm")}
                                placeholder={t("admin.users.typePlaceholder")}
                                value={typedConfirmName}
                                onChange={(e) => setTypedConfirmName(e.target.value)}
                            />
                        </Field>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setDeleteModalUser(null)}
                                className="px-4 h-9 rounded-xl bg-surface-sunken hover:bg-surface-hover text-caption font-bold text-fg-muted transition-colors"
                            >
                                {t("admin.common.cancel")}
                            </button>
                            <button
                                disabled={!deleteConfirmed}
                                onClick={handleConfirmDelete}
                                className="px-5 h-9 rounded-xl bg-danger hover:bg-danger/90 disabled:opacity-40 text-on-danger text-caption font-extrabold shadow-md transition-colors"
                            >
                                {t("admin.users.deletePermanently")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Admin Reset Password Modal ── */}
            {resetPassUser && (
                <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-scrim backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-surface-raised border-2 border-line-strong rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <KeyRound className="w-5 h-5 text-warning-fg" />
                                <h3 className="text-ui font-extrabold text-fg">{t("admin.users.resetTitle")}</h3>
                            </div>
                            <button aria-label={t("admin.library.close")} onClick={() => setResetPassUser(null)} className="text-fg-muted hover:text-fg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-caption text-fg-subtle">
                            {t("admin.users.settingFor")} <span className="font-bold text-fg">{shownEmail(resetPassUser)}</span>.
                        </p>

                        <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                            <Field label={t("admin.users.newPassword")}>
                                <PasswordInput
                                    placeholder={t("admin.users.newPasswordPlaceholder")}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    autoComplete="new-password"
                                    required
                                />
                            </Field>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setResetPassUser(null)}
                                    className="px-4 h-9 rounded-xl bg-surface-sunken hover:bg-surface-hover text-caption font-bold text-fg-muted transition-colors"
                                >
                                    {t("admin.common.cancel")}
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 h-9 rounded-xl bg-warning hover:bg-warning/90 text-on-warning text-caption font-extrabold shadow-md transition-colors"
                                >
                                    {t("admin.users.saveNewPassword")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Bulk Role Change Modal ── */}
            {bulkRoleModal && (
                <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-scrim backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-surface-raised border-2 border-line-strong rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                        <h3 className="text-ui font-extrabold text-fg">{t("admin.users.bulkRoleTitle")}</h3>
                        <p className="text-caption text-fg-subtle">
                            {t("admin.users.assignBefore")} <span className="font-bold text-fg">{selectedRows.size}</span> {t("admin.users.assignAfter")}
                        </p>

                        <Select
                            aria-label={t("admin.users.newRoleLabel")} value={selectedBulkRole}
                            onChange={(e) => setSelectedBulkRole(e.target.value)}
                            options={[
                                { value: "scholar", label: t("admin.users.roleScholar") },
                                { value: "teacher", label: t("admin.users.roleTeacherMeOfficer") },
                                { value: "admin", label: t("admin.users.roleAdmin") },
                            ]}
                        />

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setBulkRoleModal(false)}
                                className="px-4 h-9 rounded-xl bg-surface-sunken text-caption font-bold text-fg-muted"
                            >
                                {t("admin.common.cancel")}
                            </button>
                            <button
                                onClick={() => handleBulkAction("bulk_role", { newRole: selectedBulkRole })}
                                className="px-5 h-9 rounded-xl bg-brand text-on-brand text-caption font-extrabold"
                            >
                                {t("admin.users.assignRole")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── View User Profile Modal ── */}
            <UserProfileModal
                user={viewProfileUser}
                isOpen={!!viewProfileUser}
                onClose={() => setViewProfileUser(null)}
            />
        </div>
    );
}

