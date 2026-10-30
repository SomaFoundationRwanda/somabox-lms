"use client";

import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";
import { Text } from "@/components/typography";

// Honest empty state: what's missing, why, and (optionally) the next step.
// `message` alone keeps the older illustrated look; pass `title`/`description`/`action`
// (and optionally `icon`) for the compact version used inside sections.
export function EmptyState({ message, title, description, action, icon, compact = false }) {
  const t = useLanguage()?.t;
  if (title || compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center">
        {icon ? <span className="text-fg-subtle">{icon}</span> : null}
        <p className="text-ui font-semibold text-fg-muted">{title || message}</p>
        {description ? <p className="max-w-md text-caption text-fg-subtle">{description}</p> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="relative w-48 h-48 opacity-80">
        <Image src="/images/no-contents.jpg" alt="" fill className="object-contain" />
      </div>
      <Text tone="muted">
        {message || (t?.("shell.common.noContentYet") ?? "No content available yet")}
      </Text>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
