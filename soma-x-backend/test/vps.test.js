// The box and soma-x-server (the VPS): every push carries the school; opening Explore/Library files
// records content_opened usage events; cloud downloads send the box's key, remember what they
// fetched, and notice when the cloud has a newer copy.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { startTestServer } from "./helpers.js";

process.env.EXPLORE_COVERS = "off";
const KEY = "sbx_test-box-key";
const tag = `vps${process.pid}`;
let ctx;
let db;
let content;
let cloud;

const call = (who) => (method, url, body) => ctx.api(method, url, { token: ctx.tokens[who], body });
const asAdmin = call("admin");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** A stand-in for soma-x-server: catalogue, files, and the outbox receiver. */
async function startCloud() {
  const state = {
    files: { [`${tag}/p4/fractions.pdf`]: { id: 41, body: "fractions v1" } },
    books: { 77: { book_name: "Tag Book", categories: tag, body: "epub v1" } },
    auth: [],
    pushes: [],
  };
  const tree = () => [{
    type: "folder", name: tag, path: tag, children: [{
      type: "folder", name: "P4", path: `${tag}/p4`, children: Object.entries(state.files).map(([p, f]) => ({
        type: "file", name: path.basename(p), path: p, size: Buffer.byteLength(f.body), id: f.id, sha256: sha(f.body), version: 1,
      })),
    }],
  }];
  const server = http.createServer((req, res) => {
    state.auth.push(`${req.method} ${req.url.split("?")[0]} ${req.headers.authorization || "-"}`);
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const url = decodeURIComponent(req.url);
      const send = (status, data, type = "application/json") => {
        const buf = Buffer.from(typeof data === "string" ? data : JSON.stringify(data));
        res.writeHead(status, { "Content-Type": type, "Content-Length": buf.length });
        res.end(req.method === "HEAD" ? undefined : buf);
      };
      if (url === "/api/v1/box-sync") {
        state.pushes.push(JSON.parse(body));
        return send(200, { accepted: 0, duplicates: 0, rejected: 0 });
      }
      if (url === "/metadata") return send(200, tree());
      if (url === "/library-metadata") {
        return send(200, Object.entries(state.books).map(([id, b]) => ({
          id, book_name: b.book_name, categories: b.categories, size: Buffer.byteLength(b.body), sha256: sha(b.body), version: 1,
        })));
      }
      const book = url.match(/^\/content\/library\/(\d+)\.epub$/);
      if (book) return state.books[book[1]] ? send(200, state.books[book[1]].body, "application/epub+zip") : send(404, {});
      const file = state.files[url.replace(/^\/content\//, "")];
      return file ? send(200, file.body, "application/pdf") : send(404, {});
    });
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${server.address().port}`, state, stop: () => new Promise((r) => server.close(r)) };
}

before(async () => {
  cloud = await startCloud();
  // Read by the config module when the app is imported.
  process.env.CLOUD_URL = cloud.url;
  process.env.SYNC_TOKEN = KEY;
  ctx = await startTestServer();
  db = ctx.db;
  ({ config: { paths: { content } } } = await import("../src/config/index.js"));
});

after(async () => {
  delete process.env.SYNC_URL;
  for (const root of ["rwandan-education", "custom-content", "library"]) fs.rmSync(path.join(content, root, tag), { recursive: true, force: true });
  await cloud.stop();
  await ctx.stop();
});

async function waitFor(fn, ms = 10_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}
const opens = () => db.prepare("SELECT role, data FROM usage_events WHERE event_type = 'content_opened' ORDER BY id").all();
const openFile = (url, headers = {}) => fetch(`${ctx.baseUrl}${url}`, { headers: { Authorization: `Bearer ${ctx.tokens.student}`, ...headers } });

test("every push tells the cloud the school, with the box's key", async () => {
  await asAdmin("PUT", "/school", { name: "Groupe Scolaire Kigali", code: "GSK", province: "Kigali", district: "Gasabo", isRural: false });
  process.env.SYNC_URL = `${cloud.url}/api/v1/box-sync`;
  const run = await asAdmin("POST", "/sync/run");
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const push = cloud.state.pushes.at(-1);
  assert.deepEqual(push.school, { name: "Groupe Scolaire Kigali", code: "GSK", province: "Kigali", district: "Gasabo", isRural: false });
  assert.ok(push.device && push.boxId, "device identity and box id still sent");
  assert.ok(cloud.state.auth.some((a) => a === `POST /api/v1/box-sync Bearer ${KEY}`));
  delete process.env.SYNC_URL;
});

test("opening a file records one content_opened event per person and half hour", async () => {
  const file = path.join(content, "custom-content", tag, "songs", "morning-song.mp3");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x".repeat(2000));
  assert.equal((await asAdmin("POST", "/content/manager/rescan")).status, 200);
  const before = (await opens()).length;

  const url = `/content/files/custom-content/${tag}/songs/morning-song.mp3`;
  assert.equal((await openFile(url)).status, 200);
  assert.equal((await openFile(url, { Range: "bytes=1000-" })).status, 206); // seeking: not a new open
  assert.equal((await openFile(url)).status, 200); // again within half an hour
  const events = await waitFor(async () => { const e = await opens(); return e.length > before && e; });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await opens()).length, before + 1);
  assert.equal(events.at(-1).role, "scholar");
  assert.deepEqual(
    { source: events.at(-1).data.source, path: events.at(-1).data.path, type: events.at(-1).data.type, cloud: events.at(-1).data.cloudContentId },
    { source: "custom-content", path: `custom-content/${tag}/songs/morning-song.mp3`, type: "audio", cloud: undefined },
  );
  // usage_events is a synced table, so the open is queued for the cloud like any other event.
  const queued = await db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE entity = 'usage_events' AND payload->>'event_type' = 'content_opened'").get();
  assert.ok(Number(queued.n) >= 1);
});

async function downloadCurriculum(files) {
  const res = await asAdmin("POST", "/cloud/download", { files });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  await waitFor(async () => (await asAdmin("GET", "/cloud/download-status")).body.status === "finished");
}
const findNode = (nodes, p) => {
  for (const n of nodes) {
    if (n.path === p) return n;
    const hit = n.children && findNode(n.children, p);
    if (hit) return hit;
  }
  return null;
};

test("cloud downloads remember what they fetched and pick up newer copies", async () => {
  const rel = `${tag}/p4/fractions.pdf`;
  const local = path.join(content, "rwandan-education", rel);
  await downloadCurriculum([rel]);
  assert.equal(fs.readFileSync(local, "utf8"), "fractions v1");
  assert.ok(!fs.existsSync(`${local}.part`));
  assert.ok(cloud.state.auth.some((a) => a.startsWith("GET /metadata ") && a.endsWith(`Bearer ${KEY}`)), "catalogue requests carry the key");
  const row = await db.prepare("SELECT cloud_id, sha256 FROM cloud_content WHERE path_key = ?").get(`rwandan-education/${rel}`);
  assert.deepEqual([Number(row.cloud_id), row.sha256], [41, sha("fractions v1")]);

  let tree = (await asAdmin("GET", "/cloud/available-content")).body;
  assert.deepEqual([findNode(tree, rel).isDownloaded, findNode(tree, rel).isOutdated, findNode(tree, tag).isOutdated], [true, false, false]);

  // Same size, different bytes: only the hash can tell.
  cloud.state.files[rel].body = "fractions v2";
  tree = (await asAdmin("GET", "/cloud/available-content")).body;
  assert.deepEqual([findNode(tree, rel).isOutdated, findNode(tree, tag).isOutdated], [true, true]);
  await downloadCurriculum([rel]);
  assert.equal(fs.readFileSync(local, "utf8"), "fractions v2");
  tree = (await asAdmin("GET", "/cloud/available-content")).body;
  assert.equal(findNode(tree, rel).isOutdated, false);

  // Opening it names the catalogue item, so the cloud can report on it.
  await asAdmin("POST", "/content/manager/rescan");
  assert.equal((await openFile(`/content/files/rwandan-education/${rel}`)).status, 200);
  const event = await waitFor(async () => (await opens()).find((e) => e.data.path === `rwandan-education/${rel}`));
  assert.equal(event.data.cloudContentId, "41");

  // Deleting it from the box forgets it.
  assert.equal((await asAdmin("POST", "/cloud/delete", { paths: [tag] })).status, 200);
  assert.equal(await db.prepare("SELECT 1 FROM cloud_content WHERE path_key LIKE ?").get(`rwandan-education/${tag}/%`), undefined);
});

async function downloadBooks(books) {
  const res = await asAdmin("POST", "/library/download", { books });
  assert.equal(res.status, 202, JSON.stringify(res.body));
  await waitFor(async () => (await asAdmin("GET", "/library/download-status")).body.status === "finished");
}

test("library downloads are refreshed when the cloud copy changes, and never overwrite the box's own files", async () => {
  // Someone's own file already has the name the cloud book would get.
  const target = path.join(content, "library", tag, "Tag-Book.epub");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "the school's own book, a different size");
  let available = (await asAdmin("GET", "/library/available-books")).body;
  await downloadBooks(available);
  assert.equal(fs.readFileSync(target, "utf8"), "the school's own book, a different size");
  assert.equal((await asAdmin("GET", "/library/available-books")).body[0].isDownloaded, false);

  fs.rmSync(target);
  await downloadBooks(available);
  assert.equal(fs.readFileSync(target, "utf8"), "epub v1");
  available = (await asAdmin("GET", "/library/available-books")).body;
  assert.deepEqual([available[0].isDownloaded, available[0].isOutdated], [true, false]);

  cloud.state.books[77].body = "epub v2";
  available = (await asAdmin("GET", "/library/available-books")).body;
  assert.equal(available[0].isOutdated, true);
  await downloadBooks(available);
  assert.equal(fs.readFileSync(target, "utf8"), "epub v2");
  assert.ok(cloud.state.auth.some((a) => a === `GET /content/library/77.epub Bearer ${KEY}`));
});
