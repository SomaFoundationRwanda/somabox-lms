// Every literal translation key used in the code (t("a.b"), tf("a.b"), tp("a.b") …) must exist in
// the English files, or the text renders blank. Run: node scripts/check-translation-keys.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const langDir = path.join(root, "languages");

async function loadModule(file) {
  const src = fs.readFileSync(file, "utf8").replace(/^\s*import\s+(\w+)\s+from\s+["'][^"']+["'];?\s*$/gm, "const $1 = {};");
  return (await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`)).default;
}
const en = await loadModule(path.join(langDir, "english.js"));
for (const dir of fs.readdirSync(langDir)) {
  const file = path.join(langDir, dir, "en.js");
  if (fs.existsSync(file)) en[dir] = await loadModule(file);
}
const has = (key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), en) !== undefined;

const files = [];
const walk = (p) => {
  for (const f of fs.readdirSync(p)) {
    const full = path.join(p, f);
    if (f === "node_modules" || f.startsWith(".")) continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(jsx?|tsx?)$/.test(f)) files.push(full);
  }
};
for (const d of ["app", "components", "lib", "context"]) walk(path.join(root, d));

// Helpers that take a full key, plus prefixes some helpers add (e.g. tp("x") -> "progress.x").
const CALL = /\b(t|tf|tOr|tx|tp|ts|tc|ta|tl|tt|explain)\(\s*["'`]([a-zA-Z][\w.-]*)["'`]/g;
// Area helpers add their own prefix (useCourseText: "course.", useProgressText: "progress.",
// useAttendanceText: "attendance."), so a key passes if it exists under one of the prefixes the
// file's imports bring in, or as a full key.
const PREFIX_IMPORTS = [
  [/useCourseText/, "course."],
  [/useProgressText|progress\/text/, "progress."],
  [/useAttendanceText|attendance\/text/, "attendance."],
];
const missing = [];
let count = 0;
for (const file of files) {
  // Comments may show example calls; only real code counts.
  const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const prefixes = ["", ...PREFIX_IMPORTS.filter(([re]) => re.test(src)).map(([, p]) => p)];
  for (const m of src.matchAll(CALL)) {
    const key = m[2];
    count += 1;
    if (m[1] === "explain") { if (!has(`explainers.${key}`)) missing.push(`${path.relative(root, file)}: explain("${key}")`); continue; }
    if (!prefixes.some((p) => has(p + key))) missing.push(`${path.relative(root, file)}: ${m[1]}("${key}")`);
  }
}
if (missing.length) {
  console.error(`${missing.length} translation keys used in code are missing from English:\n${missing.slice(0, 80).join("\n")}`);
  process.exit(1);
}
console.log(`ok: ${count} translation keys used in code all exist`);
