"use client";

// The app's form controls: every text box, dropdown, text area, checkbox and choice comes from
// here, so they look and behave the same on every screen (size, border, focus ring in the
// school's colour, dark mode, disabled and error states).
//
//   <Field label={t("...")} hint={...} error={errors.name} required>
//     <TextInput value={name} onChange={(e) => setName(e.target.value)} />
//   </Field>
//
// A control inside a Field gets its id, label, hint and error wired up (aria-describedby,
// aria-invalid) without passing them. Outside a Field, give it an aria-label.
import { createContext, forwardRef, useContext, useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Checkbox as CheckboxBox } from "@/components/ui/checkbox";

/** The bare checkbox (no label), e.g. to select table rows; give it an aria-label. */
export { CheckboxBox as Checkbox };
import { cn } from "@/lib/utils";

const FieldContext = createContext(null);

const LABEL = "block text-xs font-semibold text-slate-700 dark:text-slate-200";
const HINT = "text-xs text-slate-500 dark:text-slate-400";
const ERROR = "text-xs font-semibold text-rose-600 dark:text-rose-400";

const SIZES = { sm: "h-9 text-xs", md: "h-10 text-sm", lg: "h-11 text-sm" };
const BASE = "w-full rounded-lg border bg-white px-3 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition-colors "
    + "focus:border-[var(--brand-secondary)] focus:ring-2 focus:ring-[var(--brand-secondary)]/25 "
    + "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";
const border = (invalid) => (invalid ? "border-rose-500 dark:border-rose-400" : "border-slate-300 dark:border-slate-700");

// variant "ghost": no box, for a control that sits in running text or a header (the language switcher).
const GHOST = "bg-transparent border-transparent shadow-none px-1 h-auto rounded cursor-pointer focus:ring-2 focus:ring-[var(--brand-secondary)]/40";

/** The classes of a text box or dropdown, for the rare control that can't be one of these. */
export function controlClass({ size = "md", invalid = false, variant = "outline", className } = {}) {
    if (variant === "ghost") return cn("outline-none text-inherit", GHOST, className);
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
                        {required ? <span className="text-rose-500" aria-hidden="true"> *</span> : null}
                        {optional ? <span className="font-normal text-slate-500 dark:text-slate-400"> {optional}</span> : null}
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

export const TextInput = forwardRef(function TextInput({ size = "md", className, ...props }, ref) {
    const { invalid, ...wired } = useField(props);
    return <input ref={ref} type="text" {...props} {...wired} className={controlClass({ size, invalid, className })} />;
});

export const Textarea = forwardRef(function Textarea({ size = "md", rows = 4, className, ...props }, ref) {
    const { invalid, ...wired } = useField(props);
    return (
        <textarea ref={ref} rows={rows} {...props} {...wired}
            className={cn(controlClass({ size, invalid, className }), "h-auto py-2 leading-relaxed")} />
    );
});

/**
 * A dropdown. `options`: [{ value, label, disabled? }] (or pass <option>s as children).
 * `placeholder` adds a first, unselectable "Choose…" entry for a value of "".
 */
export const Select = forwardRef(function Select({ size = "md", variant = "outline", options, placeholder, className, children, ...props }, ref) {
    const { invalid, ...wired } = useField(props);
    return (
        <select ref={ref} {...props} {...wired} className={cn(controlClass({ size, invalid, variant, className }), variant === "ghost" ? "pr-1" : "pr-8")}>
            {placeholder !== undefined ? <option value="" disabled>{placeholder}</option> : null}
            {options ? options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>) : children}
        </select>
    );
});

/** A checkbox with its label (and an optional line of help under it). */
export function CheckboxField({ id, label, hint, checked, onCheckedChange, disabled, className }) {
    const autoId = useId();
    const boxId = id || `check-${autoId}`;
    return (
        <div className={cn("flex items-start gap-2.5", className)}>
            <CheckboxBox id={boxId} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} disabled={disabled} className="mt-0.5" />
            <label htmlFor={boxId} className="text-sm text-slate-700 dark:text-slate-200 leading-snug cursor-pointer">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                {hint ? <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
            </label>
        </div>
    );
}

/**
 * One choice out of a few, shown as buttons (a radio group for assistive technology).
 * `options`: [{ value, label, disabled? }]; `columns`: how many per row from small screens up;
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
                            "rounded-lg border px-3 font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]/40 disabled:cursor-not-allowed disabled:opacity-50",
                            layout === "list" ? "min-h-10 py-2.5 text-left text-sm" : SIZES[size] || SIZES.md,
                            selected
                                ? "border-[var(--brand-secondary)] bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100"
                                : cn("bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800", border(invalid)),
                        )}
                    >
                        {o.label}
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
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
            >
                {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
            </button>
        </div>
    );
});
