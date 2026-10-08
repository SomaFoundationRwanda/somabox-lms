"use client";

import { useState, lazy, Suspense } from "react";
import Link from "next/link";
import {
  Eye, EyeOff, Trash2, GripVertical, Plus, ChevronDown, ChevronRight, Pencil, Sparkles,
} from "lucide-react";
import ModuleItemRow from "./ModuleItemRow";
import { useToast } from "@/context/ToastContext";
import { isUnassignedModule } from "@/lib/moduleLabels";
import { useCourseText } from "@/components/course/useCourseText";
import Explainer from "@/components/help/Explainer";
import { formatRange } from "@/lib/dates";

// Teacher-only drag-and-drop, loaded on demand so learners never download dnd-kit.
const SortableItemList = lazy(() => import("./sortable").then((m) => ({ default: m.SortableItemList })));

async function readError(res, fallback) {
  const payload = await res.json().catch(() => ({}));
  return payload?.message || fallback;
}

// File name kept for import stability; renders a flat, dated module section.
export default function ModuleCard({
  module: moduleRow,
  courseId,
  isTeacher,
  SERVER_URL,
  onRefetch,
  onAddItem,
  onEditItem,
  onDeleteItem,
  ai,
  dnd = null, // from SortableModuleList (teachers only): makes the module draggable
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(moduleRow.title);
  const { showToast } = useToast();
  const { t, tf, weekLabel } = useCourseText();
  const isUnassigned = isUnassignedModule(moduleRow);
  const [aiBusy, setAiBusy] = useState("");
  const [aiNote, setAiNote] = useState("");
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyIdea, setStoryIdea] = useState("");
  const moduleJobs = (ai?.activeJobs || []).filter((j) => Number(j.moduleId) === Number(moduleRow.id));
  const fillRunning = moduleJobs.some((j) => j.kind === "fill_week");
  const storyRunning = moduleJobs.some((j) => j.kind === "story");

  const startAiJob = async (kind, input) => {
    setAiBusy(kind);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/ai/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, moduleId: moduleRow.id, input }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(payload?.message || t("modules.ai.couldNotStart"), "error");
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
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !moduleRow.published }),
    });
    if (!res.ok) showToast(await readError(res, t("modules.errors.updateModule")), "error");
    onRefetch();
  };

  const deleteModule = async () => {
    if (!confirm(tf("modules.confirmDeleteModule", { title: moduleRow.title }))) return;
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) showToast(await readError(res, t("modules.errors.deleteModule")), "error");
    onRefetch();
  };

  const saveTitle = async () => {
    if (titleDraft.trim() && titleDraft.trim() !== moduleRow.title) {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      if (!res.ok) showToast(await readError(res, t("modules.errors.renameModule")), "error");
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
      showToast(await readError(res, item.published ? t("modules.errors.unpublishItem") : t("modules.errors.publishItem")), "error");
    }
    onRefetch();
  };

  const handleItemReorder = async (itemIds) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleRow.id}/items/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds }),
    });
    onRefetch();
  };

  const renderItem = (item, itemDnd = null) => (
    <ModuleItemRow
      key={item.id}
      item={item}
      courseId={courseId}
      isTeacher={isTeacher}
      dnd={itemDnd}
      onTogglePublish={() => toggleItemPublish(item)}
      onEdit={() => onEditItem(moduleRow, item)}
      onDelete={() => onDeleteItem(moduleRow, item)}
    />
  );

  const hasDates = !isUnassigned && Boolean(moduleRow.startDate);
  const listBorder = isUnassigned
    ? "border-amber-300 dark:border-amber-800"
    : !moduleRow.published && isTeacher
      ? "border-dashed border-slate-300 dark:border-slate-700"
      : "border-slate-200 dark:border-slate-800";

  // A dated module section: a header row (week, title, dates, status, actions) followed by
  // its items as rows in ONE list. Not a card: the only bordered box is the item list.
  return (
    <section
      ref={dnd?.setNodeRef}
      style={dnd?.style}
      aria-label={`${weekLabel(moduleRow)}: ${moduleRow.title}`}
      className={`space-y-2 ${dnd?.isDragging ? "opacity-50" : ""}`}
      {...(dnd?.attributes || {})}
    >
      {/* Section header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          {isTeacher && (
            <button {...(dnd?.listeners || {})} aria-label={t("modules.dragModule")} className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-500 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]">
              <GripVertical className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("modules.expandModule") : t("modules.collapseModule")}
            className="p-0.5 text-slate-400 hover:text-slate-600 shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md shrink-0 border ${
            isUnassigned ? "text-amber-700 bg-amber-50 border-amber-200" : "text-[#0D9488] bg-teal-50 border-teal-200"
          }`}>
            {weekLabel(moduleRow)}
          </span>
          {isUnassigned ? <Explainer k="pages.unassigned" variant="icon" /> : null}
          {moduleRow.kind === "baseline" ? <Explainer k="pages.baseline" variant="icon" /> : null}
          {editingTitle ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              aria-label={t("modules.moduleTitle")}
              className="flex-1 min-w-[10rem] text-sm font-bold border border-slate-300 rounded-lg px-2 py-0.5 outline-none focus:border-[#203A3A] bg-white"
              autoFocus
            />
          ) : (
            <h2
              className="text-base font-bold text-slate-900 dark:text-white truncate cursor-default"
              onDoubleClick={() => isTeacher && setEditingTitle(true)}
            >
              {moduleRow.title}
            </h2>
          )}
          {!isUnassigned && (
            <span className={`text-xs font-medium shrink-0 ${moduleRow.status === "past" ? "text-slate-400" : "text-slate-600 dark:text-slate-300"}`}>
              {hasDates ? formatRange(moduleRow.startDate, moduleRow.endDate) : t("home.noDatesYet")}
            </span>
          )}
          {!isUnassigned && moduleRow.status === "current" && (
            <span className="text-[11px] font-bold uppercase text-white bg-[#0D9488] px-1.5 py-0.5 rounded shrink-0">
              {t("home.current")}
            </span>
          )}
          {!isUnassigned && moduleRow.status === "past" && (
            <span className="text-[11px] font-semibold uppercase text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
              {t("modules.past")}
            </span>
          )}
          {!moduleRow.published && isTeacher && (
            <span className="text-[11px] font-bold uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
              {t("common.draft")}
            </span>
          )}
        </div>

        {isTeacher && (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {isUnassigned ? null : ai?.status?.allowed ? (
              <>
                <button
                  type="button"
                  onClick={startFillWeek}
                  disabled={aiBusy === "fill_week" || fillRunning}
                  className="flex items-center gap-1 text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors"
                  title={fillRunning ? t("modules.ai.fillRunningHint") : t("modules.ai.fillHint")}
                >
                  <Sparkles className="w-3 h-3 text-[#0D9488]" /> {fillRunning ? t("modules.ai.filling") : t("modules.ai.fillWeek")}
                </button>
                <button
                  type="button"
                  onClick={() => setStoryOpen((v) => !v)}
                  aria-expanded={storyOpen}
                  disabled={storyRunning}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-colors"
                  title={storyRunning ? t("modules.ai.storyRunningHint") : t("modules.ai.storyHint")}
                >
                  <Sparkles className="w-3 h-3 text-slate-500" /> {storyRunning ? t("modules.ai.writingStoryShort") : t("modules.ai.story")}
                </button>
              </>
            ) : ai?.status && !ai.status.loading && ai.status.reason ? (
              <span className="text-[11px] text-slate-400" title={ai.status.reason}>
                <Sparkles className="inline w-3 h-3 mr-0.5" aria-hidden="true" />{t("modules.ai.off")}
                <span className="sr-only">: {ai.status.reason}</span>
              </span>
            ) : null}
            {!editingTitle && (
              <button onClick={() => { setTitleDraft(moduleRow.title); setEditingTitle(true); }} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400" title={t("modules.rename")} aria-label={t("modules.renameModule")}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={togglePublish} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500" title={moduleRow.published ? t("modules.unpublish") : t("modules.publish")} aria-label={moduleRow.published ? t("modules.unpublishModule") : t("modules.publishModule")}>
              {moduleRow.published ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button onClick={deleteModule} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500" title={t("modules.deleteModule")} aria-label={t("modules.deleteModule")}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {isTeacher && storyOpen ? (
        <form onSubmit={startStory} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[12rem]">
            <label htmlFor={`story-idea-${moduleRow.id}`} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
              {tf("modules.ai.storyIdeaFor", { week: weekLabel(moduleRow) })}
            </label>
            <input
              id={`story-idea-${moduleRow.id}`}
              value={storyIdea}
              onChange={(e) => setStoryIdea(e.target.value)}
              maxLength={500}
              placeholder={t("modules.ai.storyPlaceholder")}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0D9488]"
              autoFocus
            />
          </div>
          <button type="submit" disabled={!storyIdea.trim() || aiBusy === "story"} className="text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 px-3.5 py-2 rounded-lg">
            {aiBusy === "story" ? t("modules.ai.starting") : t("modules.ai.writeStoryDraft")}
          </button>
          <button type="button" onClick={() => setStoryOpen(false)} className="text-xs font-semibold text-slate-500 px-2 py-2">{t("common.cancel")}</button>
        </form>
      ) : null}

      {isTeacher && (aiNote || moduleJobs.length > 0) ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-[#0D9488]" aria-hidden="true" />
          <span>{moduleJobs.length > 0 ? t("modules.ai.beingWritten") : aiNote}</span>
          <Link href={`/course/${courseId}/ai`} className="font-semibold text-[#0D9488] hover:underline">{t("modules.ai.openDrafts")}</Link>
          {moduleJobs.length === 0 ? (
            <button type="button" onClick={() => setAiNote("")} className="text-slate-400 hover:text-slate-600 underline">{t("modules.hide")}</button>
          ) : null}
        </p>
      ) : null}

      {isUnassigned && moduleRow.items.length > 0 && (
        <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
          ⚠️ {t("modules.unassignedWarning")}
        </p>
      )}

      {/* Items: one list of rows */}
      {!collapsed && (
        <ul
          aria-label={tf("modules.itemsIn", { title: moduleRow.title })}
          className={`divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border overflow-hidden ${listBorder} ${
            isUnassigned ? "bg-amber-50/40 dark:bg-amber-950/10" : "bg-white dark:bg-transparent"
          }`}
        >
          {moduleRow.items.length === 0 && (
            <li className="text-xs text-slate-400 px-4 py-3 italic">{t("modules.noItems")}</li>
          )}

          {isTeacher ? (
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
                className="flex items-center gap-1.5 text-xs font-semibold text-[#203A3A] dark:text-teal-300 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 w-full text-left transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> {t("modules.addItem")}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
