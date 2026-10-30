"use client";

import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { editItemHref, newItemHref } from "@/components/course/modules/useItemEditor";
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
import ModuleCard from "@/components/course/modules/ModuleCard";
import DeleteItemDialog from "@/components/course/modules/DeleteItemDialog";
import useAiStatus from "@/lib/useAiStatus";
import { AiStatusNote } from "@/components/ai/AiBits";
import Loader from "@/components/ui/Loader";
import { Label, TextInput } from "@/components/form";
import { todayIn } from "@somabox/timeline";

// Teacher-only code is loaded on demand so learners on low-end devices don't download it:
// drag-and-drop for teachers (the item editors are pages of their own).

// Labels come from course.items.<value>.
const ITEM_TYPE_OPTIONS = [
  { value: "page" },
  { value: "assignment" },
  { value: "quiz" },
  { value: "file" },
  { value: "sub_header" },
  { value: "discussion" },
];

// The kinds of item a teacher can show on their own (Weeks filter).
const ITEM_FILTERS = ["all", "page", "assignment", "quiz", "discussion", "file"];

// Teachers: the weeks wait for the drag-and-drop code (items are reordered by dragging), so the
// rows aren't swapped for draggable ones under the teacher's hand (a menu opened on one would
// vanish with it).
const DragReady = lazy(() => import("@/components/course/modules/sortable").then(() => ({ default: ({ children }) => children })));

export default function ModulesPage() {
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { data: modules, loading, error } = useCourseSection("modules");
  const queryClient = useQueryClient();
  // After a teacher's change on this page: the weeks, and everything else that lists or counts
  // items (pages, quizzes, assignments, outcome tags, setup status, calendar); not the course's
  // own details, menu or people.
  const refetch = useCallback(() => queryClient.invalidateQueries({
    predicate: ({ queryKey: [scope, id, section] }) =>
      scope === "course" && id === String(courseId) && !["info", "nav", "people", "join-code", "ai"].includes(section),
  }), [queryClient, courseId]);
  const { showToast } = useToast();
  const aiStatus = useAiStatus();
  const { t, tf } = useCourseText();

  // AI: pending drafts and running jobs, for the header link and per-week buttons. While jobs
  // run (and only then) both are asked again every few seconds, so counts and buttons stay current.
  const activeJobsKey = queryKeys.courseSection(courseId, "ai/jobs/active");
  const aiReady = !!SERVER_URL && !!courseId && isTeacher;
  const jobsQuery = useQuery({
    queryKey: activeJobsKey,
    queryFn: () => apiFetch(`/courses/${courseId}/ai/jobs?active=1`),
    enabled: aiReady,
    refetchInterval: (q) => (q.state.data?.length ? 5000 : false),
  });
  const aiActiveJobs = Array.isArray(jobsQuery.data) ? jobsQuery.data : [];
  const draftsQuery = useQuery({
    queryKey: queryKeys.courseSection(courseId, "ai/drafts/pending"),
    queryFn: () => apiFetch(`/courses/${courseId}/ai/drafts?status=pending`),
    enabled: aiReady,
    refetchInterval: aiActiveJobs.length ? 5000 : false,
  });
  const aiPendingCount = Array.isArray(draftsQuery.data) ? draftsQuery.data.length : 0;
  // Learners see one week open: the one a "#module-<id>" link points to, else the week they're
  // in, else the next one to come (or the last, once the course is over). The rest open on a tap.
  const [openWeekId, setOpenWeekId] = useState(null);
  useEffect(() => {
    if (isTeacher || !modules?.length || typeof window === "undefined") return;
    const hashId = window.location.hash.startsWith("#module-") ? window.location.hash.slice("#module-".length) : null;
    const today = todayIn();
    const dated = modules.filter((m) => m.kind === "regular" || m.kind === "baseline");
    const pick = modules.find((m) => String(m.id) === hashId)
      || dated.find((m) => m.startDate && m.endDate && m.startDate <= today && today <= m.endDate)
      || dated.find((m) => m.endDate && m.endDate >= today)
      || dated[dated.length - 1];
    setOpenWeekId(pick ? String(pick.id) : "none");
  }, [isTeacher, modules]);
  // "#module-<id>" links (from the Home timeline) scroll to that week once the list has loaded.
  useEffect(() => {
    if (!modules?.length || typeof window === "undefined" || (!isTeacher && !openWeekId)) return;
    const id = window.location.hash.slice(1);
    if (id.startsWith("module-")) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [modules, isTeacher, openWeekId]);
  const aiProps = { status: aiStatus, activeJobs: aiActiveJobs, onStarted: (job) => queryClient.setQueryData(activeJobsKey, (list) => [...(list || []), job]) };

  // Sends a change; on failure shows the server message and throws so editor modals stay open.
  // On success, surfaces any `notice` (e.g. a graded item saved unpublished because it has no
  // outcome tag).
  const request = async (path, options, fallbackError) => {
    let payload;
    try {
      payload = await apiFetch(path, options);
    } catch (err) {
      const message = err?.status === 0 ? getErrorMessage(err) : err?.body?.message || fallbackError;
      showToast(message, "error");
      throw new Error(message);
    }
    if (payload?.notice) showToast(payload.notice, "info", 7000);
    return payload;
  };

  // Module creation
  const [creating, setCreating] = useState(false);
  // Teachers find a kind of item here (the separate Pages/Assignments/Quizzes/Discussions lists
  // aren't in their menu); ?type=assignment opens the page filtered.
  const searchParams = useSearchParams();
  const [typeFilter, setTypeFilter] = useState(() => (ITEM_FILTERS.includes(searchParams?.get("type")) ? searchParams.get("type") : "all"));
  const [newTitle, setNewTitle] = useState("");

  // Add item flow
  const [addingItemFor, setAddingItemFor] = useState(null); // module object
  const [selectedItemType, setSelectedItemType] = useState("page");
  const [helperOpen, setHelperOpen] = useState(false);
  const { explain } = useLanguage();
  const [subHeaderTitle, setSubHeaderTitle] = useState("");

  const router = useRouter();

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState({ open: false, module: null, item: null });

  // ===== Module CRUD =====
  const createModule = async () => {
    if (!newTitle.trim()) return;
    try { await request(`/courses/${courseId}/modules`, { method: "POST", json: { title: newTitle.trim() } }, t("modules.errors.createModule")); } catch { return; }
    setNewTitle("");
    setCreating(false);
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

    // Everything else is written on its own page, with room for it (and a real Back).
    setAddingItemFor(null);
    router.push(newItemHref(courseId, moduleId, selectedItemType, selectedItemType === "quiz" ? quizKind : undefined));
  };

  const createSubHeader = async (moduleId, title) => {
    try { await request(`/courses/${courseId}/modules/${moduleId}/items`, { method: "POST", json: { itemType: "sub_header", title } }, t("modules.errors.addSubHeader")); } catch { return; }
    setAddingItemFor(null);
    setSubHeaderTitle("");
    refetch();
  };

  // ===== Edit item =====
  const handleEditItem = useCallback(async (moduleRow, item) => {
    if (item.item_type === "sub_header") {
      const newTitle = prompt(t("modules.editSubHeaderPrompt"), item.title);
      if (newTitle !== null && newTitle.trim()) {
        try {
          await request(`/courses/${courseId}/modules/${moduleRow.id}/items/${item.id}`, { method: "PATCH", json: { title: newTitle.trim() } }, t("modules.errors.renameSubHeader"));
        } catch { /* toast shown */ }
        refetch();
      }
      return;
    }

    // Everything else is edited on its own page.
    if (item.content_id && ["page", "assignment", "quiz", "discussion"].includes(item.item_type)) {
      router.push(editItemHref(courseId, item.item_type, item.content_id));
    }
  }, [courseId, queryClient, refetch, showToast, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Delete item =====
  const handleDeleteItem = (moduleRow, item) => {
    setDeleteTarget({ open: true, module: moduleRow, item });
  };

  const removeFromModule = async () => {
    const { module: m, item } = deleteTarget;
    try {
      await request(`/courses/${courseId}/modules/${m.id}/items/${item.id}?mode=remove_from_module`, { method: "DELETE" }, t("modules.errors.removeItem"));
    } catch { /* toast shown */ }
    refetch();
  };

  const deletePermanently = async () => {
    const { module: m, item } = deleteTarget;
    try {
      await request(`/courses/${courseId}/modules/${m.id}/items/${item.id}?mode=delete_permanently`, { method: "DELETE" }, t("modules.errors.deleteItem"));
    } catch { /* toast shown */ }
    refetch();
  };

  const chooseFromHelper = ({ moduleId, itemType, kind }) => {
    const moduleRow = (modules || []).find((m) => Number(m.id) === Number(moduleId));
    setHelperOpen(false);
    if (moduleRow) openCreator(moduleRow, itemType, kind);
  };
  const selectedExplainer = explain(`items.${selectedItemType}`).entry;

  // The first regular week starts on the course's start date (changed in Settings).
  const regularOffsets = (modules || []).filter((m) => m.kind === "regular").map((m) => Number(m.week_offset));
  const firstWeekOffset = regularOffsets.length ? Math.min(...regularOffsets) : null;
  const renderTeacherModule = (moduleRow, dnd = null) => (
    <ModuleCard
      key={moduleRow.id}
      module={moduleRow}
      courseId={courseId}
      isTeacher={isTeacher}
      onRefetch={refetch}
      onAddItem={handleAddItem}
      onEditItem={handleEditItem}
      onDeleteItem={handleDeleteItem}
      ai={aiProps}
      dnd={typeFilter === "all" ? dnd : null}
      isFirstWeek={moduleRow.kind === "regular" && Number(moduleRow.week_offset) === firstWeekOffset}
      itemFilter={typeFilter}
      weeks={modules || []}
    />
  );

  return (
    <div>
      <Breadcrumbs sectionKey="modules" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader help="pages.modules"
          title={t("modules.title")}
          actions={isTeacher ? (
            <>
            <Link
              href={`/course/${courseId}/ai`}
              className="flex items-center gap-1.5 text-caption font-semibold text-info-fg border border-info/30 hover:bg-info-soft rounded-lg px-3 py-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> {t("nav.ai")}
              {aiPendingCount > 0 ? (
                <span className="rounded-full bg-info text-on-info text-caption font-bold px-1.5 py-0.5" aria-label={tf("modules.waitingForReview", { n: aiPendingCount })}>{aiPendingCount}</span>
              ) : null}
              {aiActiveJobs.length > 0 ? (
                <span className="text-caption font-semibold text-info-fg">{tf("modules.running", { n: aiActiveJobs.length })}</span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={() => setHelperOpen(true)}
              disabled={!modules || modules.filter((m) => m.kind !== "unassigned").length === 0}
              className="flex items-center gap-1.5 text-caption font-semibold text-brand-fg border border-line hover:bg-surface-hover disabled:opacity-40 rounded-lg px-3 py-2 transition-colors"
            >
              {explain("helper").entry?.button || "What should I create?"}
            </button>
            <button
              onClick={() => setCreating((v) => !v)}
              aria-expanded={creating}
              className="flex items-center gap-1.5 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 rounded-lg px-3 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t("modules.addModule")}
            </button>
            </>
          ) : null}
        />

        {isTeacher ? <AiStatusNote status={aiStatus} /> : null}

        {isTeacher && modules && modules.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={t("modules.filterLabel")}>
            {ITEM_FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTypeFilter(key)}
                aria-pressed={typeFilter === key}
                className={`text-caption font-semibold px-2.5 py-1 rounded-full border ${typeFilter === key ? "bg-brand-strong text-on-brand-strong border-brand-strong" : "border-line text-fg-muted hover:bg-surface-hover"}`}
              >
                {key === "all" ? t("modules.filterAll") : t(`modules.filter.${key}`)}
              </button>
            ))}
          </div>
        ) : null}

        {/* Create module form */}
        {creating && (
          <div className="flex flex-wrap items-center gap-2">
            <TextInput value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createModule(); }} placeholder={t("modules.newModulePlaceholder")} aria-label={t("modules.newModuleTitle")} className="flex-1 min-w-[12rem]" autoFocus />
            <button onClick={createModule} className="text-caption font-semibold text-on-brand-strong bg-brand-strong rounded-lg px-3 py-2">
              {t("common.create")}
            </button>
            <button onClick={() => setCreating(false)} className="text-caption text-fg-subtle hover:text-fg-muted px-2">
              {t("common.cancel")}
            </button>
          </div>
        )}

        {/* Loading / Error */}
        {loading && <Loader variant="page" size={56} className="min-h-[30vh]" label={t("modules.loading")} />}
        {error && <p className="text-ui text-danger-fg">{error}</p>}
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
            <div className="space-y-10">
              {/* Weeks follow their dates (Week 0, then past, this week, upcoming): a week moves by
                  changing its date (its ⋯ menu), not by dragging. */}
              <Suspense fallback={<Loader variant="page" size={48} className="min-h-[20vh]" label={t("modules.loading")} />}>
                <DragReady>{modules.map((moduleRow) => renderTeacherModule(moduleRow))}</DragReady>
              </Suspense>
            </div>
          ) : (
            <div className="space-y-6">
              {openWeekId ? modules.map((moduleRow) => (
                <ModuleCard
                  key={moduleRow.id}
                  module={moduleRow}
                  courseId={courseId}
                  isTeacher={false}
                  defaultCollapsed={(moduleRow.kind === "regular" || moduleRow.kind === "baseline") && String(moduleRow.id) !== openWeekId}
                  onRefetch={refetch}
                  onAddItem={() => {}}
                  onEditItem={() => {}}
                  onDeleteItem={() => {}}
                />
              )) : <Loader variant="page" size={48} className="min-h-[20vh]" label={t("modules.loading")} />}
            </div>
          )
        )}

        {/* Add Item Drawer (shown inline when a module is selected) */}
        {addingItemFor && (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-surface rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl mx-0 sm:mx-4 p-5 animate-in slide-in-from-bottom-4 duration-200">
              <h3 className="text-ui font-bold text-fg mb-3">
                {t("modules.addItemTo")} <span className="text-brand-fg">{addingItemFor.title}</span>
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="block text-caption font-semibold text-fg-muted mb-1.5">{t("modules.itemType")}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {ITEM_TYPE_OPTIONS.map((opt) => (
                      <div key={opt.value} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedItemType(opt.value)}
                          aria-pressed={selectedItemType === opt.value}
                          className={`flex-1 text-caption font-medium py-2 rounded-lg border transition-colors ${
                            selectedItemType === opt.value
                              ? "border-brand-strong bg-brand-strong text-on-brand-strong"
                              : "border-line text-fg-muted hover:border-line-strong"
                          }`}
                        >
                          {t(`items.${opt.value}`)}
                        </button>
                        <Explainer k={`items.${opt.value}`} variant="icon" align={["quiz", "sub_header"].includes(opt.value) ? "right" : "left"} />
                      </div>
                    ))}
                  </div>
                  {selectedExplainer ? (
                    <p className="mt-2 text-caption text-fg-subtle">
                      {selectedExplainer.what} <span className="text-fg-subtle">{selectedExplainer.when}</span>
                    </p>
                  ) : null}
                </div>

                {selectedItemType === "sub_header" && (
                  <div>
                    <Label htmlFor="new-subheader-title">{t("modules.subHeaderTitle")}</Label>
                    <TextInput id="new-subheader-title" value={subHeaderTitle} onChange={(e) => setSubHeaderTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") startItemCreation(); }} placeholder={t("modules.subHeaderPlaceholder")} className="w-full" autoFocus />
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={startItemCreation}
                    disabled={selectedItemType === "sub_header" && !subHeaderTitle.trim()}
                    className="flex-1 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg py-2.5 transition-colors"
                  >
                    {t(`modules.addType.${selectedItemType}`)}
                  </button>
                  <button
                    onClick={() => setAddingItemFor(null)}
                    className="text-caption font-medium text-fg-subtle hover:text-fg-muted px-3 py-2.5"
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
