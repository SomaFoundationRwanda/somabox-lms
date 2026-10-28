"use client";

// A week item's editor as a page of its own (teachers):
//   new:  /course/<id>/modules/new?week=<moduleId>&type=<page|assignment|quiz|discussion|file>[&kind=practice]
//   edit: /course/<id>/modules/edit?type=<page|assignment|quiz|discussion>&id=<contentId>
// Creating goes back to the week; editing goes to the item's own page; ?back= overrides both.
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";
import PageEditorModal from "./editors/PageEditorModal";
import AssignmentEditorModal from "./editors/AssignmentEditorModal";
import QuizEditorModal from "./editors/QuizEditorModal";
import DiscussionEditor from "./editors/DiscussionEditor";
import FileUploadModal from "./editors/FileUploadModal";
import { itemDays, useItemEditor } from "./useItemEditor";

const TYPES = ["page", "assignment", "quiz", "discussion", "file"];
const ITEM_PAGE = { page: "pages", assignment: "assignments", quiz: "quizzes", discussion: "discussions" };

function Editor({ mode }) {
  const { courseId, isTeacher } = useCourse();
  const { t } = useCourseText();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const type = TYPES.includes(params.get("type")) ? params.get("type") : null;
  const { data: modules } = useCourseSection("modules");
  const { save, load, invalidate } = useItemEditor();
  const [data, setData] = useState(null);

  // The week, and for an edit the week item (its id, days and outcome tags).
  const { moduleRow, item } = useMemo(() => {
    const list = Array.isArray(modules) ? modules : [];
    if (mode === "new") return { moduleRow: list.find((m) => String(m.id) === params.get("week")) || null, item: null };
    for (const m of list) {
      const found = (m.items || []).find((i) => i.item_type === type && String(i.content_id) === params.get("id"));
      if (found) return { moduleRow: m, item: found };
    }
    return { moduleRow: null, item: null };
  }, [modules, mode, params, type]);

  useEffect(() => {
    if (mode === "edit" && item && type) load(type, item.content_id).then(setData).catch(() => setData(null));
  }, [mode, item, type, load]);

  if (!isTeacher || !type) return null;
  if (!modules || (mode === "edit" && item && !data)) return <Loader variant="page" className="min-h-[50vh]" />;
  if (!moduleRow || (mode === "edit" && !item)) return <p className="p-6 text-ui text-fg-muted">{t("editors.notFound")}</p>;

  const weekHref = `/course/${courseId}/modules#module-${moduleRow.id}`;
  const itemHref = item ? `/course/${courseId}/${ITEM_PAGE[type]}/${item.content_id}` : weekHref;
  // ?back=<course address> returns there instead (e.g. to the course's setup steps).
  const backTo = params.get("back");
  const back = () => router.push(backTo && backTo.startsWith(`/course/${courseId}/`) ? backTo : mode === "edit" ? itemHref : weekHref);
  const onSave = async (values) => {
    await save(type, { moduleId: moduleRow.id, itemId: item?.id, contentId: item?.content_id, outcomeIdsBefore: (item?.outcomes || []).map((o) => Number(o.id)) }, values);
    showToast(mode === "edit" ? t("editors.saved") : t("editors.added"), "success");
  };
  const common = { asPage: true, open: true, onClose: back, onSave };
  const days = item ? itemDays(item) : null;
  const startDate = moduleRow.startDate || null;

  if (type === "page") return <PageEditorModal {...common} initialData={data} />;
  if (type === "assignment") return <AssignmentEditorModal {...common} initialData={data} initialDays={days} moduleStartDate={startDate} initialOutcomeIds={(item?.outcomes || []).map((o) => Number(o.id))} />;
  if (type === "quiz") return <QuizEditorModal {...common} initialData={data || (params.get("kind") ? { kind: params.get("kind") } : null)} initialDays={days} moduleStartDate={startDate} />;
  if (type === "discussion") return <DiscussionEditor {...common} initialData={data} />;
  return <FileUploadModal asPage open onClose={back} onUpload={() => { invalidate(); showToast(t("editors.added"), "success"); }} courseId={courseId} moduleId={moduleRow.id} />;
}

export default function ItemEditorPage({ mode }) {
  return (
    <Suspense fallback={<Loader variant="page" className="min-h-[50vh]" />}>
      <Editor mode={mode} />
    </Suspense>
  );
}
