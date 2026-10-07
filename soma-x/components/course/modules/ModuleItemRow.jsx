"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FileText, ClipboardList, HelpCircle, Upload, MessageSquare, Minus,
  Eye, EyeOff, Pencil, Trash2, GripVertical,
} from "lucide-react";
import { formatDate } from "@/lib/dates";

const ITEM_STATUS_HINTS = {
  upcoming: { label: "Not open yet", cls: "text-sky-700 bg-sky-50 border-sky-200" },
  past_due: { label: "Past due", cls: "text-amber-700 bg-amber-50 border-amber-200" },
  closed: { label: "Closed", cls: "text-slate-500 bg-slate-50 border-slate-200" },
};

const SHORT_DATE = { weekday: "short", day: "numeric", month: "short" };

// "Opens Tue 13 Jan · Due Fri 16 Jan · Closes Sun 18 Jan" (only the parts that exist);
// "Opens Day 0 · Due Day 4" when the course has no start date yet.
function itemScheduleText(item) {
  const parts = [];
  const isPlain = item.item_type === "page" || item.item_type === "file";
  if (item.releaseDate) {
    parts.push(`Opens ${formatDate(item.releaseDate, SHORT_DATE)}`);
    if (item.dueDate) parts.push(`Due ${formatDate(item.dueDate, SHORT_DATE)}`);
    if (item.closeDate) parts.push(`Closes ${formatDate(item.closeDate, SHORT_DATE)}`);
    return parts.join(" · ");
  }
  const day = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const release = day(item.release_day);
  const due = isPlain ? null : day(item.due_day);
  const close = isPlain ? null : day(item.close_day);
  if (release !== null && (release > 0 || due !== null)) parts.push(`Opens Day ${release}`);
  if (due !== null) parts.push(`Due Day ${due}`);
  if (close !== null) parts.push(`Closes Day ${close}`);
  return parts.join(" · ");
}

const ITEM_ICONS = {
  page: FileText,
  assignment: ClipboardList,
  quiz: HelpCircle,
  file: Upload,
  discussion: MessageSquare,
  sub_header: Minus,
};

export default function ModuleItemRow({ item, courseId, isTeacher, onTogglePublish, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${(item.indent_level || 0) * 24 + 16}px`,
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

  const schedule = itemScheduleText(item);
  const statusHint = ITEM_STATUS_HINTS[item.status];

  // Sub-header rendering
  if (isSubHeader) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center justify-between gap-2 pr-3 py-2 ${isDragging ? "opacity-40 bg-amber-50" : "bg-slate-50/60"}`}
        {...attributes}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isTeacher && (
            <button {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-500 shrink-0">
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500 truncate">
            {item.title}
          </span>
        </div>
        {isTeacher && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onEdit} className="p-1 rounded hover:bg-white text-slate-400" title="Edit">
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-white text-rose-400" title="Delete">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  const outcomes = Array.isArray(item.outcomes) ? item.outcomes : [];
  const needsOutcome =
    item.item_type === "assignment" ||
    (item.item_type === "quiz" && item.quiz_kind !== "practice");
  const hasOutcomeTag = outcomes.length > 0;

  // Normal item rendering
  const TitleContent = (
    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
      <Icon className={`w-4 h-4 shrink-0 ${item.published ? "text-[#0D9488]" : "text-slate-300"}`} />
      <span className={`text-sm truncate font-medium ${item.published ? "text-slate-800" : "text-slate-400 italic"}`}>
        {item.title}
      </span>

      {/* Outcome Badges */}
      {hasOutcomeTag ? (
        <span
          className="text-[10px] font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full shrink-0 ml-1"
          title={outcomes.map((o) => [o.code, o.title].filter(Boolean).join(" — ")).join("\n")}
        >
          Target: {outcomes.map((o) => o.code || o.title).filter(Boolean).join(", ") || "Outcome Tagged"}
        </span>
      ) : needsOutcome ? (
        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0 ml-1">
          ⚠️ Missing Outcome
        </span>
      ) : null}

      {/* Resolved dates (falls back to day offsets when the course has no start date) */}
      {(schedule || statusHint) && (
        <div className="flex items-center gap-1.5 ml-auto text-[11px] text-slate-500 shrink-0">
          {schedule && <span>{schedule}</span>}
          {statusHint && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${statusHint.cls}`}>
              {statusHint.label}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 pr-3 py-2 group ${isDragging ? "opacity-40 bg-blue-50" : "hover:bg-slate-50/80"}`}
      {...attributes}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {isTeacher && (
          <button {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 text-slate-200 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        {href ? (
          <Link href={href} className="flex items-center gap-2 min-w-0 flex-1 hover:text-[#203A3A]">
            {TitleContent}
          </Link>
        ) : (
          TitleContent
        )}
      </div>

      {isTeacher && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onTogglePublish} className="p-1 rounded hover:bg-white" title={item.published ? "Unpublish" : "Publish"}>
            {item.published ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
          </button>
          <button onClick={onEdit} className="p-1 rounded hover:bg-white text-slate-400" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-white text-rose-400" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
