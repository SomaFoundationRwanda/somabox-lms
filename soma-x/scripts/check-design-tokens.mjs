// Colour and type come from the design tokens (app/globals.css, DESIGN.md): this fails on raw
// palette colours (text-slate-500, bg-emerald-50…), plain bg-white / text-black (translucent white
// over media is fine), hard-coded colour values in classes or
// inline styles, pixel or Tailwind sizes (text-[11px], text-sm…), font-black, uppercase
// labels, white text on a token fill (bg-brand text-white: use text-on-brand), and the wrong
// brand text for the fill (bg-brand-strong takes text-on-brand-strong, bg-brand text-on-brand). `--list` prints every problem; by default a summary per file.
// Run with `pnpm test` in soma-x.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components", "context", "lib", "hooks"];
const PALETTE = "slate|gray|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|primary|accent-dark|accent-light|accent-lighter|accent-light-2|accent-light-3|dark-accent|error|text-light";
const RULES = [
    ["raw colour", new RegExp(`(?<![\\w-])(?:[a-z0-9-]+:)*(?:text|bg|border(?:-[trblxy])?|ring(?:-offset)?|from|to|via|fill|stroke|divide|outline|accent|placeholder|decoration|shadow|caret)-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d+)?(?![\\w-])`, "g")],
    ["hard-coded colour", /(?:-\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^\]]*\)|var\(--brand-[a-z-]+\))\])/g],
    ["size", /(?<![\w-])(?:[a-z0-9-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl|\[\d+(?:\.\d+)?(?:px|rem)\])(?![\w-])/g],
    ["weight", /(?<![\w-])font-black(?![\w-])/g],
    ["white/black surface", /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg-white|text-black)(?![\w\/-])/g],
    ["black hover", /(?<![\w-])(?:hover|focus|active):bg-black(?![\w\/-])/g],
    ["uppercase", /(?<![\w-])(?:uppercase|tracking-(?:wide|wider|widest|\[[^\]]+\]))(?![\w-])/g],
    ["inline colour", /style=\{\{[^}]*?(?:#[0-9a-fA-F]{3,8}\b|rgba?\()/g],
];
// One class string at a time: white text next to a solid brand/status fill.
const FILL = /(?<![\w-])(?:[a-z0-9-]+:)*bg-(?:brand|brand-strong|success|warning|danger|info)(?:\/\d+)?(?![\w-])/;
const WHITE_TEXT = /(?<![\w-])(?:[a-z0-9-]+:)*text-white(?![\w-])/;
// Quoted strings stay on one line (so an apostrophe in a comment doesn't open one); template
// literals may span lines.
const CLASS_STRING = /(["'])((?:(?!\1)[^\\\n]|\\.)*?)\1|(`)((?:[^`\\]|\\.)*?)`/g;
const STRONG_FILL = /(?<![\w:-])bg-brand-strong(?:\/\d+)?(?![\w-])/;
const PLAIN_FILL = /(?<![\w:-])bg-brand(?:\/\d+)?(?![\w-])/;
const ON_BRAND = /(?<![\w-])(?:[a-z0-9-]+:)*text-on-brand(?![\w-])/;
const ON_BRAND_STRONG = /(?<![\w-])(?:[a-z0-9-]+:)*text-on-brand-strong(?![\w-])/;
const UPPERCASE_OK = ["components/form/"];

function* files(dir) {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) yield* files(full);
        else if (/\.(jsx?|tsx?)$/.test(name)) yield full;
    }
}

const list = process.argv.includes("--list");
const byFile = new Map();
let total = 0;
for (const dir of DIRS) {
    for (const file of files(path.join(root, dir))) {
        const rel = path.relative(root, file).split(path.sep).join("/");
        const text = readFileSync(file, "utf8");
        for (const [kind, re] of RULES) {
            if (kind === "uppercase" && UPPERCASE_OK.some((p) => rel.startsWith(p))) continue;
            for (const m of text.matchAll(re)) {
                const line = text.slice(0, m.index).split("\n").length;
                if (!byFile.has(rel)) byFile.set(rel, []);
                byFile.get(rel).push(`${rel}:${line}: ${kind}: ${m[0].slice(0, 60)}`);
                total++;
            }
        }
        for (const m of text.matchAll(CLASS_STRING)) {
            const body = m[2] ?? m[4];
            const strong = STRONG_FILL.test(body), plain = PLAIN_FILL.test(body);
            const wrong = (strong && !plain && ON_BRAND.test(body)) ? "text-on-brand on bg-brand-strong (use text-on-brand-strong)"
                : (plain && !strong && ON_BRAND_STRONG.test(body)) ? "text-on-brand-strong on bg-brand (use text-on-brand)" : null;
            if (wrong) {
                const line = text.slice(0, m.index).split("\n").length;
                if (!byFile.has(rel)) byFile.set(rel, []);
                byFile.get(rel).push(`${rel}:${line}: brand text: ${wrong}`);
                total++;
            }
            if (!FILL.test(body) || !WHITE_TEXT.test(body)) continue;
            const line = text.slice(0, m.index).split("\n").length;
            if (!byFile.has(rel)) byFile.set(rel, []);
            byFile.get(rel).push(`${rel}:${line}: white text on a fill: ${body.match(WHITE_TEXT)[0]} (use text-on-<role>)`);
            total++;
        }
    }
}

if (total) {
    if (list) for (const items of byFile.values()) console.error(items.join("\n"));
    else console.error([...byFile].sort((a, b) => b[1].length - a[1].length).map(([f, items]) => `  ${String(items.length).padStart(4)}  ${f}`).join("\n"));
    console.error(`\n${total} uses of colours or type outside the design tokens in ${byFile.size} files (DESIGN.md). Use --list for each one.`);
    process.exit(1);
}
console.log("ok: colour and type come from the design tokens");
