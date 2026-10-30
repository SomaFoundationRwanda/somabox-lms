"use client";

// Leaving a form with unsaved changes asks first: Save, Discard, or keep editing. Covers the
// form's own close/cancel/back buttons (confirmLeave), links elsewhere in the app, and closing
// or refreshing the tab (the browser's own question).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";

/**
 * dirty: the form has changes not saved yet. onSave(): saves them; resolves true when it worked.
 * Returns { confirmLeave(next), dialog }: call confirmLeave with what leaving does (e.g. onClose)
 * and render `dialog`.
 */
export default function useUnsavedChanges({ dirty, onSave }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [pending, setPending] = useState(null); // { next } while the question is open
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const confirmLeave = useCallback((next) => {
    if (!dirtyRef.current) { next?.(); return; }
    setPending({ next });
  }, []);

  // Refreshing or closing the tab: the browser asks (drafts are kept anyway).
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // A link to another page of the app while there are changes: ask first.
  useEffect(() => {
    if (!dirty) return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ next: () => router.push(`${url.pathname}${url.search}${url.hash}`) });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, router]);

  const leave = () => {
    const next = pending?.next;
    setPending(null);
    // The page may unmount: stop asking before going.
    dirtyRef.current = false;
    next?.();
  };

  const saveAndLeave = async () => {
    setSaving(true);
    try {
      const ok = await onSave?.();
      if (ok === false) return;
      leave();
    } finally {
      setSaving(false);
    }
  };

  const dialog = pending ? (
    <Modal title={t("shell.unsaved.title")} onClose={() => setPending(null)} dirty>
      <p className="text-ui text-fg-muted">{t("shell.unsaved.body")}</p>
      <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setPending(null)} disabled={saving}>{t("shell.unsaved.keepEditing")}</Button>
        <Button type="button" variant="outline" onClick={leave} disabled={saving}>{t("shell.unsaved.discard")}</Button>
        {onSave ? <Button type="button" onClick={saveAndLeave} disabled={saving}>{saving ? t("shell.unsaved.saving") : t("shell.unsaved.save")}</Button> : null}
      </div>
    </Modal>
  ) : null;

  return { confirmLeave, dialog };
}
