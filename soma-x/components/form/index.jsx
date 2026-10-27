"use client";

// The app's form controls: every text box, dropdown, text area, checkbox, choice, file picker
// and slider comes from here, so they look and behave the same on every screen (size, border, focus ring in the
// school's colour, dark mode, disabled and error states).
//
//   <Field label={t("...")} hint={...} error={errors.name} required>
//     <TextInput value={name} onChange={(e) => setName(e.target.value)} />
//   </Field>
//
// A control inside a Field gets its id, label, hint and error wired up (aria-describedby,
// aria-invalid) without passing them. Outside a Field, give it an aria-label.
import { createContext, forwardRef, useContext, useId, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Checkbox as CheckboxBox } from "@/components/ui/checkbox";

/** The bare checkbox (no label), e.g. to select table rows; give it an aria-label. */
export { CheckboxBox as Checkbox };
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const FieldContext = createContext(null);

const LABEL = "block text-caption font-semibold text-fg-muted";
const HINT = "text-caption text-fg-subtle";
const ERROR = "text-caption font-semibold text-danger-fg";

const SIZES = { sm: "h-9 text-caption", md: "h-10 text-ui", lg: "h-11 text-ui" };
const BASE = "w-full rounded-lg border bg-surface px-3 text-fg placeholder:text-fg-subtle shadow-sm outline-none transition-colors "
    + "focus:border-brand focus:ring-2 focus:ring-brand/25 "
    + "disabled:cursor-not-allowed disabled:opacity-50";
const border = (invalid) => (invalid ? "border-danger" : "border-line-strong");

/** The classes of a text box or dropdown, for the rare control that can't be one of these. */
export function controlClass({ size = "md", invalid = false, className } = {}) {
    return cn(BASE, SIZES[size] || SIZES.md, border(invalid), className);
}

/** A label, the control, a hint and an error, wired together. */
export function Field({ id, label, hint, error, required = false, optional, className, children }) {
    const autoId = useId();
    const fieldId = id || `field-${autoId}`;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const errorId = error ? `${fieldId}-error` : undefined;
    const labelId = `${fieldId}-label`;
    const context = {
        id: fieldId,
        labelId: label ? labelId : undefined,
        describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
        invalid: !!error,
        required,
    };
    return (
        <FieldContext.Provider value={context}>
            <div className={cn("space-y-1.5", className)}>
                {label ? (
                    <label id={labelId} htmlFor={fieldId} className={LABEL}>
                        {label}
                        {required ? <span className="text-danger-fg" aria-hidden="true"> *</span> : null}
                        {optional ? <span className="font-normal text-fg-subtle"> {optional}</span> : null}
                    </label>
                ) : null}
                {children}
                {hint ? <p id={hintId} className={HINT}>{hint}</p> : null}
                {error ? <p id={errorId} className={ERROR}>{error}</p> : null}
            </div>
        </FieldContext.Provider>
    );
}

// What a control takes from the Field around it (its own props win).
function useField(props) {
    const field = useContext(FieldContext);
    return {
        id: props.id ?? field?.id,
        "aria-describedby": props["aria-describedby"] ?? field?.describedBy,
        "aria-invalid": props["aria-invalid"] ?? (field?.invalid || undefined),
        required: props.required ?? field?.required,
        invalid: !!(props["aria-invalid"] ?? field?.invalid),
    };
}

// variant "code": codes people read and type (join codes, school codes, colours, setup codes).
const CODE = "font-mono uppercase tracking-widest";

/**
 * A text box. `icon`: a lucide icon shown inside, at the start (e.g. Search). `onClear` (with
 * `clearLabel`): a button inside, at the end, shown while there's text (search boxes).
 * variant "code" for codes.
 */
export const TextInput = forwardRef(function TextInput({ size = "md", variant, icon: Icon, onClear, clearLabel, className, ...props }, ref) {
    const { invalid, ...wired } = useField(props);
    const wrapped = !!(Icon || onClear);
    const input = (
        <input ref={ref} type="text" {...props} {...wired}
            className={controlClass({ size, invalid, className: cn(variant === "code" && CODE, Icon && "pl-9", onClear && "pr-9", wrapped ? null : className) })} />
    );
    if (!wrapped) return input;
    return (
        <div className={cn("relative", className)}>
            {Icon ? <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" aria-hidden="true" /> : null}
            {input}
            {onClear && props.value ? (
                <button type="button" onClick={onClear} aria-label={clearLabel}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-hover">
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
            ) : null}
        </div>
    );
});

export const Textarea = forwardRef(function Textarea({ size = "md", rows = 4, className, ...props }, ref) {
    const { invalid, ...wired } = useField(props);
    return (
        <textarea ref={ref} rows={rows} {...props} {...wired}
            className={cn(controlClass({ size, invalid, className }), "h-auto py-2 leading-relaxed resize-y")} />
    );
});

/**
 * A dropdown. `options`: [{ value, label, disabled? }] (or pass <option>s as children).
 * `placeholder` adds a first, unselectable "Choose…" entry for a value of "". `icon`: a lucide
 * icon shown inside, at the start.
 */
export const Select = forwardRef(function Select({ size = "md", options, placeholder, icon: Icon, className, children, ...props }, ref) {
    const { invalid, ...wired } = useField(props);
    const select = (
        <select ref={ref} {...props} {...wired} className={cn(controlClass({ size, invalid, className: Icon ? null : className }), "pr-8", Icon && "pl-9")}>
            {placeholder !== undefined ? <option value="" disabled>{placeholder}</option> : null}
            {options ? options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>) : children}
        </select>
    );
    if (!Icon) return select;
    return (
        <div className={cn("relative", className)}>
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" aria-hidden="true" />
            {select}
        </div>
    );
});

/** A checkbox with its label (and an optional line of help under it). */
export function CheckboxField({ id, label, hint, checked, onCheckedChange, disabled, className }) {
    const autoId = useId();
    const boxId = id || `check-${autoId}`;
    return (
        <div className={cn("flex items-start gap-2.5", className)}>
            <CheckboxBox id={boxId} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} disabled={disabled} className="mt-0.5" />
            <label htmlFor={boxId} className="text-ui text-fg-muted leading-snug cursor-pointer">
                <span className="font-semibold text-fg">{label}</span>
                {hint ? <span className="block text-caption text-fg-subtle">{hint}</span> : null}
            </label>
        </div>
    );
}

/**
 * One choice out of a few, shown as buttons (a radio group for assistive technology).
 * `options`: [{ value, label, description?, icon?, disabled? }]; `columns`: how many per row from small screens up;
 * layout "list": one full-width choice per row, for long answers (e.g. a quiz's options).
 */
export function ChoiceGroup({ options, value, onChange, columns = 3, layout = "grid", size = "md", disabled = false, className, ...props }) {
    const field = useContext(FieldContext);
    const invalid = !!(props["aria-invalid"] ?? field?.invalid);
    const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" }[columns] || "sm:grid-cols-3";
    return (
        <div
            role="radiogroup"
            aria-labelledby={props["aria-labelledby"] ?? field?.labelId}
            aria-label={props["aria-label"]}
            aria-describedby={field?.describedBy}
            aria-invalid={invalid || undefined}
            className={cn(layout === "list" ? "flex flex-col gap-2" : cn("grid grid-cols-2 gap-2", cols), className)}
        >
            {options.map((o) => {
                const selected = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled || o.disabled}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "rounded-lg border px-3 font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50",
                            layout === "list" ? "min-h-10 py-2.5 text-left text-ui" : SIZES[size] || SIZES.md,
                            selected
                                ? "border-brand bg-brand-soft text-brand-fg"
                                : cn("bg-surface text-fg-muted hover:bg-surface-hover", border(invalid)),
                        )}
                    >
                        {o.description || o.icon ? (
                            <span className="flex items-center gap-3">
                                {o.icon ? <o.icon className="w-4 h-4 shrink-0 text-brand-fg" aria-hidden="true" /> : null}
                                <span className="min-w-0">
                                    <span className="block">{o.label}</span>
                                    {o.description ? <span className="block text-caption font-normal text-fg-subtle mt-0.5">{o.description}</span> : null}
                                </span>
                            </span>
                        ) : o.label}
                    </button>
                );
            })}
        </div>
    );
}

/** A password box with a show/hide button. */
export const PasswordInput = forwardRef(function PasswordInput({ size = "md", className, toggleLabel, ...props }, ref) {
    const { t } = useLanguage();
    const [shown, setShown] = useState(false);
    return (
        <div className="relative">
            <TextInput ref={ref} {...props} type={shown ? "text" : "password"} size={size} className={cn("pr-11", className)} />
            <button
                type="button"
                onClick={() => setShown((v) => !v)}
                aria-label={toggleLabel || t("shell.login.togglePassword")}
                aria-pressed={shown}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-hover"
            >
                {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
        </div>
    );
});

// ── Files ───────────────────────────────────────────────────────────────────────────────────

function FileInput({ inputRef, accept, multiple, disabled, onFiles, id, describedBy }) {
    return (
        <input
            ref={inputRef}
            id={id}
            type="file"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            aria-describedby={describedBy}
            className="sr-only"
            onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = ""; // choosing the same file again still counts
                if (files.length) onFiles(files);
            }}
        />
    );
}

/**
 * A button that opens the file chooser. `onFiles(files[])`. variant/size as Button's
 * (components/ui/button); variant "bare" takes the look of the toolbar it sits in (className).
 */
export function FileButton({ accept, multiple = false, disabled = false, onFiles, variant = "outline", size = "sm", id, title, className, children, ...rest }) {
    const autoId = useId();
    const inputId = id || `file-${autoId}`;
    const look = variant === "bare" ? className : buttonVariants({ variant, size, className: cn("focus-within:ring-[3px] focus-within:ring-brand/40", className) });
    return (
        <label htmlFor={inputId} title={title} aria-disabled={disabled || undefined}
            className={cn(look, "cursor-pointer", disabled && "pointer-events-none opacity-50")} {...rest}>
            {children}
            <FileInput id={inputId} accept={accept} multiple={multiple} disabled={disabled} onFiles={onFiles} describedBy={rest["aria-describedby"]} />
        </label>
    );
}

/**
 * A box to drop files on, or click to choose them. `onFiles(files[])`. `title`/`hint`/`icon`
 * describe it; `children` replaces that content (e.g. to show the chosen file).
 */
export function FileDrop({ accept, multiple = false, disabled = false, onFiles, title, hint, icon: Icon, label, className, children }) {
    const autoId = useId();
    const inputId = `drop-${autoId}`;
    const [dragging, setDragging] = useState(false);
    return (
        <label
            htmlFor={inputId}
            aria-label={label}
            onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const files = Array.from(e.dataTransfer.files || []);
                if (!disabled && files.length) onFiles(multiple ? files : files.slice(0, 1));
            }}
            className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors",
                "focus-within:ring-2 focus-within:ring-brand/40",
                dragging
                    ? "border-brand bg-brand-soft"
                    : "border-line-strong bg-surface-sunken hover:border-line-strong hover:bg-surface",
                disabled && "pointer-events-none opacity-50",
                className,
            )}
        >
            {children ?? (
                <>
                    {Icon ? <Icon className="w-6 h-6 text-fg-subtle" aria-hidden="true" /> : null}
                    {title ? <span className="text-ui font-semibold text-fg-muted">{title}</span> : null}
                    {hint ? <span className="text-caption text-fg-subtle">{hint}</span> : null}
                </>
            )}
            <FileInput id={inputId} accept={accept} multiple={multiple} disabled={disabled} onFiles={onFiles} />
        </label>
    );
}

// ── Sliders ─────────────────────────────────────────────────────────────────────────────────

/**
 * A range slider with its filled part shown. `onChange(number)`. tone "onDark" for controls
 * over video or dark panels. Needs an aria-label (and aria-valuetext when the number alone
 * means little).
 */
export function Slider({ value, min = 0, max = 100, step = 1, onChange, tone = "default", className, ...props }) {
    const share = max > min ? ((Number(value) - min) / (max - min)) * 100 : 0;
    const [fill, rest] = tone === "onDark" ? ["#ffffff", "rgba(255,255,255,0.3)"] : ["var(--brand-secondary)", "rgba(148,163,184,0.35)"];
    return (
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            {...props}
            className={cn("kit-slider w-full h-1.5 rounded-full appearance-none cursor-pointer", tone === "onDark" && "kit-slider-on-dark", className)}
            style={{ background: `linear-gradient(to right, ${fill} 0%, ${fill} ${share}%, ${rest} ${share}%, ${rest} 100%)` }}
        />
    );
}

// ── Labels, groups, single radios, colours ─────────────────────────────────────────────────

/** The kit's label on its own, for a control that can't sit in a Field (prefer Field). */
export function Label({ className, children, ...props }) {
    return <label {...props} className={cn(LABEL, "mb-1.5", className)}>{children}</label>;
}

/** A group of related controls under one caption (legend). `hideLegend` keeps it for screen readers only. */
export function Fieldset({ legend, hint, required = false, hideLegend = false, className, children }) {
    return (
        <fieldset className={cn("space-y-2", className)}>
            <legend className={hideLegend ? "sr-only" : cn(LABEL, "mb-1.5 inline-flex items-center gap-1.5")}>
                {legend}
                {required ? <span className="text-danger-fg" aria-hidden="true">*</span> : null}
            </legend>
            {hint ? <p className={HINT}>{hint}</p> : null}
            {children}
        </fieldset>
    );
}

/** One radio on its own, for a choice that sits beside other controls (e.g. "this answer is correct"). */
export const Radio = forwardRef(function Radio({ className, ...props }, ref) {
    return (
        <input ref={ref} type="radio" {...props}
            className={cn("w-4 h-4 shrink-0 cursor-pointer accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50", className)} />
    );
});

/** A colour: a swatch that opens the colour chooser, and its #RRGGBB code to type. `onChange("#RRGGBB")`. */
export function ColorInput({ value, onChange, fallback = "#000000", size = "lg", swatchLabel, ...props }) {
    const valid = /^#[0-9a-f]{6}$/i.test(value || "");
    const { invalid, ...wired } = useField(props);
    return (
        <div className="flex items-center gap-2">
            <input
                type="color"
                value={(valid ? value : fallback).toLowerCase()}
                onChange={(e) => onChange(e.target.value.toUpperCase())}
                aria-label={swatchLabel}
                className={cn("shrink-0 rounded-lg cursor-pointer border bg-surface p-1", size === "lg" ? "w-11 h-11" : size === "sm" ? "w-9 h-9" : "w-10 h-10", border(invalid))}
            />
            <TextInput {...props} {...wired} value={value} maxLength={7} spellCheck={false} autoCapitalize="characters"
                onChange={(e) => onChange(e.target.value.trim().toUpperCase())} size={size} variant="code" />
        </div>
    );
}

/** An on/off switch. `onChange(nextChecked)`. Name it with aria-labelledby or aria-label. */
export function Switch({ checked, onChange, disabled = false, className, children, ...props }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={!!checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            {...props}
            className={cn(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                checked ? "bg-brand" : "bg-line-strong",
                className,
            )}
        >
            <span className={cn("inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
            {children ? <span className="sr-only">{children}</span> : null}
        </button>
    );
}

/**
 * Several checkboxes in a bordered, scrolling list (e.g. outcomes, people). `items`: [{ value,
 * label, hint? }]; `selected`: the chosen values; `onChange(nextSelected)`.
 */
export function CheckboxList({ items, selected, onChange, className }) {
    const autoId = useId();
    const toggle = (value, on) => onChange(on ? [...selected, value] : selected.filter((v) => v !== value));
    return (
        <div className={cn("max-h-40 overflow-y-auto rounded-lg border border-line divide-y divide-line", className)}>
            {items.map((item, i) => (
                <CheckboxField
                    key={String(item.value)}
                    id={`${autoId}-${i}`}
                    label={item.label}
                    hint={item.hint}
                    checked={selected.includes(item.value)}
                    onCheckedChange={(on) => toggle(item.value, on)}
                    className="px-3 py-2 hover:bg-surface-hover"
                />
            ))}
        </div>
    );
}
