// Checks the explainer translations against English: every language must have every key
// with a non-empty string, except languages listed as pending (they fall back to English,
// visibly, until translated). Run with `npm test` in soma-x.
import en from "../languages/explainers/en.js";
import fr from "../languages/explainers/fr.js";
import es from "../languages/explainers/es.js";
import sw from "../languages/explainers/sw.js";

const PENDING = { rw: "Kinyarwanda: needs a native-speaking teacher to translate" };
const LANGS = { fr, es, sw };

function paths(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}
const get = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

const english = paths(en);
let failed = false;
for (const [lang, data] of Object.entries(LANGS)) {
  const own = new Set(paths(data));
  const missing = english.filter((p) => !own.has(p));
  const extra = [...own].filter((p) => !english.includes(p));
  const empty = english.filter((p) => own.has(p) && !(typeof get(data, p) === "string" && get(data, p).trim()));
  if (missing.length || extra.length || empty.length) {
    failed = true;
    console.error(`${lang}: missing ${missing.length} [${missing.slice(0, 5).join(", ")}], extra ${extra.length} [${extra.slice(0, 5).join(", ")}], empty ${empty.length}`);
  } else {
    console.log(`ok ${lang}: ${english.length} keys`);
  }
}
for (const [lang, why] of Object.entries(PENDING)) console.log(`pending ${lang}: falls back to English (${why})`);
process.exit(failed ? 1 : 0);
