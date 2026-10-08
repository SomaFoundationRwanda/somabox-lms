// Checks the main UI language files (languages/{english,french,kinywanda,swahili,spanish}.js)
// against English: every language must have exactly English's keys (no missing, no extra),
// because a missing key renders blank for languages without an English fallback path and an
// extra key is usually a typo. Values that are identical to English are counted as a warning
// only (some are legitimately the same, e.g. names, or Kinyarwanda still pending).
// The `explainers` subtree is checked separately by check-explainers.mjs.
// Run with `npm test` in soma-x.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "languages");
const FILES = { en: "english", fr: "french", rw: "kinywanda", sw: "swahili", es: "spanish" };

// The language files import their explainers with extension-less paths (bundler style), which
// plain Node can't resolve. Explainers aren't checked here, so stub those imports out and load
// each file's default export from source.
// Feature folders whose text lives in its own files (languages/<folder>/<code>.js), loaded
// into the main file under the same key. Explainers are checked by check-explainers.mjs.
const SUBTREES = ["attendance", "guest", "explore"];
const CODES = { english: "en", french: "fr", kinywanda: "rw", swahili: "sw", spanish: "es" };

async function loadModule(file) {
  const src = readFileSync(file, "utf8")
    .replace(/^\s*import\s+(\w+)\s+from\s+["'][^"']+["'];?\s*$/gm, "const $1 = {};");
  return (await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`)).default;
}

async function load(name) {
  const { explainers, ...rest } = await loadModule(path.join(dir, `${name}.js`)); // eslint-disable-line no-unused-vars
  for (const sub of SUBTREES) rest[sub] = await loadModule(path.join(dir, sub, `${CODES[name]}.js`));
  return rest;
}

function paths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? paths(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}
const get = (obj, p) => p.split(".").reduce((o, k) => o?.[k], obj);

const en = await load(FILES.en);
const english = paths(en);
const englishSet = new Set(english);
let failed = false;

for (const [code, file] of Object.entries(FILES)) {
  if (code === "en") continue;
  const data = await load(file);
  const own = paths(data);
  const ownSet = new Set(own);
  const missing = english.filter((p) => !ownSet.has(p));
  const extra = own.filter((p) => !englishSet.has(p));
  const empty = english.filter((p) => ownSet.has(p) && typeof get(data, p) === "string" && !get(data, p).trim());
  const sameAsEnglish = english.filter((p) => ownSet.has(p) && get(data, p) === get(en, p));

  if (missing.length || extra.length || empty.length) {
    failed = true;
    console.error(
      `FAIL ${code} (${file}.js): missing ${missing.length} [${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", ..." : ""}], ` +
      `extra ${extra.length} [${extra.slice(0, 8).join(", ")}${extra.length > 8 ? ", ..." : ""}], empty ${empty.length} [${empty.slice(0, 8).join(", ")}]`
    );
  } else {
    console.log(`ok ${code}: ${english.length} keys`);
  }
  if (sameAsEnglish.length) {
    console.warn(`warn ${code}: ${sameAsEnglish.length} of ${english.length} values are identical to English`);
  }
}
process.exit(failed ? 1 : 0);
