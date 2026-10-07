"use client";

import { useState, useCallback } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, EmptyState } from "@/components/layout";
import InfoTooltip from "@/components/ui/InfoTooltip";
import ModuleCard from "@/components/course/modules/ModuleCard";
import DeleteItemDialog from "@/components/course/modules/DeleteItemDialog";
import PageEditorModal from "@/components/course/modules/editors/PageEditorModal";
import AssignmentEditorModal from "@/components/course/modules/editors/AssignmentEditorModal";
import QuizEditorModal from "@/components/course/modules/editors/QuizEditorModal";
import FileUploadModal from "@/components/course/modules/editors/FileUploadModal";

const ITEM_TYPE_OPTIONS = [
  { value: "page", label: "Page" },
  { value: "assignment", label: "Assignment" },
  { value: "quiz", label: "Quiz" },
  { value: "file", label: "File" },
  { value: "sub_header", label: "Sub-header" },
  { value: "discussion", label: "Discussion" },
];

// A module item's day offsets, for the editor modals.
const itemDays = (item) => ({ release_day: item.release_day, due_day: item.due_day, close_day: item.close_day });

export default function ModulesPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: modules, loading, error, refetch } = useCourseSection("modules");
  const { showToast } = useToast();

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
  const [subHeaderTitle, setSubHeaderTitle] = useState("");

  // Editor modals
  const [pageModal, setPageModal] = useState({ open: false, moduleId: null, data: null, itemId: null });
  const [assignmentModal, setAssignmentModal] = useState({ open: false, moduleId: null, data: null, itemId: null });
  const [quizModal, setQuizModal] = useState({ open: false, moduleId: null, data: null, itemId: null });
  const [fileModal, setFileModal] = useState({ open: false, moduleId: null });

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState({ open: false, module: null, item: null });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

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
      showToast(payload?.message || "Failed to create module", "error");
      return;
    }
    setNewTitle("");
    setCreating(false);
    refetch();
  };

  const handleModuleReorder = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !modules) return;

    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    const newModules = arrayMove(modules, oldIndex, newIndex);

    await fetch(`${SERVER_URL}/courses/${courseId}/modules/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleIds: newModules.map((m) => m.id) }),
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
    const moduleId = addingItemFor.id;

    if (selectedItemType === "sub_header") {
      // Sub-header: just needs a title
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
      setAssignmentModal({ open: true, moduleId, data: null, itemId: null, days: null, startDate: addingItemFor.startDate || null });
      setAddingItemFor(null);
      return;
    }

    if (selectedItemType === "quiz") {
      setQuizModal({ open: true, moduleId, data: null, itemId: null, days: null, startDate: addingItemFor.startDate || null });
      setAddingItemFor(null);
      return;
    }

    if (selectedItemType === "discussion") {
      // Simple discussion creation
      createSimpleItem(moduleId, "discussion", "New Discussion");
      return;
    }
  };

  const createSubHeader = async (moduleId, title) => {
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType: "sub_header", title }),
    });
    try { await handleResponse(res, "Failed to add sub-header"); } catch { return; }
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
    try { await handleResponse(res, "Failed to add item"); } catch { return; }
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
    await handleResponse(res, "Failed to save page");
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
    await handleResponse(res, "Failed to save assignment");
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
    await handleResponse(res, "Failed to save quiz");
    refetch();
  };

  // ===== Edit item =====
  const handleEditItem = useCallback(async (moduleRow, item) => {
    if (item.item_type === "sub_header") {
      const newTitle = prompt("Edit sub-header title:", item.title);
      if (newTitle !== null && newTitle.trim()) {
        const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}/items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim() }),
        });
        try { await handleResponse(res, "Failed to rename sub-header"); } catch { /* toast shown */ }
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
  }, [SERVER_URL, courseId, userEmail, refetch, showToast]);

  // ===== Delete item =====
  const handleDeleteItem = (moduleRow, item) => {
    setDeleteTarget({ open: true, module: moduleRow, item });
  };

  const removeFromModule = async () => {
    const { module: m, item } = deleteTarget;
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${m.id}/items/${item.id}?mode=remove_from_module`, {
      method: "DELETE",
    });
    try { await handleResponse(res, "Failed to remove item"); } catch { /* toast shown */ }
    refetch();
  };

  const deletePermanently = async () => {
    const { module: m, item } = deleteTarget;
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${m.id}/items/${item.id}?mode=delete_permanently`, {
      method: "DELETE",
    });
    try { await handleResponse(res, "Failed to delete item"); } catch { /* toast shown */ }
    refetch();
  };

  const moduleIds = (modules || []).map((m) => m.id);

  return (
    <div>
      <Breadcrumbs sectionKey="modules" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              Modules
              <InfoTooltip text="A Module groups related content — pages, assignments, quizzes, and files — into one learning unit. Example: 'Module 1: Cell Biology' might contain a reading page, a quiz, and an assignment, all in the order students should complete them." />
            </span>
          }
          description="Each week's module with its dates, followed by its items in the order learners work through them."
          actions={isTeacher ? (
            <button
              onClick={() => setCreating((v) => !v)}
              aria-expanded={creating}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Module
            </button>
          ) : null}
        />

        {/* Create module form */}
        {creating && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createModule(); }}
              placeholder="Module title (e.g. Unit 1, Course Introduction)"
              aria-label="New module title"
              className="flex-1 min-w-[12rem] text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              autoFocus
            />
            <button onClick={createModule} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">
              Create
            </button>
            <button onClick={() => setCreating(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2">
              Cancel
            </button>
          </div>
        )}

        {/* Loading / Error */}
        {loading && <p className="text-sm text-slate-500">Loading modules...</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && (!modules || modules.length === 0) && (
          <EmptyState
            compact
            title={isTeacher ? "No modules yet" : "No content published yet."}
            description={isTeacher ? "Create a module to start organizing your course content." : undefined}
          />
        )}

        {/* Module list with drag-and-drop */}
        {modules && modules.length > 0 && (
          isTeacher ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleModuleReorder}
            >
              <SortableContext items={moduleIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-8">
                  {modules.map((moduleRow) => (
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
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
                Add item to <span className="text-[#203A3A]">{addingItemFor.title}</span>
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Item Type</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ITEM_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedItemType(opt.value)}
                        className={`text-xs font-medium py-2 rounded-lg border transition-colors ${
                          selectedItemType === opt.value
                            ? "border-[#203A3A] bg-[#203A3A] text-white"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedItemType === "sub_header" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Sub-header Title</label>
                    <input
                      value={subHeaderTitle}
                      onChange={(e) => setSubHeaderTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") startItemCreation(); }}
                      placeholder="e.g. Week 1 Readings"
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
                    {selectedItemType === "sub_header" ? "Add Sub-header" : `Add ${ITEM_TYPE_OPTIONS.find(o => o.value === selectedItemType)?.label}`}
                  </button>
                  <button
                    onClick={() => setAddingItemFor(null)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Modals ===== */}
      <PageEditorModal
        key={`page-${pageModal.open}-${pageModal.moduleId}-${pageModal.itemId}`}
        open={pageModal.open}
        onClose={() => setPageModal({ open: false, moduleId: null, data: null, itemId: null })}
        onSave={handlePageSave}
        initialData={pageModal.data}
      />

      <AssignmentEditorModal
        key={`assignment-${assignmentModal.open}-${assignmentModal.moduleId}-${assignmentModal.itemId}`}
        open={assignmentModal.open}
        onClose={() => setAssignmentModal({ open: false, moduleId: null, data: null, itemId: null })}
        onSave={handleAssignmentSave}
        initialData={assignmentModal.data}
        initialDays={assignmentModal.days}
        moduleStartDate={assignmentModal.startDate}
      />

      <QuizEditorModal
        key={`quiz-${quizModal.open}-${quizModal.moduleId}-${quizModal.itemId}`}
        open={quizModal.open}
        onClose={() => setQuizModal({ open: false, moduleId: null, data: null, itemId: null })}
        onSave={handleQuizSave}
        initialData={quizModal.data}
        initialDays={quizModal.days}
        moduleStartDate={quizModal.startDate}
      />

      <FileUploadModal
        open={fileModal.open}
        onClose={() => setFileModal({ open: false, moduleId: null })}
        onUpload={() => refetch()}
        courseId={courseId}
        moduleId={fileModal.moduleId}
        SERVER_URL={SERVER_URL}
      />

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
