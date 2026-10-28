"use client";

import Link from "next/link";
import {
  FileText, ClipboardList, HelpCircle, Upload, MessageSquare, Minus,
  Eye, EyeOff, Pencil, Trash2, GripVertical, Check, AlertTriangle, MoveRight,
} from "lucide-react";
import { toLocalDate } from "@/lib/dates";
import { useCourseText } from "@/components/course/useCourseText";
import { Button } from "@/components/ui/button";
import ActionMenu from "@/components/ui/ActionMenu";

// Labels come from course.modules.status.<key>; shown as small plain text on the right.
const ITEM_STATUS_HINTS = {
  upcoming: { cls: "text-info-fg" },
  past_due: { cls: "text-warning-fg" },
  closed: { cls: "text-fg-subtle" },
};

const SHORT_DATE = { weekday: "short", day: "numeric", month: "short" };

// "Opens Tue 13 Jan · Due Fri 16 Jan · Closes Sun 18 Jan" (only the parts that exist);
// "Opens Day 0 · Due Day 4" when the course has no start date yet; "No dates yet" otherwise.
function itemScheduleText(item, tf, t, locale) {
  const parts = [];
  const isPlain = item.item_type === "page" || item.item_type === "file";
  const fmt = (value) => {
    const d = toLocalDate(value);
    if (!d) return "";
    try { return d.toLocaleDateString(locale, SHORT_DATE); } catch { return d.toLocaleDateString(undefined, SHORT_DATE); }
  };
  if (item.releaseDate) {
    parts.push(tf("modules.schedule.opens", { date: fmt(item.releaseDate) }));
    if (item.dueDate) parts.push(tf("modules.schedule.due", { date: fmt(item.dueDate) }));
    if (item.closeDate) parts.push(tf("modules.schedule.closes", { date: fmt(item.closeDate) }));
    return parts.join(" | ");
  }
  const day = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const release = day(item.release_day);
  const due = isPlain ? null : day(item.due_day);
  const close = isPlain ? null : day(item.close_day);
  if (release !== null) parts.push(tf("modules.schedule.opensDay", { n: release }));
  if (due !== null) parts.push(tf("modules.schedule.dueDay", { n: due }));
  if (close !== null) parts.push(tf("modules.schedule.closesDay", { n: close }));
  // Every row shows a date: fall back to an honest "No dates yet".
  return parts.length > 0 ? parts.join(" | ") : t("home.noDatesYet");
}

const ITEM_ICONS = {
  page: FileText,
  assignment: ClipboardList,
  quiz: HelpCircle,
  file: Upload,
  discussion: MessageSquare,
  sub_header: Minus,
};

// One item as a full-width row: type icon, title with a gray subtitle (dates, points, outcome),
// and its status on the right. For teachers: a status chip in words, Publish as the one button on
// a draft, and the rest in a "⋯" menu (always visible, no hover). `weekPublished` says whether
// learners can see the week at all. `grouped` indents rows under a group label.
// dnd: from SortableItemList (teachers only); without it the row is static.
export default function ModuleItemRow({ item, courseId, isTeacher, weekPublished = true, onTogglePublish, onEdit, onDelete, onMove, grouped = false, dnd = null }) {
  const setNodeRef = dnd?.setNodeRef;
  const attributes = dnd?.attributes || {};
  const listeners = dnd?.listeners || {};
  const isDragging = Boolean(dnd?.isDragging);
  const { t, tf, locale } = useCourseText();

  const style = {
    ...(dnd?.style || {}),
    paddingLeft: `${(item.indent_level || 0) * 24 + (grouped ? 16 : 0) + 20}px`,
  };

  const Icon = ITEM_ICONS[item.item_type] || FileText;
  const isSubHeader = item.item_type === "sub_header";

  // Build link href for clickable items
  const href = isSubHeader ? null
    : item.item_type === "quiz" ? `/course/${courseId}/quizzes/${item.content_id}`
    : item.item_type === "page" ? `/course/${courseId}/pages/${item.content_id}`
    : item.item_type === "assignment" ? `/course/${courseId}/assignments/${item.content_id}`
    : item.item_type === "discussion" ? `/course/${courseId}/discussions/${item.content_id}`
    : `/course/${courseId}/files`;

  const schedule = itemScheduleText(item, tf, t, locale);
  const statusHint = ITEM_STATUS_HINTS[item.status];

  // Sub-header rendering
  if (isSubHeader) {
    return (
      <li
        ref={setNodeRef}
        style={style}
        className={`flex items-center justify-between gap-2 pr-5 py-3.5 ${isDragging ? "opacity-40 bg-warning-soft" : ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isTeacher && (
            <button {...attributes} {...listeners} aria-label={t("modules.dragSubHeader")} className="cursor-grab active:cursor-grabbing p-0.5 text-fg-subtle hover:text-fg-subtle shrink-0">
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-ui font-bold text-fg-muted truncate">
            {item.title}
          </span>
        </div>
        {isTeacher && (
          <ActionMenu
            label={tf("modules.itemActions", { title: item.title })}
            items={[
              { key: "edit", label: t("modules.renameSubHeader"), icon: Pencil, onSelect: onEdit },
              { key: "delete", label: t("common.delete"), icon: Trash2, onSelect: onDelete, danger: true },
            ]}
          />
        )}
      </li>
    );
  }

  const outcomes = Array.isArray(item.outcomes) ? item.outcomes : [];
  const needsOutcome =
    item.item_type === "assignment" ||
    (item.item_type === "quiz" && item.quiz_kind !== "practice");
  const hasOutcomeTag = outcomes.length > 0;

  // Subtitle: dates, points, and the outcome tag in one line of plain gray text.
  const points = item.item_type === "assignment" && item.points_possible != null && item.points_possible !== ""
    ? tf("modules.points", { n: Number(item.points_possible) }) : null;
  const outcomeText = hasOutcomeTag
    ? tf("modules.target", { outcomes: outcomes.map((o) => o.code || o.title).filter(Boolean).join(", ") || t("modules.outcomeTagged") })
    : null;
  const subtitle = [schedule, points, outcomeText].filter(Boolean).join(" | ");
  const isComplete = item.completed === true || item.complete === true || Boolean(item.completed_at);

  // Normal item rendering
  const TitleContent = (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <Icon className={`w-4 h-4 shrink-0 ${item.published ? "text-brand-fg" : "text-fg-subtle"}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-ui truncate font-semibold ${item.published ? "text-fg" : "text-fg-subtle italic"}`}>
          {item.title}
        </p>
        {subtitle ? (
          <p
            className="text-caption text-fg-subtle truncate mt-0.5"
            title={hasOutcomeTag ? outcomes.map((o) => [o.code, o.title].filter(Boolean).join(" — ")).join("\n") : undefined}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );

  // Right edge: status (complete, missing outcome, not open yet / past due / closed) and, for
  // teachers, whether learners can see it, in words.
  const visibility = !isTeacher ? null
    : !item.published ? { text: t("common.draft"), cls: "bg-surface-sunken text-fg-muted border-line" }
    : !weekPublished ? { text: t("modules.hiddenByWeek"), cls: "bg-warning-soft text-warning-fg border-warning/30" }
    : { text: t("common.published"), cls: "bg-success-soft text-success-fg border-success/30" };
  const Status = (
    <div className="flex items-center gap-2 shrink-0 text-caption">
      {isTeacher && needsOutcome && !hasOutcomeTag ? (
        <span className="inline-flex items-center gap-1 text-warning-fg">
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
          {t("modules.missingOutcome")}
        </span>
      ) : null}
      {statusHint ? <span className={statusHint.cls}>{t(`modules.status.${item.status}`)}</span> : null}
      {isComplete ? <Check className="w-4 h-4 text-success-fg" aria-label={t("modules.complete")} /> : null}
      {visibility ? <span className={`font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${visibility.cls}`}>{visibility.text}</span> : null}
    </div>
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-3 pr-5 py-3.5 group ${isDragging ? "opacity-40 bg-info-soft" : "hover:bg-surface-hover/80"}`}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {isTeacher && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-fg-subtle hover:text-fg-muted shrink-0" aria-label={t("modules.dragItem")}>
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        {href ? (
          <Link href={href} className="flex items-center gap-2 min-w-0 flex-1 hover:text-brand-fg rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {TitleContent}
          </Link>
        ) : (
          TitleContent
        )}
      </div>

      {Status}

      {isTeacher && (
        <div className="flex items-center gap-1 shrink-0">
          {!item.published ? (
            <Button type="button" size="sm" variant="outline" onClick={onTogglePublish} aria-label={tf("modules.publishNamed", { title: item.title })}>
              {t("modules.publish")}
            </Button>
          ) : null}
          <ActionMenu
            label={tf("modules.itemActions", { title: item.title })}
            items={[
              { key: "edit", label: t("common.edit"), icon: Pencil, onSelect: onEdit },
              item.published ? { key: "unpublish", label: t("modules.unpublish"), icon: EyeOff, onSelect: onTogglePublish } : { key: "publish", label: t("modules.publish"), icon: Eye, onSelect: onTogglePublish },
              onMove ? { key: "move", label: t("modules.moveToWeek"), icon: MoveRight, onSelect: onMove } : null,
              { separator: true },
              { key: "delete", label: t("common.delete"), icon: Trash2, onSelect: onDelete, danger: true },
            ]}
          />
        </div>
      )}
    </li>
  );
}
