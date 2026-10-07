import Image from "next/image";
import Typography from "@/components/ui/Typography";

// Honest empty state: what's missing, why, and (optionally) the next step.
// `message` alone keeps the older illustrated look; pass `title`/`description`/`action`
// (and optionally `icon`) for the compact version used inside sections.
export function EmptyState({ message, title, description, action, icon, compact = false }) {
  if (title || compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-8 text-center">
        {icon ? <span className="text-slate-300">{icon}</span> : null}
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title || message}</p>
        {description ? <p className="max-w-md text-xs text-slate-500">{description}</p> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="relative w-48 h-48 opacity-80">
        <Image src="/images/no-contents.jpg" alt="" fill className="object-contain" />
      </div>
      <Typography variant="muted" className="text-sm">
        {message || "No content available yet"}
      </Typography>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
