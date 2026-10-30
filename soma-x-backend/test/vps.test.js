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
    ranges: [],
    pushes: [],
    offline: false, // drop every connection, as if the cable were unplugged
  };
  const tree = () => [{
    type: "folder", name: tag, path: tag, children: [{
      type: "folder", name: "P4", path: `${tag}/p4`, children: Object.entries(state.files).map(([p, f]) => ({
        type: "file", name: path.basename(p), path: p, size: Buffer.byteLength(f.body), id: f.id, sha256: sha(f.body), version: 1,
      })),
    }],
  }];
  const server = http.createServer((req, res) => {
    if (state.offline) return req.socket.destroy();
    state.auth.push(`${req.method} ${req.url.split("?")[0]} ${req.headers.authorization || "-"}`);
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const url = decodeURIComponent(req.url);
      const send = (status, data, type = "application/json") => {
        let buf = Buffer.from(typeof data === "string" ? data : JSON.stringify(data));
        const range = status === 200 && req.headers.range?.match(/^bytes=(\d+)-$/);
        if (range) {
          state.ranges.push(`${url} ${req.headers.range}`);
          const from = Number(range[1]);
          if (from >= buf.length) { res.writeHead(416); return res.end(); }
          res.writeHead(206, { "Content-Type": type, "Content-Length": buf.length - from, "Content-Range": `bytes ${from}-${buf.length - 1}/${buf.length}` });
          return res.end(req.method === "HEAD" ? undefined : buf.subarray(from));
        }
        res.writeHead(status, { "Content-Type": type, "Content-Length": buf.length });
        res.end(req.method === "HEAD" ? undefined : buf);
      };
      if (url === "/api/v1/box-sync") {
        state.pushes.push(JSON.parse(body));
        return send(200, { accepted: 0, duplicates: 0, rejected: 0 });
      }
      if (url === "/metadata") return send(200, tree());
      if (url.split("?")[0] === "/library-metadata") {
        // Like soma-x-server: EPUBs only unless the box asks for more with ?formats=epub,pdf.
        const formats = new URL(url, "http://cloud").searchParams.get("formats")?.split(",") || ["epub"];
        return send(200, Object.entries(state.books).filter(([, b]) => formats.includes(b.extension || "epub")).map(([id, b]) => ({
          id, book_name: b.book_name, categories: b.categories, extension: b.extension || "epub",
          size: Buffer.byteLength(b.body), sha256: sha(b.body), version: 1,
        })));
      }
      const book = url.match(/^\/content\/library\/(\d+)\.(epub|pdf)$/);
      if (book) {
        const b = state.books[book[1]];
        if (!b || (b.extension || "epub") !== book[2]) return send(404, {});
        return send(200, b.body, book[2] === "pdf" ? "application/pdf" : "application/epub+zip");
      }
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

test("library PDFs from the cloud are listed and saved as .pdf", async () => {
  cloud.state.books[78] = { book_name: "Tag Atlas", categories: tag, extension: "pdf", body: "atlas pdf" };
  try {
    const available = (await asAdmin("GET", "/library/available-books")).body;
    const atlas = available.find((b) => b.id === "78");
    assert.equal(atlas?.extension, "pdf");
    await downloadBooks([atlas]);
    assert.equal(fs.readFileSync(path.join(content, "library", tag, "Tag-Atlas.pdf"), "utf8"), "atlas pdf");
    assert.ok(cloud.state.auth.some((a) => a === `GET /content/library/78.pdf Bearer ${KEY}`));
    assert.equal((await asAdmin("GET", "/library/available-books")).body.find((b) => b.id === "78").isDownloaded, true);
  } finally {
    delete cloud.state.books[78];
  }
});

test("one book failing doesn't stop the others, and the status says how many of each", async () => {
  cloud.state.books[79] = { book_name: "Tag Map", categories: tag, extension: "pdf", body: "map pdf" };
  try {
    const map = (await asAdmin("GET", "/library/available-books")).body.find((b) => b.id === "79");
    // A book the cloud no longer has comes first: the one after it still downloads.
    const gone = { id: "99", book_name: "Tag Gone", categories: tag, extension: "pdf", size: 5 };
    const res = await asAdmin("POST", "/library/download", { books: [gone, map] });
    assert.equal(res.status, 202);
    const s = await waitFor(async () => {
      const body = (await asAdmin("GET", "/library/download-status")).body;
      return body.status !== "downloading" && body;
    });
    assert.deepEqual(
      [s.status, s.total, s.done, s.downloaded, s.failed, s.percent, s.failedNames],
      ["failed", 2, 2, 1, 1, 100, ["Tag Gone"]],
    );
    assert.equal(fs.readFileSync(path.join(content, "library", tag, "Tag-Map.pdf"), "utf8"), "map pdf");
  } finally {
    delete cloud.state.books[79];
  }
});

// --- Boxes are mostly offline ---------------------------------------------------------------------

const ETH = { eth0: [{ address: "192.168.137.20", family: "IPv4", internal: false }] };
const LOOPBACK = { lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }] };

test("the connectivity watch notices a cable being plugged in, without probing the cloud constantly", async () => {
  const { startConnectivityWatch } = await import("../src/services/sync/connectivity.js");
  let ifaces = LOOPBACK;
  let cloudUp = true;
  let probes = 0;
  let onlines = 0;
  const watch = startConnectivityWatch({
    interfaces: () => ifaces,
    probe: async () => { probes++; return cloudUp; },
    onOnline: () => { onlines++; },
    checkEveryMs: 10,
    probeOfflineEveryMs: 60_000,
  });
  try {
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual([watch.state.online, probes, onlines], [false, 0, 0], "no network: nothing to ask");

    ifaces = { ...LOOPBACK, ...ETH }; // cable to a laptop sharing its internet
    await waitFor(() => onlines === 1);
    assert.equal(watch.state.online, true);
    const probesWhenOnline = probes;
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(probes, probesWhenOnline, "online and nothing changed: no probing");

    ifaces = LOOPBACK; // unplugged
    await waitFor(() => watch.state.online === false);
    ifaces = { ...LOOPBACK, ...ETH };
    await waitFor(() => onlines === 2);

    // A router without internet: the cable is in but the cloud doesn't answer. One probe on the
    // change, then only once a minute.
    ifaces = LOOPBACK;
    await waitFor(() => watch.state.online === false);
    cloudUp = false;
    ifaces = { ...LOOPBACK, ...ETH };
    const before = probes;
    await waitFor(() => probes === before + 1);
    await new Promise((r) => setTimeout(r, 80));
    assert.deepEqual([probes, watch.state.online, onlines], [before + 1, false, 2]);
  } finally {
    watch.stop();
  }
});

test("an offline box pushes the moment it gets online instead of waiting out its backoff", async () => {
  const { scheduleSync, stopSync } = await import("../src/services/sync/outbox.js");
  process.env.SYNC_URL = `${cloud.url}/api/v1/box-sync`;
  cloud.state.offline = true;
  let ifaces = LOOPBACK;
  const pushesBefore = cloud.state.pushes.length;
  scheduleSync({ connectivityOptions: { interfaces: () => ifaces, checkEveryMs: 20, probeOfflineEveryMs: 50 } });
  try {
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(cloud.state.pushes.length, pushesBefore, "nothing reaches the cloud while offline");
    const status = (await asAdmin("GET", "/sync/status")).body;
    assert.equal(status.connectivity.online, false);

    cloud.state.offline = false;
    ifaces = { ...LOOPBACK, ...ETH };
    await waitFor(() => cloud.state.pushes.length > pushesBefore, 5000);
    assert.equal((await asAdmin("GET", "/sync/status")).body.connectivity.online, true);
  } finally {
    stopSync();
    cloud.state.offline = false;
    delete process.env.SYNC_URL;
  }
});

test("a download cut off by unplugging resumes where it stopped, and a stale part is refetched", async () => {
  const rel = `${tag}/p5/video.mp4`;
  const body = "0123456789".repeat(50);
  cloud.state.files[rel] = { id: 42, body };
  const local = path.join(content, "rwandan-education", rel);
  fs.mkdirSync(path.dirname(local), { recursive: true });

  // Half of it arrived before the cable came out.
  fs.writeFileSync(`${local}.part`, body.slice(0, 200));
  await downloadCurriculum([rel]);
  assert.equal(fs.readFileSync(local, "utf8"), body);
  assert.ok(cloud.state.ranges.includes(`/content/${rel} bytes=200-`), "only the rest was fetched");
  assert.ok(!fs.existsSync(`${local}.part`));

  // The cloud changed the file between the two attempts: the resumed bytes don't match, so it
  // starts over and still ends up with the cloud's exact copy.
  const v2 = "abcdefghij".repeat(50);
  cloud.state.files[rel].body = v2;
  fs.writeFileSync(`${local}.part`, body.slice(0, 200));
  await downloadCurriculum([rel]);
  assert.equal(fs.readFileSync(local, "utf8"), v2);
});

test("a download that fails (cable unplugged) is reported as failed, not finished", async () => {
  const rel = `${tag}/p5/later.mp4`;
  cloud.state.files[rel] = { id: 43, body: "x".repeat(100) };
  cloud.state.offline = true;
  try {
    const res = await asAdmin("POST", "/cloud/download", { files: [rel] });
    assert.equal(res.status, 202);
    const status = await waitFor(async () => {
      const s = (await asAdmin("GET", "/cloud/download-status")).body;
      return s.status !== "downloading" && s;
    });
    assert.deepEqual([status.status, status.failed, status.total], ["failed", 1, 1]);
  } finally {
    cloud.state.offline = false;
  }
  await downloadCurriculum([rel]); // plugged back in: downloading again works
  assert.ok(fs.existsSync(path.join(content, "rwandan-education", rel)));
});
