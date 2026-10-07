"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FileText, ClipboardList, HelpCircle, Upload, MessageSquare, Minus,
  Eye, EyeOff, Pencil, Trash2, GripVertical,
} from "lucide-react";

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
    : item.item_type === "quiz" ? `/course/${courseId}/quizzes/${item.content_ref_id || item.item_ref_id}`
    : item.item_type === "page" ? `/course/${courseId}/pages/${item.content_ref_id || item.item_ref_id}`
    : item.item_type === "assignment" ? `/course/${courseId}/assignments/${item.content_ref_id || item.item_ref_id}`
    : item.item_type === "discussion" ? `/course/${courseId}/discussions/${item.content_ref_id || item.item_ref_id}`
    : `/course/${courseId}/files`;

  const formatDate = (d) => {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return null; }
  };

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

  const isGradedItem = ["assignment", "quiz"].includes(item.item_type);
  const hasOutcomeTag = item.outcome_title || item.outcomes?.length > 0;

  // Normal item rendering
  const TitleContent = (
    <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
      <Icon className={`w-4 h-4 shrink-0 ${item.published ? "text-[#0D9488]" : "text-slate-300"}`} />
      <span className={`text-sm truncate font-medium ${item.published ? "text-slate-800" : "text-slate-400 italic"}`}>
        {item.title}
      </span>

      {/* Outcome Badges */}
      {hasOutcomeTag ? (
        <span className="text-[10px] font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full shrink-0 ml-1">
          Target: {item.outcome_title || item.outcomes?.[0]?.title || "Outcome Tagged"}
        </span>
      ) : isGradedItem ? (
        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0 ml-1">
          ⚠️ Missing Outcome
        </span>
      ) : null}

      {/* Relative Offsets & Resolved Dates */}
      <div className="flex items-center gap-2 ml-auto text-[11px] text-slate-400 shrink-0">
        <span>Rel: Day {item.release_day || 0}</span>
        <span>·</span>
        <span>Due: Day {item.due_day || 7}</span>
        {item.due_at && <span className="font-semibold text-slate-600">({formatDate(item.due_at)})</span>}
      </div>
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
