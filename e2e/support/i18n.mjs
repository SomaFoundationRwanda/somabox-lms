// The app's own English text, so tests find buttons and headings by translation key
// (t("shell.login.submit")) and keep passing when the wording changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LANG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../soma-x/languages");

// The language files are ES modules in a package without "type": "module", so they are loaded
// from their source text. english.js imports its parts without extensions (Next resolves them);
// each part is loaded first and inlined.
const loadModule = async (src) => (await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`)).default;
let src = fs.readFileSync(path.join(LANG_DIR, "english.js"), "utf8");
for (const [line, name, rel] of src.matchAll(/^\s*import\s+(\w+)\s+from\s+["']\.\/([^"']+)["'];?\s*$/gm)) {
  const part = await loadModule(fs.readFileSync(path.join(LANG_DIR, `${rel}.js`), "utf8"));
  src = src.replace(line, `const ${name} = ${JSON.stringify(part)};`);
}
const en = await loadModule(src);

export function t(key, vars) {
  const value = key.split(".").reduce((obj, k) => obj?.[k], en);
  if (typeof value !== "string") throw new Error(`No English text for "${key}"`);
  return vars ? value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : value;
}
