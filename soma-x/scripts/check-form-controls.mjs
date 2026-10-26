// Every text box, dropdown and text area comes from components/form (Field, TextInput, Textarea,
// Select, PasswordInput, ChoiceGroup, CheckboxField), so they look and behave the same on every
// screen. This fails on a hand-written <input>, <select> or <textarea> anywhere else, and on a
// kit control given its own styling: a className may only place it (width, margins, flex);
// sizes, icons, codes and help text are the kit's props (size, icon, onClear, variant, description).
// File pickers and sliders are the kit's FileButton, FileDrop and Slider too. Allowed as they
// are: hidden inputs, colour pickers, and a rare deliberate exception marked data-raw-control="<why>".
// Run with `pnpm test` in soma-x.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components"];
const OWNERS = ["components/form/", "components/ui/checkbox"];
const ALLOWED_TYPES = /type=["'](hidden|color)["']/;

function* files(dir) {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) yield* files(full);
        else if (/\.(jsx|tsx)$/.test(name)) yield full;
    }
}

// Classes that only place a control. Anything else (colours, fonts, borders, padding) is styling.
const LAYOUT = /^(?:(?:sm|md|lg|xl|2xl):)?(?:w-|min-w-|max-w-|flex$|flex-1$|flex-none$|shrink|grow|basis-|m[trblxy]?-|self-|col-span|row-span|order-|block$|inline|hidden$)/;
const KIT = /<(TextInput|Textarea|Select|PasswordInput|ChoiceGroup|Checkbox|CheckboxField|Slider|FileDrop)\b/g;

// The opening tag from `start`, skipping ">" inside {...} (e.g. arrow functions).
function openingTag(text, start) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") depth--;
        else if (text[i] === ">" && depth === 0) return text.slice(start, i);
    }
    return text.slice(start);
}

const problems = [];
for (const dir of DIRS) {
    for (const file of files(path.join(root, dir))) {
        const rel = path.relative(root, file).split(path.sep).join("/");
        if (OWNERS.some((o) => rel.startsWith(o))) continue;
        const text = readFileSync(file, "utf8");
        const tag = /<(input|select|textarea)\b([^>]*?)(\/?)>/gs;
        let m;
        while ((m = tag.exec(text))) {
            const attrs = m[2];
            if (m[1] === "input" && ALLOWED_TYPES.test(attrs)) continue;
            if (/data-raw-control=/.test(attrs)) continue;
            const line = text.slice(0, m.index).split("\n").length;
            problems.push(`${rel}:${line}: <${m[1]}>`);
        }
        let k;
        while ((k = KIT.exec(text))) {
            const attrs = openingTag(text, k.index);
            for (const c of attrs.matchAll(/className="([^"]*)"/g)) {
                const styling = c[1].split(/\s+/).filter((cls) => cls && !LAYOUT.test(cls));
                if (styling.length) {
                    const line = text.slice(0, k.index).split("\n").length;
                    problems.push(`${rel}:${line}: <${k[1]}> styled with "${styling.join(" ")}"`);
                }
            }
        }
    }
}

if (problems.length) {
    console.error(`Form controls must come from components/form, unstyled (see the note at the top):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
}
console.log("ok: every form control comes from components/form");
