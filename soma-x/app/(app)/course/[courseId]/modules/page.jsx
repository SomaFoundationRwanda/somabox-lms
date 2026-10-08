"use client";

import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Plus, Sparkles } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, EmptyState } from "@/components/layout";
import Explainer, { ExplainerText } from "@/components/help/Explainer";
import WhatShouldICreate from "@/components/help/WhatShouldICreate";
import { useLanguage } from "@/context/LanguageContext";
import { useCourseText } from "@/components/course/useCourseText";
import InfoTooltip from "@/components/ui/InfoTooltip";
import ModuleCard from "@/components/course/modules/ModuleCard";
import DeleteItemDialog from "@/components/course/modules/DeleteItemDialog";
import useAiStatus from "@/lib/useAiStatus";
import { AiStatusNote } from "@/components/ai/AiBits";
import Loader from "@/components/ui/Loader";

// Teacher-only code is loaded on demand so learners on low-end devices don't download it:
// the editor modals (TipTap etc.) when one is opened, and drag-and-drop for teachers.
const PageEditorModal = dynamic(() => import("@/components/course/modules/editors/PageEditorModal"), { ssr: false });
const AssignmentEditorModal = dynamic(() => import("@/components/course/modules/editors/AssignmentEditorModal"), { ssr: false });
const QuizEditorModal = dynamic(() => import("@/components/course/modules/editors/QuizEditorModal"), { ssr: false });
const FileUploadModal = dynamic(() => import("@/components/course/modules/editors/FileUploadModal"), { ssr: false });
const SortableModuleList = lazy(() => import("@/components/course/modules/sortable").then((m) => ({ default: m.SortableModuleList })));

// Labels come from course.items.<value>.
const ITEM_TYPE_OPTIONS = [
  { value: "page" },
  { value: "assignment" },
  { value: "quiz" },
  { value: "file" },
  { value: "sub_header" },
  { value: "discussion" },
];

// A module item's day offsets, for the editor modals.
const itemDays = (item) => ({ release_day: item.release_day, due_day: item.due_day, close_day: item.close_day });

export default function ModulesPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: modules, loading, error, refetch } = useCourseSection("modules");
  const { showToast } = useToast();
  const aiStatus = useAiStatus();
  const { t, tf } = useCourseText();

  // AI: pending drafts and running jobs, for the header link and per-week buttons.
  const [aiActiveJobs, setAiActiveJobs] = useState([]);
  const [aiPendingCount, setAiPendingCount] = useState(0);
  const loadAiSummary = useCallback(async () => {
    if (!SERVER_URL || !courseId || !isTeacher) return;
    try {
      const [jobsRes, draftsRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/ai/jobs?active=1`),
        fetch(`${SERVER_URL}/courses/${courseId}/ai/drafts?status=pending`),
      ]);
      if (jobsRes.ok) setAiActiveJobs(await jobsRes.json().catch(() => []));
      if (draftsRes.ok) {
        const drafts = await draftsRes.json().catch(() => []);
        setAiPendingCount(Array.isArray(drafts) ? drafts.length : 0);
      }
    } catch {
      /* the link still works without counts */
    }
  }, [SERVER_URL, courseId, isTeacher]);
  useEffect(() => { loadAiSummary(); }, [loadAiSummary]);
  // While jobs run, refresh every few seconds so the counts and buttons stay current.
  useEffect(() => {
    if (aiActiveJobs.length === 0) return undefined;
    const t = setTimeout(loadAiSummary, 5000);
    return () => clearTimeout(t);
  }, [aiActiveJobs, loadAiSummary]);
  const aiProps = { status: aiStatus, activeJobs: aiActiveJobs, onStarted: (job) => { setAiActiveJobs((list) => [...list, job]); } };

  // Reads a JSON response; on failure shows the server message and throws so
  // editor modals stay open. On success, surfaces any `notice` (e.g. a graded
  // item saved unpublished because it has no outcome tag).
  const handleResponse = async (res, fallbackError) => {
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = payload?.message || fallbackError;
      showToast(message, "error");
      throw new Error(message);
    }
    if (payload?.notice) showToast(payload.notice, "info", 7000);
    return payload;
  };

  // Module creation
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // Add item flow
  const [addingItemFor, setAddingItemFor] = useState(null); // module object
  const [selectedItemType, setSelectedItemType] = useState("page");
  const [helperOpen, setHelperOpen] = useState(false);
  const { explain } = useLanguage();
  const [subHeaderTitle, setSubHeaderTitle] = useState("");

  // Editor modals
  const [pageModal, setPageModal] = useState({ open: false, moduleId: null, data: null, itemId: null });
  const [assignmentModal, setAssignmentModal] = useState({ open: false, moduleId: null, data: null, itemId: null });
  const [quizModal, setQuizModal] = useState({ open: false, moduleId: null, data: null, itemId: null });
  const [fileModal, setFileModal] = useState({ open: false, moduleId: null });

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState({ open: false, module: null, item: null });

  // ===== Module CRUD =====
  const createModule = async () => {
    if (!newTitle.trim()) return;
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      showToast(payload?.message || t("modules.errors.createModule"), "error");
      return;
    }
    setNewTitle("");
    setCreating(false);
    refetch();
  };

  const handleModuleReorder = async (moduleIds) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/modules/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleIds }),
    });
    refetch();
  };

  // ===== Add Item Flow =====
  const handleAddItem = (moduleRow) => {
    setAddingItemFor(moduleRow);
    setSelectedItemType("page");
    setSubHeaderTitle("");
  };

  const startItemCreation = () => {
    if (!addingItemFor) return;
    openCreator(addingItemFor, selectedItemType);
  };

  // Opens the right editor for itemType in moduleRow (used by the Add item drawer and by
  // "What should I create?"). quizKind pre-selects graded/practice for a new quiz.
  const openCreator = (moduleRow, itemType, quizKind) => {
    const moduleId = moduleRow.id;
    const selectedItemType = itemType;

    if (selectedItemType === "sub_header") {
      // Sub-header: just needs a title (the drawer asks for it)
      if (addingItemFor?.id !== moduleId) {
        setAddingItemFor(moduleRow);
        setSelectedItemType("sub_header");
        return;
      }
      if (!subHeaderTitle.trim()) return;
      createSubHeader(moduleId, subHeaderTitle.trim());
      return;
    }

    if (selectedItemType === "file") {
      setFileModal({ open: true, moduleId });
      setAddingItemFor(null);
      return;
    }

    if (selectedItemType === "page") {
      setPageModal({ open: true, moduleId, data: null, itemId: null });
      setAddingItemFor(null);
      return;
    }

    if (selectedItemType === "assignment") {
      setAssignmentModal({ open: true, moduleId, data: null, itemId: null, days: null, startDate: moduleRow.startDate || null });
      setAddingItemFor(null);
      return;
    }

    if (selectedItemType === "quiz") {
      setQuizModal({ open: true, moduleId, data: quizKind ? { kind: quizKind } : null, itemId: null, days: null, startDate: moduleRow.startDate || null });
      setAddingItemFor(null);
      return;
    }

    if (selectedItemType === "discussion") {
      // Simple discussion creation
      createSimpleItem(moduleId, "discussion", t("modules.newDiscussion"));
      return;
    }
  };

  const createSubHeader = async (moduleId, title) => {
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: "sub_header", title }),
    });
    try { await handleResponse(res, t("modules.errors.addSubHeader")); } catch { return; }
    setAddingItemFor(null);
    setSubHeaderTitle("");
    refetch();
  };

  const createSimpleItem = async (moduleId, itemType, title) => {
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType, title }),
    });
    try { await handleResponse(res, t("modules.errors.addItem")); } catch { return; }
    setAddingItemFor(null);
    refetch();
  };

  // ===== Save handlers for editor modals =====
  const handlePageSave = async (data) => {
    let res;
    if (pageModal.itemId) {
      // Edit existing
      res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${pageModal.moduleId}/items/${pageModal.itemId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data }),
      });
    } else {
      // Create new
      res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${pageModal.moduleId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: "page", ...data }),
      });
    }
    await handleResponse(res, t("modules.errors.savePage"));
    refetch();
  };

  const handleAssignmentSave = async (data) => {
    let res;
    if (assignmentModal.itemId) {
      res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${assignmentModal.moduleId}/items/${assignmentModal.itemId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data }),
      });
    } else {
      res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${assignmentModal.moduleId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: "assignment", ...data }),
      });
    }
    await handleResponse(res, t("modules.errors.saveAssignment"));
    refetch();
  };

  const handleQuizSave = async (data) => {
    let res;
    if (quizModal.itemId) {
      res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${quizModal.moduleId}/items/${quizModal.itemId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data }),
      });
    } else {
      res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${quizModal.moduleId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: "quiz", ...data }),
      });
    }
    await handleResponse(res, t("modules.errors.saveQuiz"));
    refetch();
  };

  // ===== Edit item =====
  const handleEditItem = useCallback(async (moduleRow, item) => {
    if (item.item_type === "sub_header") {
      const newTitle = prompt(t("modules.editSubHeaderPrompt"), item.title);
      if (newTitle !== null && newTitle.trim()) {
        const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim() }),
        });
        try { await handleResponse(res, t("modules.errors.renameSubHeader")); } catch { /* toast shown */ }
        refetch();
      }
      return;
    }

    // For content types, fetch the content data first
    const contentId = item.content_id;
    if (!contentId) return;

    if (item.item_type === "page") {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/pages/${contentId}`);
      const data = await res.json();
      setPageModal({ open: true, moduleId: moduleRow.id, data, itemId: item.id });
    } else if (item.item_type === "assignment") {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/assignments/${contentId}`);
      const data = await res.json();
      setAssignmentModal({ open: true, moduleId: moduleRow.id, data, itemId: item.id, days: itemDays(item), startDate: moduleRow.startDate || null });
    } else if (item.item_type === "quiz") {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/quizzes/${contentId}`);
      const data = await res.json();
      setQuizModal({ open: true, moduleId: moduleRow.id, data, itemId: item.id, days: itemDays(item), startDate: moduleRow.startDate || null });
    }
  }, [SERVER_URL, courseId, userEmail, refetch, showToast, t]);

  // ===== Delete item =====
  const handleDeleteItem = (moduleRow, item) => {
    setDeleteTarget({ open: true, module: moduleRow, item });
  };

  const removeFromModule = async () => {
    const { module: m, item } = deleteTarget;
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${m.id}/items/${item.id}?mode=remove_from_module`, {
      method: "DELETE",
    });
    try { await handleResponse(res, t("modules.errors.removeItem")); } catch { /* toast shown */ }
    refetch();
  };

  const deletePermanently = async () => {
    const { module: m, item } = deleteTarget;
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${m.id}/items/${item.id}?mode=delete_permanently`, {
      method: "DELETE",
    });
    try { await handleResponse(res, t("modules.errors.deleteItem")); } catch { /* toast shown */ }
    refetch();
  };

  const chooseFromHelper = ({ moduleId, itemType, kind }) => {
    const moduleRow = (modules || []).find((m) => Number(m.id) === Number(moduleId));
    setHelperOpen(false);
    if (moduleRow) openCreator(moduleRow, itemType, kind);
  };
  const selectedExplainer = explain(`items.${selectedItemType}`).entry;

  const renderTeacherModule = (moduleRow, dnd = null) => (
    <ModuleCard
      key={moduleRow.id}
      module={moduleRow}
      courseId={courseId}
      isTeacher={isTeacher}
      SERVER_URL={SERVER_URL}
      onRefetch={refetch}
      onAddItem={handleAddItem}
      onEditItem={handleEditItem}
      onDeleteItem={handleDeleteItem}
      ai={aiProps}
      dnd={dnd}
    />
  );

  return (
    <div>
      <Breadcrumbs sectionKey="modules" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader help="pages.modules"
          title={t("modules.title")}
          description={t("modules.description")}
          actions={isTeacher ? (
            <>
            <Link
              href={`/course/${courseId}/ai`}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-950/30 rounded-lg px-3 py-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {t("nav.ai")}
              {aiPendingCount > 0 ? (
                <span className="rounded-full bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5" aria-label={tf("modules.waitingForReview", { n: aiPendingCount })}>{aiPendingCount}</span>
              ) : null}
              {aiActiveJobs.length > 0 ? (
                <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300">{tf("modules.running", { n: aiActiveJobs.length })}</span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={() => setHelperOpen(true)}
              disabled={!modules || modules.filter((m) => m.kind !== "unassigned").length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#203A3A] border border-slate-200 hover:bg-slate-50 disabled:opacity-40 rounded-lg px-3 py-2 transition-colors"
            >
              {explain("helper").entry?.button || "What should I create?"}
            </button>
            <button
              onClick={() => setCreating((v) => !v)}
              aria-expanded={creating}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t("modules.addModule")}
            </button>
            </>
          ) : null}
        />

        {isTeacher ? <AiStatusNote status={aiStatus} /> : null}

        {/* Create module form */}
        {creating && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createModule(); }}
              placeholder={t("modules.newModulePlaceholder")}
              aria-label={t("modules.newModuleTitle")}
              className="flex-1 min-w-[12rem] text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              autoFocus
            />
            <button onClick={createModule} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">
              {t("common.create")}
            </button>
            <button onClick={() => setCreating(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
              {t("common.cancel")}
            </button>
          </div>
        )}

        {/* Loading / Error */}
        {loading && <Loader variant="page" size={56} className="min-h-[30vh]" label={t("modules.loading")} />}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && (!modules || modules.length === 0) && (
          <EmptyState
            compact
            title={isTeacher ? t("modules.emptyTeacher") : t("modules.emptyLearner")}
            description={isTeacher ? <ExplainerText k="pages.modules" /> : undefined}
          />
        )}

        {/* Module list with drag-and-drop */}
        {modules && modules.length > 0 && (
          isTeacher ? (
            <div className="space-y-8">
              <Suspense fallback={modules.map((moduleRow) => renderTeacherModule(moduleRow))}>
                <SortableModuleList modules={modules} onReorder={handleModuleReorder} renderModule={renderTeacherModule} />
              </Suspense>
            </div>
          ) : (
            <div className="space-y-8">
              {modules.map((moduleRow) => (
                <ModuleCard
                  key={moduleRow.id}
                  module={moduleRow}
                  courseId={courseId}
                  isTeacher={false}
                  SERVER_URL={SERVER_URL}
                  onRefetch={refetch}
                  onAddItem={() => {}}
                  onEditItem={() => {}}
                  onDeleteItem={() => {}}
                />
              ))}
            </div>
          )
        )}

        {/* Add Item Drawer (shown inline when a module is selected) */}
        {addingItemFor && (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl mx-0 sm:mx-4 p-5 animate-in slide-in-from-bottom-4 duration-200">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                {t("modules.addItemTo")} <span className="text-[#203A3A]">{addingItemFor.title}</span>
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="block text-xs font-semibold text-slate-600 mb-1.5">{t("modules.itemType")}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {ITEM_TYPE_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedItemType(opt.value)}
                          aria-pressed={selectedItemType === opt.value}
                          className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                            selectedItemType === opt.value
                              ? "border-[#203A3A] bg-[#203A3A] text-white"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {t(`items.${opt.value}`)}
                        </button>
                        <Explainer k={`items.${opt.value}`} variant="icon" align={["quiz", "sub_header"].includes(opt.value) ? "right" : "left"} />
                      </div>
                    ))}
                  </div>
                  {selectedExplainer ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {selectedExplainer.what} <span className="text-slate-400">{selectedExplainer.when}</span>
                    </p>
                  ) : null}
                </div>

                {selectedItemType === "sub_header" && (
                  <div>
                    <label htmlFor="new-subheader-title" className="block text-xs font-semibold text-slate-600 mb-1.5">{t("modules.subHeaderTitle")}</label>
                    <input
                      id="new-subheader-title"
                      value={subHeaderTitle}
                      onChange={(e) => setSubHeaderTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") startItemCreation(); }}
                      placeholder={t("modules.subHeaderPlaceholder")}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
                      autoFocus
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={startItemCreation}
                    disabled={selectedItemType === "sub_header" && !subHeaderTitle.trim()}
                    className="flex-1 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg py-2.5 transition-colors"
                  >
                    {t(`modules.addType.${selectedItemType}`)}
                  </button>
                  <button
                    onClick={() => setAddingItemFor(null)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2.5"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <WhatShouldICreate
        open={helperOpen}
        onClose={() => setHelperOpen(false)}
        modules={modules || []}
        onChoose={chooseFromHelper}
      />

      {/* ===== Modals ===== */}
      {pageModal.open && <PageEditorModal
        key={`page-${pageModal.open}-${pageModal.moduleId}-${pageModal.itemId}`}
        open={pageModal.open}
        onClose={() => setPageModal({ open: false, moduleId: null, data: null, itemId: null })}
        onSave={handlePageSave}
        initialData={pageModal.data}
      />}

      {assignmentModal.open && <AssignmentEditorModal
        key={`assignment-${assignmentModal.open}-${assignmentModal.moduleId}-${assignmentModal.itemId}`}
        open={assignmentModal.open}
        onClose={() => setAssignmentModal({ open: false, moduleId: null, data: null, itemId: null })}
        onSave={handleAssignmentSave}
        initialData={assignmentModal.data}
        initialDays={assignmentModal.days}
        moduleStartDate={assignmentModal.startDate}
      />}

      {quizModal.open && <QuizEditorModal
        key={`quiz-${quizModal.open}-${quizModal.moduleId}-${quizModal.itemId}`}
        open={quizModal.open}
        onClose={() => setQuizModal({ open: false, moduleId: null, data: null, itemId: null })}
        onSave={handleQuizSave}
        initialData={quizModal.data}
        initialDays={quizModal.days}
        moduleStartDate={quizModal.startDate}
      />}

      {fileModal.open && <FileUploadModal
        open={fileModal.open}
        onClose={() => setFileModal({ open: false, moduleId: null })}
        onUpload={() => refetch()}
        courseId={courseId}
        moduleId={fileModal.moduleId}
        SERVER_URL={SERVER_URL}
      />}

      <DeleteItemDialog
        open={deleteTarget.open}
        onClose={() => setDeleteTarget({ open: false, module: null, item: null })}
        item={deleteTarget.item}
        onRemove={removeFromModule}
        onDeletePermanently={deletePermanently}
      />
    </div>
  );
}
