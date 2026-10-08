// Quick syntax check for JS/JSX files without a full build (useful while several people edit at
// once): node scripts/check-syntax.mjs <files or folders...>. Exits 1 on any syntax error.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const files = [];
const walk = (p) => {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const f of fs.readdirSync(p)) if (f !== "node_modules" && !f.startsWith(".")) walk(path.join(p, f));
  } else if (/\.(jsx?|tsx?|mjs)$/.test(p)) files.push(p);
};
for (const arg of process.argv.slice(2)) walk(arg);

let bad = 0;
for (const file of files) {
  const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind);
  for (const d of source.parseDiagnostics) {
    const { line, character } = source.getLineAndCharacterOfPosition(d.start ?? 0);
    console.error(`${file}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
    bad += 1;
  }
}
console.log(`${files.length} files checked, ${bad} syntax errors`);
process.exit(bad ? 1 : 0);
