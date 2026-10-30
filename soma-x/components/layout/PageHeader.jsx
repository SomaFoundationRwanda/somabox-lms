import Explainer from "@/components/help/Explainer";
import { Eyebrow, Heading, Text } from "@/components/typography";

// Top of a page: title, optional description and meta line, and actions on the right.
// Plain band, not a card. Use once per page. `help` is an explainer key (e.g. "pages.grades")
// shown as "What is this?" next to the title.
export default function PageHeader({ title, description, eyebrow, meta, actions, help, children }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading level={1}>{title}</Heading>
          {help ? <Explainer k={help} /> : null}
        </div>
        {description ? <Text tone="muted" className="mt-1 max-w-2xl">{description}</Text> : null}
        {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-subtle">{meta}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}
