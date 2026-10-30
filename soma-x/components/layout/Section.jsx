import { Heading, Text } from "@/components/typography";

// A titled region of a page. Separated by spacing and an optional top rule, never a card
// border, so sections can hold lists or tables without nesting boxes.
export default function Section({ id, title, description, actions, divided = false, className = "", children }) {
  return (
    <section id={id} className={`${divided ? "pt-6 border-t border-line" : ""} ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {title ? <Heading level={2}>{title}</Heading> : null}
            {description ? <Text variant="small" tone="muted" className="mt-0.5">{description}</Text> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
