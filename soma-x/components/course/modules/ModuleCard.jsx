"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import {
  Eye, EyeOff, Trash2, GripVertical, Plus, ChevronDown, ChevronRight, Pencil, Sparkles,
} from "lucide-react";
import ModuleItemRow from "./ModuleItemRow";
import { useToast } from "@/context/ToastContext";
import { moduleWeekLabel, isUnassignedModule } from "@/lib/moduleLabels";
import { formatRange } from "@/lib/dates";

async function readError(res, fallback) {
  const payload = await res.json().catch(() => ({}));
  return payload?.message || fallback;
}

export default function ModuleCard({
  module: moduleRow,
  courseId,
  isTeacher,
  SERVER_URL,
  onRefetch,
  onAddItem,
  onEditItem,
  onDeleteItem,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(moduleRow.title);
  const { showToast } = useToast();
  const isUnassigned = isUnassignedModule(moduleRow);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: moduleRow.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const togglePublish = async () => {
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !moduleRow.published }),
    });
    if (!res.ok) showToast(await readError(res, "Failed to update module"), "error");
    onRefetch();
  };

  const deleteModule = async () => {
    if (!confirm(`Delete module "${moduleRow.title}"? Only empty modules can be deleted.`)) return;
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) showToast(await readError(res, "Failed to delete module"), "error");
    onRefetch();
  };

  const saveTitle = async () => {
    if (titleDraft.trim() && titleDraft.trim() !== moduleRow.title) {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      if (!res.ok) showToast(await readError(res, "Failed to rename module"), "error");
      onRefetch();
    }
    setEditingTitle(false);
  };

  const toggleItemPublish = async (item) => {
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !item.published }),
    });
    if (!res.ok) {
      showToast(await readError(res, item.published ? "Failed to unpublish item" : "Failed to publish item"), "error");
    }
    onRefetch();
  };

  const handleItemReorder = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = moduleRow.items.findIndex((i) => i.id === active.id);
    const newIndex = moduleRow.items.findIndex((i) => i.id === over.id);
    const newItems = arrayMove(moduleRow.items, oldIndex, newIndex);

    await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: newItems.map((i) => i.id) }),
    });
    onRefetch();
  };

  const itemIds = moduleRow.items.map((i) => i.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border overflow-hidden transition-shadow ${
        isDragging ? "opacity-50 shadow-lg border-[#203A3A]/30" : "border-slate-200 shadow-sm"
      } ${isUnassigned ? "border-amber-300 bg-amber-50/30" : !moduleRow.published && isTeacher ? "border-dashed border-slate-300 bg-slate-50/30" : "bg-white"}`}
      {...attributes}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-slate-50 to-slate-100/50 px-3.5 py-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          {isTeacher && (
            <button {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-500 shrink-0">
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setCollapsed((v) => !v)} className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0">
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md shrink-0 border ${
            isUnassigned ? "text-amber-700 bg-amber-50 border-amber-200" : "text-[#0D9488] bg-teal-50 border-teal-200"
          }`}>
            {moduleWeekLabel(moduleRow)}
          </span>
          {!isUnassigned && moduleRow.startDate && (
            <span className={`text-[11px] font-medium shrink-0 ${moduleRow.status === "past" ? "text-slate-400" : "text-slate-600"}`}>
              {formatRange(moduleRow.startDate, moduleRow.endDate)}
            </span>
          )}
          {!isUnassigned && moduleRow.status === "current" && (
            <span className="text-[9px] font-bold uppercase text-white bg-[#0D9488] px-1.5 py-0.5 rounded shrink-0">
              Current
            </span>
          )}
          {!isUnassigned && moduleRow.status === "past" && (
            <span className="text-[9px] font-semibold uppercase text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
              Past
            </span>
          )}
          {editingTitle ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              className="flex-1 text-sm font-bold border border-slate-300 rounded-lg px-2 py-0.5 outline-none focus:border-[#203A3A] bg-white"
              autoFocus
            />
          ) : (
            <span
              className="text-sm font-bold text-slate-800 truncate cursor-default"
              onDoubleClick={() => isTeacher && setEditingTitle(true)}
            >
              {moduleRow.title}
            </span>
          )}
          {!moduleRow.published && isTeacher && (
            <span className="text-[9px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
              Draft
            </span>
          )}
        </div>

        {isTeacher && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <button
              onClick={async () => {
                const res = await fetch(`${SERVER_URL}/courses/${courseId}/ai/fill-module`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ moduleId: moduleRow.id }),
                });
                if (res.ok) showToast((await res.json().catch(() => ({}))).message || "Drafts added", "success");
                else showToast(await readError(res, "AI drafts could not be created"), "error");
                onRefetch();
              }}
              className="flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 px-2.5 py-1 rounded-lg transition-colors"
              title="Adds an unpublished draft page, quiz, and assignment to this week. Review and edit them before publishing."
            >
              <Sparkles className="w-3 h-3 text-[#0D9488]" /> AI Fill Week
            </button>
            <button
              onClick={async () => {
                const idea = prompt("Enter story idea (e.g. A boy who finds a broken calculator):");
                if (idea && idea.trim()) {
                  const res = await fetch(`${SERVER_URL}/courses/${courseId}/ai/generate-story`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ moduleId: moduleRow.id, idea: idea.trim() }),
                  });
                  if (res.ok) showToast((await res.json().catch(() => ({}))).message || "Drafts added", "success");
                  else showToast(await readError(res, "AI drafts could not be created"), "error");
                  onRefetch();
                }
              }}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors"
              title="Adds an unpublished draft story page and discussion prompt. Review and edit them before publishing."
            >
              <Sparkles className="w-3 h-3 text-slate-500" /> AI Story
            </button>
            {!editingTitle && (
              <button onClick={() => { setTitleDraft(moduleRow.title); setEditingTitle(true); }} className="p-1.5 rounded-md hover:bg-white text-slate-400" title="Rename">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={togglePublish} className="p-1.5 rounded-md hover:bg-white text-slate-500" title={moduleRow.published ? "Unpublish" : "Publish"}>
              {moduleRow.published ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button onClick={deleteModule} className="p-1.5 rounded-md hover:bg-white text-rose-500" title="Delete module">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {isUnassigned && moduleRow.items.length > 0 && (
        <div className="text-xs font-medium text-amber-800 bg-amber-50 border-t border-amber-200 px-4 py-2">
          ⚠️ Move these items into a week. The course can't open while this has items.
        </div>
      )}

      {/* Items */}
      {!collapsed && (
        <div className="divide-y divide-slate-100/80">
          {moduleRow.items.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-3 italic">No items in this module yet.</p>
          )}

          {isTeacher ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleItemReorder}
            >
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                {moduleRow.items.map((item) => (
                  <ModuleItemRow
                    key={item.id}
                    item={item}
                    courseId={courseId}
                    isTeacher={isTeacher}
                    onTogglePublish={() => toggleItemPublish(item)}
                    onEdit={() => onEditItem(moduleRow, item)}
                    onDelete={() => onDeleteItem(moduleRow, item)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            moduleRow.items.map((item) => (
              <ModuleItemRow
                key={item.id}
                item={item}
                courseId={courseId}
                isTeacher={false}
                onTogglePublish={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            ))
          )}

          {/* Add item button */}
          {isTeacher && (
            <button
              onClick={() => onAddItem(moduleRow)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#203A3A] px-4 py-2.5 hover:bg-slate-50 w-full text-left transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
