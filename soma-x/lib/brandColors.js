// Readable colours worked out from the school's two colours, so any colour a school picks still
// gives readable text (WCAG AA, 4.5:1): the text on a brand fill (white or near-black) and the
// brand-coloured text on the page (darkened for light mode, lightened for dark mode), and a deep
// shade of the main colour for panels that carry white text (sign-in, headers, menus).
// SchoolContext sets the results as CSS variables; app/globals.css uses them.
const INK = "#0F172A";
const WHITE = "#FFFFFF";
const LIGHT_SURFACE = "#FFFFFF";
const DARK_SURFACE = "#0E1117";

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

function luminance(hex) {
    const [r, g, b] = channels(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** White on the fill when it reads well enough, otherwise near-black. */
export function textOn(fill) {
    return contrast(WHITE, fill) >= 4.5 || contrast(WHITE, fill) >= contrast(INK, fill) ? WHITE : INK;
}

/** The colour mixed toward black (or white) just enough to read on the given surface. */
function readableOn(hex, surface, toward, ratio = 4.5) {
    const from = channels(hex);
    const to = channels(toward);
    for (let step = 0; step <= 20; step++) {
        const mixed = toHex(from.map((c, i) => c + (to[i] - c) * (step / 20)));
        if (contrast(mixed, surface) >= ratio) return mixed;
    }
    return toward;
}

/** CSS variables for the school's colours (both are #RRGGBB). */
export function brandVariables(primary, secondary) {
    return {
        "--brand-primary": primary,
        "--brand-secondary": secondary,
        "--on-brand": textOn(secondary),
        "--on-brand-strong": textOn(primary),
        "--brand-fg-light": readableOn(secondary, LIGHT_SURFACE, "#000000"),
        "--brand-fg-dark": readableOn(secondary, DARK_SURFACE, "#FFFFFF"),
        // 7:1 so the softer white text on these panels (white/70) still reads.
        "--brand-deep": readableOn(primary, WHITE, "#000000", 7),
    };
}
