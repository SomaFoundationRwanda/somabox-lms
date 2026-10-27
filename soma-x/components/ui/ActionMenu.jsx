"use client";

// The "⋯" menu for a row or a page: the less common actions on one thing (edit, move, AI help,
// delete...), so the screen shows only its main action as a button. Always visible (no hover),
// labelled for screen readers. items: [{ key, label, icon, onSelect | href, danger, disabled }]
// with null entries skipped; a { separator: true } entry draws a line.
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function ActionMenu({ label, items, className }) {
  const shown = (items || []).filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", className)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem] bg-surface-raised border-line">
        {shown.map((item, i) => {
          if (item.separator) return <DropdownMenuSeparator key={`sep-${i}`} className="bg-line" />;
          const Icon = item.icon;
          const content = (
            <>
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
              <span>{item.label}</span>
            </>
          );
          return (
            <DropdownMenuItem
              key={item.key || item.label}
              disabled={item.disabled}
              variant={item.danger ? "destructive" : "default"}
              onSelect={item.onSelect}
              asChild={!!item.href}
              className={cn("cursor-pointer text-fg", item.danger && "text-danger-fg")}
            >
              {item.href ? <Link href={item.href}>{content}</Link> : content}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
