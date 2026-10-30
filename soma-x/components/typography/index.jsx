"use client";

// Text on every screen: one scale (DESIGN.md) and three tones, all from the design tokens in
// app/globals.css. A heading's level (h1–h4, for screen readers and page structure) and its look
// are chosen separately, so a dialog's h2 can look like an item title.
import { createElement } from "react";
import { cn } from "@/lib/utils";

const HEADINGS = {
    display: "text-display font-extrabold tracking-tight",
    title: "text-title font-bold",
    section: "text-section font-semibold",
    item: "text-item font-semibold",
};
const DEFAULT_HEADING = { 1: "title", 2: "section", 3: "item", 4: "item", 5: "item", 6: "item" };

const TEXTS = {
    body: "text-body",
    ui: "text-ui",
    small: "text-small",
    caption: "text-caption font-medium",
    eyebrow: "text-caption font-semibold",
};

export const TONES = {
    default: "text-fg",
    muted: "text-fg-muted",
    subtle: "text-fg-subtle",
    brand: "text-brand-fg",
    success: "text-success-fg",
    warning: "text-warning-fg",
    danger: "text-danger-fg",
    info: "text-info-fg",
    inherit: "",
};

/** <Heading level={2} variant="item">…</Heading>; variant defaults from the level. */
export function Heading({ level = 2, variant, tone = "default", as, className, children, ...props }) {
    const look = HEADINGS[variant || DEFAULT_HEADING[level]] || HEADINGS.section;
    return createElement(as || `h${level}`, { ...props, className: cn(look, TONES[tone], className) }, children);
}

/** <Text variant="small" tone="muted">…</Text>; a <p> unless `as` says otherwise. */
export function Text({ variant = "ui", tone = "default", weight, as = "p", className, children, ...props }) {
    const weights = { normal: "font-normal", medium: "font-medium", semibold: "font-semibold", bold: "font-bold" };
    return createElement(as, { ...props, className: cn(TEXTS[variant] || TEXTS.ui, TONES[tone], weight && weights[weight], variant === "eyebrow" && tone === "default" && TONES.brand, className) }, children);
}

/** The small line above a title ("Admin portal", "Week 3"): sentence case, the school's colour. */
export function Eyebrow({ className, children, ...props }) {
    return <Text variant="eyebrow" tone="brand" className={className} {...props}>{children}</Text>;
}
