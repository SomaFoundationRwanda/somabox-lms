// Explore follows the files on disk: cloud downloads, uploads, and files copied by hand all show
// up; deleted files disappear; edited titles and hidden flags survive rescans.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, USERS } from "./helpers.js";

process.env.EXPLORE_COVERS = "off";
let ctx;
let db;
let content;
const tag = `t${process.pid}`;
const call = (who) => (method, url, body) => ctx.api(method, url, { token: ctx.tokens[who], body });
const asAdmin = call("admin");
const asTeacher = call("teacher");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  ({ config: { paths: { content } } } = await import("../src/config/index.js"));
});

after(async () => {
  for (const root of ["rwandan-education", "custom-content"]) fs.rmSync(path.join(content, root, tag), { recursive: true, force: true });
  await ctx.stop();
});

function put(rel, body = "x") {
  const file = path.join(content, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}
const rescan = async () => {
  const res = await asAdmin("POST", "/content/manager/rescan");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};
const explore = async () => (await ctx.api("GET", "/content/explore")).body;
const fileGet = (key, who) => fetch(`${ctx.baseUrl}/content/files/${key}`, { headers: who ? { Authorization: `Bearer ${ctx.tokens[who]}` } : {} });

test("files copied onto the box appear in Explore after a rescan, under one catalogue", async () => {
  // Leftovers of the old index: an unprefixed folder and the "school-content" placeholder.
  await db.prepare("INSERT INTO categories (title, path_key, is_main) VALUES ('School content', 'school-content', 1)").run();
  await db.prepare("INSERT INTO categories (title, path_key) VALUES ('Nursery', 'nursery-school-content')").run();

  put(`rwandan-education/${tag}/primary/p5-maths/fractions-lesson.mp4`);
  put(`rwandan-education/${tag}/primary/p5-maths/workbook.pdf`);
  put(`rwandan-education/${tag}/primary/p5-maths/extra/more.pdf`);
  put(`rwandan-education/${tag}/primary/notes.docx`); // not something Explore can open
  put(`rwandan-education/${tag}/.hidden/secret.pdf`);
  put(`custom-content/${tag}/songs/morning-song.mp3`);

  const stats = await rescan();
  assert.ok(stats.filesAdded >= 4);
  const cat = await explore();
  assert.ok(cat.version >= 1);
  const mains = cat.mainCategories.map((m) => [m.slug, m.kind]);
  assert.deepEqual(mains, [["rwandan-education", "files"], ["custom-content", "files"], ["international-education", "web"]]);
  assert.equal(cat.mainCategories[1].title, "School content");
  assert.ok(cat.mainCategories[2].items.some((i) => i.slug === "wikipedia"));
  assert.equal(await db.prepare("SELECT 1 FROM categories WHERE path_key IN ('school-content', 'nursery-school-content')").get(), undefined, "old rows are cleaned up");

  const folder = cat.summary[`rwandan-education/${tag}/primary/p5-maths`];
  assert.equal(folder.title, "P5 maths");
  assert.deepEqual(folder.content.map((c) => [c.title, c.type, c.url]).sort(), [
    ["Fractions lesson", "video", `/rwandan-education/${tag}/primary/p5-maths/fractions-lesson.mp4`],
    ["Workbook", "book", `/rwandan-education/${tag}/primary/p5-maths/workbook.pdf`],
  ]);
  assert.deepEqual(folder.items.map((i) => [i.slug, i.count]), [[`rwandan-education/${tag}/primary/p5-maths/extra`, 1]], "subfolders of a folder with files are kept");
  assert.equal(cat.summary[`rwandan-education/${tag}/.hidden`], undefined);
  assert.ok(!JSON.stringify(cat).includes("notes.docx"));
  assert.equal(cat.summary[`custom-content/${tag}/songs`].content[0].type, "audio");
  // Guests can browse the catalogue, but opening needs an account.
  assert.equal((await fileGet(`custom-content/${tag}/songs/morning-song.mp3`)).status, 401);
  assert.equal((await fileGet(`custom-content/${tag}/songs/morning-song.mp3`, "student")).status, 200);
});

test("what's deleted from disk disappears; edited titles and hidden flags survive rescans", async () => {
  put(`custom-content/${tag}/keep/a.pdf`);
  put(`custom-content/${tag}/keep/b.pdf`);
  put(`custom-content/${tag}/private/c.pdf`);
  await rescan();
  const key = `custom-content/${tag}/keep/a.pdf`;
  assert.equal((await asTeacher("PATCH", "/content/manager/details", { target: "content", path_key: key, title: "Reading book", subtitle: "Week 1" })).status, 200);
  assert.equal((await asTeacher("PATCH", "/content/manager/toggle", { target: "content", path_key: `custom-content/${tag}/keep/b.pdf`, is_disabled: true })).status, 200);
  assert.equal((await asTeacher("PATCH", "/content/manager/toggle", { target: "category", path_key: `custom-content/${tag}/private`, is_disabled: true })).status, 200);

  fs.rmSync(path.join(content, `custom-content/${tag}/songs`), { recursive: true, force: true });
  await rescan();
  const cat = await explore();
  const keep = cat.summary[`custom-content/${tag}/keep`];
  assert.deepEqual(keep.content.map((c) => [c.title, c.description]), [["Reading book", "Week 1"]], "edited title kept; hidden file left out");
  assert.equal(cat.summary[`custom-content/${tag}/private`], undefined, "hidden folder left out");
  assert.equal(cat.summary[`custom-content/${tag}/songs`], undefined, "deleted from disk");
  assert.equal(await db.prepare("SELECT 1 FROM content_items WHERE path_key LIKE ?").get(`custom-content/${tag}/songs/%`), undefined);

  // Hidden files don't open for learners; staff can still preview them.
  assert.equal((await fileGet(`custom-content/${tag}/private/c.pdf`, "student")).status, 404);
  assert.equal((await fileGet(`custom-content/${tag}/keep/b.pdf`, "student")).status, 404);
  assert.equal((await fileGet(`custom-content/${tag}/private/c.pdf`, "teacher")).status, 200);
});

test("uploads: same name never overwrites, only Explore file types, teachers manage school content only", async () => {
  await rescan();
  const folder = await asTeacher("POST", "/content/manager/create-folder", { path: `custom-content`, name: `${tag} Uploads` });
  assert.equal(folder.status, 201, JSON.stringify(folder.body));
  const parent = folder.body.path_key;
  const send = (name, body) => {
    const form = new FormData();
    form.append("path", parent);
    form.append("file", new Blob([body]), name);
    return fetch(`${ctx.baseUrl}/content/manager/upload`, { method: "POST", headers: { Authorization: `Bearer ${ctx.tokens.teacher}` }, body: form });
  };
  const first = await send("story.pdf", "original");
  assert.equal(first.status, 201);
  assert.equal((await first.json()).type, "book", "type comes from the extension");
  assert.equal((await send("story.pdf", "replacement")).status, 409);
  assert.equal(fs.readFileSync(path.join(content, parent, "story.pdf"), "utf8"), "original", "the existing file is untouched");
  assert.equal((await send("virus.exe", "x")).status, 400);
  const cat = await explore();
  assert.equal(cat.summary[parent].content[0].title, "Story");
  assert.equal((await asTeacher("GET", `/content/manager/list?path=${encodeURIComponent(parent)}`)).body.items.length, 1);

  // Deleting: a folder with files needs to be confirmed.
  assert.equal((await asTeacher("DELETE", "/content/manager/item", { path_key: parent })).status, 409);
  assert.equal((await asTeacher("DELETE", "/content/manager/item", { path_key: parent, recursive: true })).status, 204);
  assert.ok(!fs.existsSync(path.join(content, parent)));

  // Cloud content: teachers can't touch it; admins can hide or rename, not upload or delete here.
  put(`rwandan-education/${tag}/cloud/lesson.mp4`);
  await rescan();
  const cloudKey = `rwandan-education/${tag}/cloud/lesson.mp4`;
  assert.equal((await asTeacher("GET", `/content/manager/list?path=rwandan-education`)).status, 400);
  assert.equal((await asTeacher("PATCH", "/content/manager/toggle", { target: "content", path_key: cloudKey, is_disabled: true })).status, 404);
  assert.equal((await asAdmin("PATCH", "/content/manager/toggle", { target: "content", path_key: cloudKey, is_disabled: true })).status, 200);
  assert.equal((await asAdmin("DELETE", "/content/manager/item", { path_key: cloudKey })).status, 400);
  assert.equal((await asAdmin("GET", "/content/manager/list?path=rwandan-education")).status, 200);
  assert.equal((await call("student")("POST", "/content/manager/rescan")).status, 403);
});

test("the files route only serves Explore folders", async () => {
  const courseId = await ctx.createCourse("Private files");
  put(`course-files/${courseId}/answers.pdf`);
  try {
    assert.equal((await fileGet(`course-files/${courseId}/answers.pdf`, "outsider")).status, 404, "course files aren't reachable through Explore");
    assert.equal((await fileGet("custom-content/..%2F..%2Fpackage.json", "student")).status, 404);
    assert.equal((await fileGet("library/1.pdf", "student")).status, 404);
  } finally {
    fs.rmSync(path.join(content, "course-files", courseId), { recursive: true, force: true });
  }
  assert.equal(USERS.student.role, "scholar");
});
