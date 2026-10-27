"use client";

import { useState, lazy, Suspense } from "react";
import Link from "next/link";
import {
  EyeOff, Trash2, GripVertical, Plus, ChevronDown, ChevronRight, Pencil, Sparkles, Check, BookOpenText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ActionMenu from "@/components/ui/ActionMenu";
import ModuleItemRow from "./ModuleItemRow";
import { useToast } from "@/context/ToastContext";
import { isUnassignedModule } from "@/lib/moduleLabels";
import { useCourseText } from "@/components/course/useCourseText";
import Explainer from "@/components/help/Explainer";
import { formatRange } from "@/lib/dates";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { Field, Label, Select, TextInput } from "@/components/form";
import Modal from "@/components/ui/Modal";

// Teacher-only drag-and-drop, loaded on demand so learners never download dnd-kit.
const SortableItemList = lazy(() => import("./sortable").then((m) => ({ default: m.SortableItemList })));

// Sends a change. Returns "" when it worked, else the box's message (or `fallback`).
async function send(path, options, fallback) {
  try {
    await apiFetch(path, options);
    return "";
  } catch (err) {
    return err?.status === 0 ? getErrorMessage(err) : err?.body?.message || fallback;
  }
}

// File name kept for import stability; renders one module: a header bar and its item rows.
export default function ModuleCard({
  module: moduleRow,
  courseId,
  isTeacher,
  onRefetch,
  onAddItem,
  onEditItem,
  onDeleteItem,
  ai,
  dnd = null, // from SortableModuleList (teachers only): makes the module draggable
  itemFilter = "all", // Weeks filter: show only this kind of item ("all" = everything, draggable)
  weeks = [], // every week of the course (to move an item to another one)
  defaultCollapsed = false, // learners: only the week they're in starts open
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(moduleRow.title);
  const { showToast } = useToast();
  const { t, tf, weekLabel, ownWeekTitle } = useCourseText();
  const isUnassigned = isUnassignedModule(moduleRow);
  // The holding module's stored title is English ("Unassigned (fix me)"); its translated label says it all.
  // A title that only repeats the week ("Week 1", "Week 1: ...") isn't shown twice.
  const ownTitle = ownWeekTitle(moduleRow);
  const heading = isUnassigned || !ownTitle ? weekLabel(moduleRow) : `${weekLabel(moduleRow)} · ${ownTitle}`;
  const filtering = itemFilter !== "all";
  const shownItems = filtering ? moduleRow.items.filter((i) => i.item_type === itemFilter) : moduleRow.items;
  const [aiBusy, setAiBusy] = useState("");
  const [aiNote, setAiNote] = useState("");
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyIdea, setStoryIdea] = useState("");
  const [moving, setMoving] = useState(null); // the item being moved to another week
  const [moveTo, setMoveTo] = useState("");
  const moduleJobs = (ai?.activeJobs || []).filter((j) => Number(j.moduleId) === Number(moduleRow.id));
  const fillRunning = moduleJobs.some((j) => j.kind === "fill_week");
  const storyRunning = moduleJobs.some((j) => j.kind === "story");

  const startAiJob = async (kind, input) => {
    setAiBusy(kind);
    try {
      let payload;
      try {
        payload = await apiFetch(`/courses/${courseId}/ai/jobs`, { method: "POST", json: { kind, moduleId: moduleRow.id, input } });
      } catch (err) {
        showToast(err?.status === 0 ? getErrorMessage(err) : err?.body?.message || t("modules.ai.couldNotStart"), "error");
        return false;
      }
      showToast(t("modules.ai.started"), "success", 6000);
      setAiNote(kind === "story" ? t("modules.ai.writingStory") : t("modules.ai.draftingWeek"));
      ai?.onStarted?.(payload);
      return true;
    } catch (err) {
      showToast(err.message || t("modules.ai.couldNotStart"), "error");
      return false;
    } finally {
      setAiBusy("");
    }
  };

  const startFillWeek = () => startAiJob("fill_week", {});
  const startStory = async (e) => {
    e.preventDefault();
    if (!storyIdea.trim()) return;
    if (await startAiJob("story", { idea: storyIdea.trim() })) {
      setStoryIdea("");
      setStoryOpen(false);
    }
  };

  const togglePublish = async () => {
    const error = await send(`/courses/${courseId}/modules/${moduleRow.id}`, { method: "PATCH", json: { published: !moduleRow.published } }, t("modules.errors.updateModule"));
    if (error) showToast(error, "error");
    onRefetch();
  };

  // Publishing a week offers to publish its draft items too: a published week of drafts shows
  // learners nothing.
  const publishWeek = async () => {
    const drafts = moduleRow.items.filter((i) => i.item_type !== "sub_header" && !i.published);
    const error = await send(`/courses/${courseId}/modules/${moduleRow.id}`, { method: "PATCH", json: { published: true } }, t("modules.errors.updateModule"));
    if (error) {
      showToast(error, "error");
      onRefetch();
      return;
    }
    if (drafts.length > 0 && window.confirm(tf(drafts.length === 1 ? "modules.publishItemsTooOne" : "modules.publishItemsTooMany", { n: drafts.length }))) {
      for (const item of drafts) {
        const itemError = await send(`/courses/${courseId}/modules/${moduleRow.id}/items/${item.id}`, { method: "PATCH", json: { published: true } }, t("modules.errors.publishItem"));
        if (itemError) showToast(`${item.title}: ${itemError}`, "error");
      }
    }
    onRefetch();
  };

  const deleteModule = async () => {
    if (!confirm(tf("modules.confirmDeleteModule", { title: moduleRow.title }))) return;
    const error = await send(`/courses/${courseId}/modules/${moduleRow.id}`, { method: "DELETE", json: {} }, t("modules.errors.deleteModule"));
    if (error) showToast(error, "error");
    onRefetch();
  };

  const saveTitle = async () => {
    if (titleDraft.trim() && titleDraft.trim() !== moduleRow.title) {
      const error = await send(`/courses/${courseId}/modules/${moduleRow.id}`, { method: "PATCH", json: { title: titleDraft.trim() } }, t("modules.errors.renameModule"));
      if (error) showToast(error, "error");
      onRefetch();
    }
    setEditingTitle(false);
  };

  const toggleItemPublish = async (item) => {
    const error = await send(
      `/courses/${courseId}/modules/${moduleRow.id}/items/${item.id}`,
      { method: "PATCH", json: { published: !item.published } },
      item.published ? t("modules.errors.unpublishItem") : t("modules.errors.publishItem"),
    );
    if (error) showToast(error, "error");
    onRefetch();
  };

  const moveItem = async () => {
    if (!moving || !moveTo) return;
    const error = await send(`/courses/${courseId}/modules/${moduleRow.id}/items/${moving.id}`, { method: "PATCH", json: { moduleId: Number(moveTo) } }, t("modules.errors.moveItem"));
    if (error) showToast(error, "error");
    else showToast(t("modules.moved"), "success");
    setMoving(null);
    onRefetch();
  };
  const otherWeeks = weeks.filter((w) => w.id !== moduleRow.id && w.kind !== "unassigned");

  const handleItemReorder = async (itemIds) => {
    await send(`/courses/${courseId}/modules/${moduleRow.id}/items/reorder`, { method: "PATCH", json: { itemIds } }, "");
    onRefetch();
  };

  // Items that follow a group label (a sub-header such as "Pre-work") are indented under it.
  const groupedIds = new Set();
  let inGroup = false;
  for (const item of moduleRow.items) {
    if (item.item_type === "sub_header") inGroup = true;
    else if (inGroup) groupedIds.add(item.id);
  }

  const renderItem = (item, itemDnd = null) => (
    <ModuleItemRow
      key={item.id}
      item={item}
      courseId={courseId}
      isTeacher={isTeacher}
      grouped={groupedIds.has(item.id)}
      dnd={itemDnd}
      weekPublished={Boolean(moduleRow.published) || isUnassigned}
      onTogglePublish={() => toggleItemPublish(item)}
      onEdit={() => onEditItem(moduleRow, item)}
      onDelete={() => onDeleteItem(moduleRow, item)}
      onMove={otherWeeks.length > 0 ? () => { setMoving(item); setMoveTo(String(otherWeeks[0].id)); } : undefined}
    />
  );

  const hasDates = !isUnassigned && Boolean(moduleRow.startDate);
  const listBorder = isUnassigned
    ? "border-warning/30"
    : !moduleRow.published && isTeacher
      ? "border-dashed border-line-strong"
      : "border-line";
  // Prerequisites and completion are shown when the module data carries them.
  const prerequisites = Array.isArray(moduleRow.prerequisites) ? moduleRow.prerequisites.filter(Boolean) : [];
  const isComplete = moduleRow.completed === true || moduleRow.complete === true;

  // Clicking anywhere on the header bar (outside its buttons and fields) collapses the module.
  const onHeaderClick = (e) => {
    if (e.target.closest("button, a, input, form, [role='dialog']")) return;
    setCollapsed((v) => !v);
  };

  // One module: a full-width header bar and, under it, its items as rows in the same bordered box.
  return (
    <section
      id={`module-${moduleRow.id}`}
      ref={dnd?.setNodeRef}
      style={dnd?.style}
      aria-label={heading}
      className={`rounded-md border overflow-hidden ${listBorder} ${dnd?.isDragging ? "opacity-50" : ""}`}
    >
      {/* Module header bar */}
      <div
        onClick={onHeaderClick}
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 cursor-pointer select-none ${
          isUnassigned ? "bg-warning-soft/60" : "bg-surface-sunken"
        } ${collapsed ? "" : `border-b ${listBorder}`}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isTeacher && (
            // The drag handle carries dnd-kit's attributes too (not the whole week), so the week's
            // own buttons and menus work as usual.
            <button {...(dnd?.attributes || {})} {...(dnd?.listeners || {})} aria-label={t("modules.dragModule")} className="cursor-grab active:cursor-grabbing p-0.5 text-fg-subtle hover:text-fg-subtle shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("modules.expandModule") : t("modules.collapseModule")}
            className="p-0.5 text-fg-subtle hover:text-fg-muted shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {editingTitle ? (
            <TextInput size="sm" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }} aria-label={t("modules.moduleTitle")} className="flex-1 min-w-[10rem]" autoFocus />
          ) : (
            <h2
              className={`text-item font-bold truncate ${isUnassigned ? "text-warning-fg" : "text-fg"}`}
              onDoubleClick={() => isTeacher && setEditingTitle(true)}
            >
              {heading}
            </h2>
          )}
          {isUnassigned ? <Explainer k="pages.unassigned" variant="icon" /> : null}
          {moduleRow.kind === "baseline" ? <Explainer k="pages.baseline" variant="icon" /> : null}
          {!isUnassigned && (
            <span className={`hidden sm:inline text-caption shrink-0 ${moduleRow.status === "past" ? "text-fg-subtle" : "text-fg-subtle"}`}>
              {hasDates ? formatRange(moduleRow.startDate, moduleRow.endDate) : t("home.noDatesYet")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {prerequisites.length > 0 ? (
            <span className="text-caption text-fg-subtle">
              {tf("modules.prerequisites", { list: prerequisites.join(", ") })}
            </span>
          ) : null}
          {!isUnassigned && moduleRow.status === "current" ? (
            <span className="text-caption font-semibold text-brand-fg">{t("home.current")}</span>
          ) : null}
          {!isUnassigned && moduleRow.status === "past" ? (
            <span className="text-caption text-fg-subtle">{t("modules.past")}</span>
          ) : null}
          {isTeacher && !isUnassigned ? (
            <span className={`text-caption font-semibold px-2 py-0.5 rounded-full border ${moduleRow.published ? "bg-success-soft text-success-fg border-success/30" : "bg-surface text-fg-muted border-line"}`}>
              {moduleRow.published ? t("common.published") : t("common.draft")}
            </span>
          ) : null}
          {isComplete ? <Check className="w-4 h-4 text-success-fg" aria-label={t("modules.complete")} /> : null}
          {(fillRunning || storyRunning) && isTeacher ? (
            <span className="text-caption text-brand-fg flex items-center gap-1"><Sparkles className="w-3 h-3" aria-hidden="true" /> {fillRunning ? t("modules.ai.filling") : t("modules.ai.writingStoryShort")}</span>
          ) : null}

          {isTeacher && (
            <div className="flex items-center gap-1">
              {!isUnassigned && !moduleRow.published ? (
                <Button type="button" size="sm" onClick={publishWeek} aria-label={tf("modules.publishWeekNamed", { title: moduleRow.title })}>
                  {t("modules.publishModule")}
                </Button>
              ) : null}
              <ActionMenu
                label={tf("modules.weekActions", { title: isUnassigned ? heading : moduleRow.title })}
                items={[
                  isUnassigned ? null : { key: "rename", label: t("modules.renameModule"), icon: Pencil, onSelect: () => { setTitleDraft(moduleRow.title); setEditingTitle(true); } },
                  isUnassigned ? null : ai?.status?.allowed
                    ? { key: "fill", label: fillRunning ? t("modules.ai.filling") : t("modules.ai.fillWeekMenu"), icon: Sparkles, onSelect: startFillWeek, disabled: aiBusy === "fill_week" || fillRunning }
                    : ai?.status && !ai.status.loading && ai.status.reason ? { key: "ai-off", label: t("modules.ai.off"), icon: Sparkles, disabled: true } : null,
                  isUnassigned || !ai?.status?.allowed ? null : { key: "story", label: storyRunning ? t("modules.ai.writingStoryShort") : t("modules.ai.storyMenu"), icon: BookOpenText, onSelect: () => setStoryOpen(true), disabled: storyRunning },
                  !isUnassigned && moduleRow.published ? { key: "unpublish", label: t("modules.unpublishModule"), icon: EyeOff, onSelect: togglePublish } : null,
                  { separator: true },
                  { key: "delete", label: t("modules.deleteModule"), icon: Trash2, onSelect: deleteModule, danger: true },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      {isTeacher && storyOpen ? (
        <form onSubmit={startStory} className="flex flex-wrap items-end gap-2 px-5 py-3 border-b border-line">
          <div className="flex-1 min-w-[12rem]">
            <Label htmlFor={`story-idea-${moduleRow.id}`}>
              {tf("modules.ai.storyIdeaFor", { week: weekLabel(moduleRow) })}
            </Label>
            <TextInput size="sm" id={`story-idea-${moduleRow.id}`} value={storyIdea} onChange={(e) => setStoryIdea(e.target.value)} maxLength={500} placeholder={t("modules.ai.storyPlaceholder")} className="w-full" autoFocus />
          </div>
          <button type="submit" disabled={!storyIdea.trim() || aiBusy === "story"} className="text-caption font-bold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-50 px-3.5 py-2 rounded-lg">
            {aiBusy === "story" ? t("modules.ai.starting") : t("modules.ai.writeStoryDraft")}
          </button>
          <button type="button" onClick={() => setStoryOpen(false)} className="text-caption font-semibold text-fg-subtle px-2 py-2">{t("common.cancel")}</button>
        </form>
      ) : null}

      {isTeacher && (aiNote || moduleJobs.length > 0) ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-muted px-5 py-2.5 border-b border-line">
          <Sparkles className="w-3.5 h-3.5 text-brand-fg" aria-hidden="true" />
          <span>{moduleJobs.length > 0 ? t("modules.ai.beingWritten") : aiNote}</span>
          <Link href={`/course/${courseId}/ai`} className="font-semibold text-brand-fg hover:underline">{t("modules.ai.openDrafts")}</Link>
          {moduleJobs.length === 0 ? (
            <button type="button" onClick={() => setAiNote("")} className="text-fg-subtle hover:text-fg-muted underline">{t("modules.hide")}</button>
          ) : null}
        </p>
      ) : null}

      {isUnassigned && moduleRow.items.length > 0 && (
        <p className="text-caption font-medium text-warning-fg px-5 py-2.5 border-b border-warning/30">
          ⚠️ {t("modules.unassignedWarning")}
        </p>
      )}

      {/* Items: one list of rows */}
      {!collapsed && (
        <ul
          aria-label={tf("modules.itemsIn", { title: isUnassigned ? heading : moduleRow.title })}
          className={`divide-y divide-line ${
            isUnassigned ? "bg-warning-soft/40" : "bg-surface"
          }`}
        >
          {shownItems.length === 0 && (
            <li className="text-caption text-fg-subtle px-5 py-3.5 italic">{filtering ? t("modules.noMatchingItems") : t("modules.noItems")}</li>
          )}

          {filtering ? shownItems.map((item) => renderItem(item)) : isTeacher ? (
            <Suspense fallback={moduleRow.items.map((item) => renderItem(item))}>
              <SortableItemList items={moduleRow.items} onReorder={handleItemReorder} renderItem={renderItem} />
            </Suspense>
          ) : (
            moduleRow.items.map((item) => renderItem(item))
          )}

          {/* Add item row */}
          {isTeacher && (
            <li>
              <button
                onClick={() => onAddItem(moduleRow)}
                className="flex items-center gap-1.5 text-caption font-semibold text-brand-fg px-5 py-3.5 hover:bg-surface-hover w-full text-left transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {t("modules.addItem")}
              </button>
            </li>
          )}
        </ul>
      )}
      {moving ? (
        <Modal title={tf("modules.moveTitle", { title: moving.title })} onClose={() => setMoving(null)}>
          <div className="space-y-4">
            <Field id={`move-to-${moduleRow.id}`} label={t("modules.moveToLabel")}>
              <Select id={`move-to-${moduleRow.id}`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-full">
                {otherWeeks.map((w) => <option key={w.id} value={w.id}>{weekLabel(w)}{w.title ? ` · ${w.title}` : ""}</option>)}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMoving(null)}>{t("common.cancel")}</Button>
              <Button type="button" onClick={moveItem}>{t("modules.move")}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
