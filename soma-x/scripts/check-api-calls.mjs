// Every request to the box goes through lib/api.js (apiFetch, apiUpload): one place adds the
// session token and the media cookie, handles a signed-out session, and turns failures into
// ApiError. This fails on a direct fetch( or XMLHttpRequest anywhere else in the app.
// A rare, deliberate exception carries `// direct-request: <why>` on the same line.
// Run with `pnpm test` in soma-x.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components", "context", "lib", "hooks"];
const ALLOWED = new Set(["lib/api.js"]);
const DIRECT = /(^|[^\w.$])(fetch\(|new XMLHttpRequest\b)|\b(window|globalThis|self)\.fetch\b/;

function* files(dir) {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) yield* files(full);
        else if (/\.(jsx?|tsx?|mjs)$/.test(name)) yield full;
    }
}

const problems = [];
for (const dir of DIRS) {
    for (const file of files(path.join(root, dir))) {
        const rel = path.relative(root, file).split(path.sep).join("/");
        if (ALLOWED.has(rel)) continue;
        readFileSync(file, "utf8").split("\n").forEach((line, i) => {
            const code = line.replace(/\/\/.*$/, (c) => (c.includes("direct-request:") ? c : ""));
            if (DIRECT.test(code) && !line.includes("direct-request:")) problems.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
}

if (problems.length) {
    console.error(`Requests to the box must go through lib/api.js (apiFetch / apiUpload):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
}
console.log("ok: every request goes through lib/api.js");
