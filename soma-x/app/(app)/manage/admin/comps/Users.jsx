"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AddUserDrawer } from "@/components/AddUserDrawer";
import UserProfileModal from "@/components/manage/UserProfileModal";
import { useLanguage } from "@/context/LanguageContext";
import DataContext from "@/context/DataContext";
import { useToast } from "@/context/ToastContext";
import {
    ArrowUpDown, CheckSquare, ChevronLeft, ChevronRight, Download, Eye, Filter,
    GraduationCap, KeyRound, MoreVertical, Pencil, Phone, RefreshCw, School, Search,
    ShieldAlert, ShieldCheck, Square, Trash2, User, UserCheck, Users2, UserX, X
} from "lucide-react";

function getInitials(name, email) {
    if (name?.trim()) return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (email?.[0] || "?").toUpperCase();
}

function formatDate(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Users() {
    const { t } = useLanguage();
    const { isDark, SERVER_URL, unshiftString } = useContext(DataContext);
    const { showToast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();

    const dm = isDark;

    // Filter & Search State initialized from URL query params
    const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
    const [roleFilter, setRoleFilter]   = useState(searchParams.get("role") || "all");
    const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
    const [dateFilter, setDateFilter]   = useState(searchParams.get("dateRange") || "all");
    const [sortBy, setSortBy]           = useState(searchParams.get("sortBy") || "created_at");
    const [sortOrder, setSortOrder]     = useState(searchParams.get("sortOrder") || "desc");
    const [page, setPage]               = useState(parseInt(searchParams.get("page") || "1", 10));

    // User Data & Selection State
    const [users, setUsers]             = useState([]);
    const [total, setTotal]             = useState(0);
    const [totalPages, setTotalPages]   = useState(1);
    const [loading, setLoading]         = useState(true);
    const [selectedRows, setSelectedRows] = useState(new Set());

    // Modals
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [viewProfileUser, setViewProfileUser] = useState(null);
    const [deleteModalUser, setDeleteModalUser] = useState(null);
    const [typedConfirmName, setTypedConfirmName] = useState("");
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

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                search: searchQuery,
                role: roleFilter,
                status: statusFilter,
                dateRange: dateFilter,
                sortBy,
                sortOrder,
                page: page.toString(),
                limit: "10"
            });

            const res = await fetch(`${SERVER_URL}/users?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to load users");

            setUsers(data.users || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
        } catch (err) {
            console.error("Error fetching users:", err);
            showToast("Failed to load users list", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [searchQuery, roleFilter, statusFilter, dateFilter, sortBy, sortOrder, page, SERVER_URL]);

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

    // Admin Session Email helper for Audit Logs
    const getAdminEmail = () => {
        const stored = localStorage.getItem("al");
        return stored ? unshiftString(stored) : "admin@mail.com";
    };

    // User Lifecycle Handlers
    const handleToggleStatus = async (user) => {
        const newStatus = user.is_active === 0;
        try {
            const res = await fetch(`${SERVER_URL}/users/${user.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: newStatus, adminEmail: getAdminEmail() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to update status");

            showToast(`User ${user.full_name || user.email} ${newStatus ? "reactivated" : "deactivated"} successfully`, "success");
            fetchUsers();
        } catch (err) {
            showToast(err.message, "error");
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteModalUser) return;
        try {
            const res = await fetch(`${SERVER_URL}/users/${deleteModalUser.id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adminEmail: getAdminEmail() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to delete user");

            showToast("User permanently deleted", "success");
            setDeleteModalUser(null);
            setTypedConfirmName("");
            fetchUsers();
        } catch (err) {
            showToast(err.message, "error");
        }
    };

    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        if (!resetPassUser || newPassword.length < 6) {
            showToast("Password must be at least 6 characters", "error");
            return;
        }
        try {
            const res = await fetch(`${SERVER_URL}/users/${resetPassUser.id}/reset-password`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newPassword, adminEmail: getAdminEmail() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Failed to reset password");

            showToast("Password reset successfully!", "success");
            setResetPassUser(null);
            setNewPassword("");
        } catch (err) {
            showToast(err.message, "error");
        }
    };

    // Bulk Handlers
    const handleBulkAction = async (action, extraData = {}) => {
        const ids = Array.from(selectedRows);
        if (ids.length === 0) return;
        try {
            const res = await fetch(`${SERVER_URL}/users/bulk-action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userIds: ids,
                    action,
                    adminEmail: getAdminEmail(),
                    ...extraData
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Bulk action failed");

            showToast(data.message || "Bulk action executed successfully", "success");
            setSelectedRows(new Set());
            setBulkRoleModal(false);
            fetchUsers();
        } catch (err) {
            showToast(err.message, "error");
        }
    };

    const handleExportCSV = () => {
        const selectedUsersList = users.filter(u => selectedRows.has(u.id));
        const listToExport = selectedUsersList.length > 0 ? selectedUsersList : users;

        const headers = ["ID", "Full Name", "Email", "Role", "Status", "Phone", "School", "Grade", "Joined Date"];
        const rows = listToExport.map(u => [
            u.id,
            `"${u.full_name || ''}"`,
            `"${u.email || ''}"`,
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
        showToast("Exported CSV file successfully", "success");
    };

    /* ── Design tokens ── */
    const avatarBg      = dm ? "#0D9488" : "#203B3B";
    const theadBg       = dm ? "rgba(255,255,255,0.04)" : "#f8fafc";
    const thColor       = dm ? "#7A8595" : "#64748b";
    const rowHover      = dm ? "rgba(255,255,255,0.03)" : "#f8fafc";
    const rowDivider    = dm ? "rgba(255,255,255,0.06)" : "#f1f5f9";
    const textPrimary   = dm ? "#E8ECF0" : "#0f172a";
    const textSecondary = dm ? "#8B929E" : "#64748b";
    const textMuted     = dm ? "#637080" : "#94a3b8";
    const detailIcon    = dm ? "#4A5567" : "#94a3b8";

    const roleDark = {
        admin:   { bg: "rgba(168,85,247,0.15)",  text: "#c084fc",  border: "rgba(168,85,247,0.25)" },
        teacher: { bg: "rgba(52,211,153,0.12)",  text: "#6ee7b7",  border: "rgba(52,211,153,0.2)"  },
        scholar: { bg: "rgba(56,189,248,0.12)",  text: "#7dd3fc",  border: "rgba(56,189,248,0.2)"  },
    };
    const roleLight = {
        admin:   { bg: "#f3e8ff", text: "#9333ea", border: "transparent" },
        teacher: { bg: "#d1fae5", text: "#059669", border: "transparent" },
        scholar: { bg: "#e0f2fe", text: "#0284c7", border: "transparent" },
    };
    const roleIcons = { admin: ShieldCheck, teacher: User, scholar: GraduationCap };

    return (
        <div className="space-y-4">

            {/* ── Search & Filter Bar ── */}
            <div className="bg-white dark:bg-[#0E1117] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    
                    {/* Live Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search by full name or email address..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                            className="w-full h-10 pl-10 pr-9 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-500 outline-none focus:border-accent-dark transition-colors"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-600">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Filter Dropdowns */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Role */}
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-2.5 h-10">
                            <Filter className="w-3.5 h-3.5 text-slate-600" />
                            <select
                                value={roleFilter}
                                onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
                                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                <option value="all">All Roles</option>
                                <option value="scholar">Scholar (Student)</option>
                                <option value="teacher">Teacher / M&E</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-2.5 h-10">
                            <span className="text-[11px] font-bold text-slate-600 uppercase">Status:</span>
                            <select
                                value={statusFilter}
                                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                <option value="all">All Status</option>
                                <option value="active">Active Only</option>
                                <option value="inactive">Inactive Only</option>
                            </select>
                        </div>

                        {/* Joined Date */}
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-xl px-2.5 h-10">
                            <select
                                value={dateFilter}
                                onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
                                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                            >
                                <option value="all">All Time</option>
                                <option value="7days">Joined Last 7 Days</option>
                                <option value="30days">Joined Last 30 Days</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Active Filter Chips */}
                {hasActiveFilters && (
                    <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Active Filters:</span>
                        {searchQuery && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                Search: &quot;{searchQuery}&quot;
                                <X className="w-3 h-3 cursor-pointer hover:text-teal-900" onClick={() => setSearchQuery("")} />
                            </span>
                        )}
                        {roleFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Role: {roleFilter}
                                <X className="w-3 h-3 cursor-pointer hover:text-indigo-900" onClick={() => setRoleFilter("all")} />
                            </span>
                        )}
                        {statusFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Status: {statusFilter}
                                <X className="w-3 h-3 cursor-pointer hover:text-amber-900" onClick={() => setStatusFilter("all")} />
                            </span>
                        )}
                        {dateFilter !== "all" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                Date: {dateFilter}
                                <X className="w-3 h-3 cursor-pointer hover:text-sky-900" onClick={() => setDateFilter("all")} />
                            </span>
                        )}
                        <button
                            onClick={clearFilters}
                            className="text-[11px] font-extrabold text-rose-600 hover:underline ml-auto"
                        >
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>

            {/* ── Bulk Actions Toolbar (Visible when rows selected) ── */}
            {selectedRows.size > 0 && (
                <div className="bg-slate-900 text-white p-3.5 rounded-xl flex items-center justify-between shadow-xl animate-in fade-in duration-200">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-black bg-teal-500/20 text-teal-300 border border-teal-500/30 px-3 py-1 rounded-lg">
                            {selectedRows.size} user(s) selected
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setBulkRoleModal(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold transition-colors"
                        >
                            Change Role
                        </button>
                        <button
                            onClick={() => handleBulkAction("bulk_deactivate")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-bold transition-colors"
                        >
                            <UserX className="w-3.5 h-3.5" /> Deactivate
                        </button>
                        <button
                            onClick={() => handleBulkAction("bulk_reactivate")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs font-bold transition-colors"
                        >
                            <UserCheck className="w-3.5 h-3.5" /> Reactivate
                        </button>
                        <button
                            onClick={handleExportCSV}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 hover:bg-teal-500/30 text-xs font-bold transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" /> Export CSV
                        </button>
                        <button
                            onClick={() => {
                                if (confirm(`Are you sure you want to permanently delete ${selectedRows.size} user(s)? This action cannot be undone.`)) {
                                    handleBulkAction("bulk_delete");
                                }
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-bold transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Bulk Delete
                        </button>
                    </div>
                </div>
            )}

            {/* ── Main Users Table ── */}
            <div className="w-full overflow-x-auto bg-white dark:bg-[#0E1117] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                        <tr style={{ backgroundColor: theadBg }}>
                            <th className="py-3.5 px-4 w-10">
                                <button onClick={toggleSelectAll} className="text-slate-600 hover:text-slate-600">
                                    {selectedRows.size === users.length && users.length > 0 ? (
                                        <CheckSquare className="w-4 h-4 text-teal-600" />
                                    ) : (
                                        <Square className="w-4 h-4" />
                                    )}
                                </button>
                            </th>
                            <th
                                className="py-3.5 px-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none"
                                style={{ color: thColor }}
                                onClick={() => {
                                    if (sortBy === "name") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                                    else { setSortBy("name"); setSortOrder("asc"); }
                                }}
                            >
                                <div className="flex items-center gap-1">
                                    User
                                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                                </div>
                            </th>
                            <th className="py-3.5 px-4 text-[10px] font-bold uppercase tracking-widest" style={{ color: thColor }}>Details</th>
                            <th
                                className="py-3.5 px-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none"
                                style={{ color: thColor }}
                                onClick={() => {
                                    if (sortBy === "status") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                                    else { setSortBy("status"); setSortOrder("asc"); }
                                }}
                            >
                                <div className="flex items-center gap-1">
                                    Status
                                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                                </div>
                            </th>
                            <th
                                className="py-3.5 px-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none"
                                style={{ color: thColor }}
                                onClick={() => {
                                    if (sortBy === "role") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                                    else { setSortBy("role"); setSortOrder("asc"); }
                                }}
                            >
                                <div className="flex items-center gap-1">
                                    Role
                                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                                </div>
                            </th>
                            <th
                                className="py-3.5 px-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none"
                                style={{ color: thColor }}
                                onClick={() => {
                                    if (sortBy === "created_at") setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                                    else { setSortBy("created_at"); setSortOrder("desc"); }
                                }}
                            >
                                <div className="flex items-center gap-1">
                                    Joined
                                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                                </div>
                            </th>
                            <th className="py-3.5 px-4 text-[10px] font-bold uppercase tracking-widest text-right" style={{ color: thColor }}>Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i} style={{ borderTop: `1px solid ${rowDivider}` }}>
                                    <td className="py-4 px-4" colSpan={7}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full animate-pulse shrink-0 bg-slate-200 dark:bg-slate-800" />
                                            <div className="space-y-1.5 flex-1">
                                                <div className="h-3 rounded animate-pulse w-36 bg-slate-200 dark:bg-slate-800" />
                                                <div className="h-2.5 rounded animate-pulse w-48 bg-slate-100 dark:bg-slate-900" />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-12 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <Users2 className="w-9 h-9 text-slate-500 dark:text-slate-700" />
                                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No users match your filters</p>
                                        <p className="text-xs text-slate-500">Try adjusting or clearing your active search filters.</p>
                                        {hasActiveFilters && (
                                            <button
                                                onClick={clearFilters}
                                                className="mt-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors"
                                            >
                                                Clear filters
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => {
                                const isInactive = user.is_active === 0;
                                const isSelected = selectedRows.has(user.id);
                                const roleCfg    = (dm ? roleDark : roleLight)[user.role] || (dm ? roleDark : roleLight).teacher;
                                const RoleIcon   = roleIcons[user.role] || User;
                                const initials   = getInitials(user.full_name, user.email);
                                const joined     = formatDate(user.created_at);

                                return (
                                    <tr
                                        key={user.id}
                                        className={`transition-colors ${isInactive ? "opacity-60 bg-slate-50/50 dark:bg-slate-900/30" : ""}`}
                                        style={{ borderTop: `1px solid ${rowDivider}` }}
                                    >
                                        {/* Checkbox */}
                                        <td className="py-3.5 px-4">
                                            <button onClick={() => toggleSelectRow(user.id)} className="text-slate-600 hover:text-slate-600">
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-teal-600" />
                                                ) : (
                                                    <Square className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>

                                        {/* User */}
                                        <td className="py-3.5 px-4">
                                            <button
                                                type="button"
                                                onClick={() => setViewProfileUser(user)}
                                                className="flex items-center gap-3 min-w-0 text-left group hover:opacity-85 transition-opacity"
                                            >
                                                <div
                                                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-black shadow-sm group-hover:ring-2 group-hover:ring-teal-500 transition-all"
                                                    style={{ backgroundColor: isInactive ? "#94a3b8" : avatarBg }}
                                                >
                                                    {initials}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className={`text-[12px] font-bold truncate leading-tight group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors ${isInactive ? "line-through text-slate-500" : ""}`} style={{ color: isInactive ? textMuted : textPrimary }}>
                                                        {user.full_name || <em>No name</em>}
                                                    </p>
                                                    <p className="text-[11px] truncate mt-0.5" style={{ color: textSecondary }}>{user.email}</p>
                                                </div>
                                            </button>
                                        </td>

                                        {/* Details */}
                                        <td className="py-3.5 px-4">
                                            <div className="space-y-0.5">
                                                {user.phone && (
                                                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: textSecondary }}>
                                                        <Phone className="w-3 h-3 shrink-0" style={{ color: detailIcon }} />
                                                        {user.phone}
                                                    </div>
                                                )}
                                                {user.school_name && (
                                                    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: textSecondary }}>
                                                        <School className="w-3 h-3 shrink-0" style={{ color: detailIcon }} />
                                                        <span className="truncate max-w-[140px]">{user.school_name}</span>
                                                    </div>
                                                )}
                                                {user.grade_level && (
                                                    <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                                        {user.grade_level}
                                                    </span>
                                                )}
                                                {!user.phone && !user.school_name && !user.grade_level && (
                                                    <span style={{ color: textMuted }} className="text-[11px]">—</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="py-3.5 px-4">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                                isInactive 
                                                    ? "bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400" 
                                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                                            }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${isInactive ? "bg-slate-400" : "bg-emerald-500"}`} />
                                                {isInactive ? "Inactive" : "Active"}
                                            </span>
                                        </td>

                                        {/* Role */}
                                        <td className="py-3.5 px-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                                                style={{ backgroundColor: roleCfg.bg, color: roleCfg.text, border: `1px solid ${roleCfg.border}` }}>
                                                <RoleIcon className="w-3 h-3" />
                                                {t(`role.${user.role}`)}
                                            </span>
                                        </td>

                                        {/* Joined */}
                                        <td className="py-3.5 px-4">
                                            <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: textSecondary }}>
                                                {joined || "—"}
                                            </span>
                                        </td>

                                        {/* Actions Kebab Menu */}
                                        <td className="py-3.5 px-4 text-right relative">
                                            <div className="relative inline-block text-left">
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveMenuId(activeMenuId === user.id ? null : user.id)}
                                                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>

                                                {/* Kebab Dropdown Menu */}
                                                {activeMenuId === user.id && (
                                                    <>
                                                        <div className="fixed inset-0 z-20" onClick={() => setActiveMenuId(null)} />
                                                        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 z-30 py-1 text-left animate-in fade-in zoom-in-95 duration-100">
                                                            
                                                            {/* View Profile */}
                                                            <button
                                                                type="button"
                                                                onClick={() => { setActiveMenuId(null); router.push(`/manage/admin/users/${user.id}`); }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> View Full Details
                                                            </button>

                                                            {/* Edit */}
                                                            <AddUserDrawer
                                                                user={user}
                                                                onSuccess={() => { setActiveMenuId(null); fetchUsers(); }}
                                                                trigger={
                                                                    <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                                        <Pencil className="w-3.5 h-3.5 text-slate-500" /> Edit Profile
                                                                    </button>
                                                                }
                                                            />

                                                            {/* Deactivate / Reactivate */}
                                                            <button
                                                                type="button"
                                                                onClick={() => { setActiveMenuId(null); handleToggleStatus(user); }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                                            >
                                                                {isInactive ? (
                                                                    <><UserCheck className="w-3.5 h-3.5 text-emerald-500" /> Reactivate User</>
                                                                ) : (
                                                                    <><UserX className="w-3.5 h-3.5 text-amber-500" /> Deactivate User</>
                                                                )}
                                                            </button>

                                                            {/* Reset Password */}
                                                            <button
                                                                type="button"
                                                                onClick={() => { setActiveMenuId(null); setResetPassUser(user); }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800"
                                                            >
                                                                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                                                                Reset Password
                                                            </button>

                                                            {/* Delete */}
                                                            <button
                                                                type="button"
                                                                onClick={() => { setActiveMenuId(null); setDeleteModalUser(user); setTypedConfirmName(""); }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                                                Delete User
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Pagination Footer ── */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
                <p className="text-xs font-semibold text-slate-500">
                    Showing <span className="font-bold text-slate-800 dark:text-white">{users.length}</span> of <span className="font-bold text-slate-800 dark:text-white">{total}</span> users
                </p>

                <div className="flex items-center gap-2">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 transition-colors flex items-center gap-1"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>

                    <span className="text-xs font-extrabold px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                        Page {page} of {totalPages}
                    </span>

                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 hover:bg-slate-100 transition-colors flex items-center gap-1"
                    >
                        Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ── Typed Delete Confirmation Modal ── */}
            {deleteModalUser && (
                <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 border-2 border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center gap-3 text-rose-600">
                            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                                <ShieldAlert size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Delete User Account</h3>
                                <p className="text-[11px] text-rose-600 font-semibold">Irreversible Hard Delete</p>
                            </div>
                        </div>

                        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3.5 text-xs text-rose-800 dark:text-rose-200 leading-relaxed">
                            <strong>Warning:</strong> Permanently removes the user <strong>({deleteModalUser.email})</strong> and all associated data. Cannot be undone.
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Type <span className="font-mono text-rose-600 font-extrabold">{deleteModalUser.full_name || deleteModalUser.email}</span> to confirm:
                            </label>
                            <input
                                type="text"
                                placeholder="Type name or email to confirm..."
                                value={typedConfirmName}
                                onChange={(e) => setTypedConfirmName(e.target.value)}
                                className="w-full h-10 px-3 rounded-xl border-2 border-rose-300 dark:border-rose-800 text-xs font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-900 outline-none focus:border-rose-600"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setDeleteModalUser(null)}
                                className="px-4 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                disabled={typedConfirmName.trim() !== (deleteModalUser.full_name || deleteModalUser.email).trim()}
                                onClick={handleConfirmDelete}
                                className="px-5 h-9 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-extrabold shadow-md transition-colors"
                            >
                                Delete User Permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Admin Reset Password Modal ── */}
            {resetPassUser && (
                <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <KeyRound className="w-5 h-5 text-amber-500" />
                                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Reset User Password</h3>
                            </div>
                            <button onClick={() => setResetPassUser(null)} className="text-slate-600 hover:text-slate-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-500">
                            Setting a new password for <span className="font-bold text-slate-800 dark:text-white">{resetPassUser.email}</span>.
                        </p>

                        <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">New Password (min 6 characters)</label>
                                <input
                                    type="password"
                                    placeholder="Enter new password..."
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-900 outline-none focus:border-accent-dark"
                                    required
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setResetPassUser(null)}
                                    className="px-4 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 h-9 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-md transition-colors"
                                >
                                    Save New Password
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Bulk Role Change Modal ── */}
            {bulkRoleModal && (
                <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Bulk Role Assignment</h3>
                        <p className="text-xs text-slate-500">
                            Assign new role to <span className="font-bold text-slate-800 dark:text-white">{selectedRows.size}</span> selected users:
                        </p>

                        <select
                            value={selectedBulkRole}
                            onChange={(e) => setSelectedBulkRole(e.target.value)}
                            className="w-full h-10 px-3 rounded-xl border-2 border-slate-300 text-xs font-semibold text-slate-900 bg-white outline-none"
                        >
                            <option value="scholar">Scholar (Student)</option>
                            <option value="teacher">Teacher / M&E Officer</option>
                            <option value="admin">Administrator</option>
                        </select>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => setBulkRoleModal(false)}
                                className="px-4 h-9 rounded-xl bg-slate-100 text-xs font-bold text-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleBulkAction("bulk_role", { newRole: selectedBulkRole })}
                                className="px-5 h-9 rounded-xl bg-teal-600 text-white text-xs font-extrabold"
                            >
                                Assign Role
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

