// Every text box, dropdown and text area comes from components/form (Field, TextInput, Textarea,
// Select, PasswordInput, ChoiceGroup, CheckboxField), so they look and behave the same on every
// screen. This fails on a hand-written <input>, <select> or <textarea> anywhere else.
// Allowed as they are: file pickers, hidden inputs, sliders and colour pickers (type="file",
// "hidden", "range", "color"), and a rare deliberate exception marked data-raw-control="<why>".
// Run with `pnpm test` in soma-x.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components"];
const OWNERS = ["components/form/", "components/ui/checkbox"];
const ALLOWED_TYPES = /type=["'](file|hidden|range|color)["']/;

function* files(dir) {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) yield* files(full);
        else if (/\.(jsx|tsx)$/.test(name)) yield full;
    }
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
    }
}

if (problems.length) {
    console.error(`Use the form controls from components/form instead of:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
}
console.log("ok: every form control comes from components/form");
