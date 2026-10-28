"use client";

// A panel that slides in over the page: from the right on wider screens, up from the bottom on
// phones. For "more about this" content that shouldn't crowd the page. Closes with its ✕, Escape,
// or a tap outside; focus stays inside while it's open and returns to the button that opened it.
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function SidePanel({ open, onClose, title, footer = null, children }) {
  const { t } = useLanguage();
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          className={[
            "fixed z-50 flex flex-col bg-surface shadow-xl outline-none",
            // Phones: a sheet from the bottom.
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t border-line",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            // md+: a column on the right.
            "md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:w-[26rem] md:rounded-none md:rounded-l-2xl md:border-t-0 md:border-l",
            "md:data-[state=open]:slide-in-from-right md:data-[state=open]:slide-in-from-bottom-0",
            "motion-reduce:animate-none",
          ].join(" ")}
        >
          <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <Dialog.Title className="text-item font-bold text-fg">{title}</Dialog.Title>
            <Dialog.Close aria-label={t("teacher.common.close")} className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-hover">
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
          {footer ? <div className="border-t border-line px-4 py-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
