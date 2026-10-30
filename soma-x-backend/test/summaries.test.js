// AI summaries for learners: made once per file and language from the file's own text (books) or
// a transcript next to it (videos), shared by everyone, limited per learner, and switchable.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, USERS } from "./helpers.js";

process.env.EXPLORE_COVERS = "off";
process.env.SUMMARY_DAILY_LIMIT = "3";
let ctx;
let db;
let content;
let summaries;
const tag = `s${process.pid}`;
const call = (who) => (method, url, body) => ctx.api(method, url, { token: ctx.tokens[who], body });
const asStudent = call("student");
const asAdmin = call("admin");

/** A small real PDF with a line of text on each of its pages. */
function pdfWith(lines) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const pagesId = objects.length + 1 + lines.length * 2;
  for (const line of lines) {
    const stream = `BT /F1 12 Tf 40 700 Td (${line}) Tj ET`;
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function put(rel, body) {
  const file = path.join(content, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  ({ config: { paths: { content } } } = await import("../src/config/index.js"));
  summaries = await import("../src/services/explore/summaries.js");
  const sentence = "Aline shares six mangoes equally with two friends so each child gets two mangoes";
  put(`custom-content/${tag}/maths/sharing.pdf`, pdfWith(Array.from({ length: 6 }, (_, i) => `${sentence} on page ${i + 1}.`)));
  put(`custom-content/${tag}/maths/lesson.mp4`, "video");
  put(`custom-content/${tag}/maths/lesson.vtt`, "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nToday we learn about quarters.\n\n2\n00:00:04.000 --> 00:00:08.000\n<v Teacher>A quarter is one of four equal parts.\n");
  put(`custom-content/${tag}/maths/no-transcript.mp4`, "video");
  await asAdmin("POST", "/content/manager/rescan");
});

after(async () => {
  fs.rmSync(path.join(content, "custom-content", tag), { recursive: true, force: true });
  await ctx.stop();
});

test("a book's own text is read: PDF pages, and video transcripts without timestamps", async () => {
  const { extractText, splitText } = await import("../src/services/explore/text.js");
  const pdf = await extractText(`custom-content/${tag}/maths/sharing.pdf`);
  assert.equal(pdf.source, "pdf");
  assert.match(pdf.text, /Aline shares six mangoes.*page 6/s);
  const video = await extractText(`custom-content/${tag}/maths/lesson.mp4`);
  assert.equal(video.text, "Today we learn about quarters. A quarter is one of four equal parts.");
  assert.equal((await extractText(`custom-content/${tag}/maths/no-transcript.mp4`)).reason, "no_transcript");

  const long = Array.from({ length: 100 }, (_, i) => `Sentence number ${i} is here.`).join(" ").repeat(20);
  const { parts, total } = splitText(long, { size: 1000, max: 4 });
  assert.equal(parts.length, 4);
  assert.ok(total > 4, "long books are sampled from start to end");
  assert.ok(parts[0].endsWith("."), "parts end at sentence ends");
});

test("a learner asks once; it's made in the background and then shared with everyone", async () => {
  const key = `custom-content/${tag}/maths/sharing.pdf`;
  const url = `/content/summary?path=${encodeURIComponent(key)}`;
  const first = await asStudent("GET", url);
  assert.equal(first.status, 200);
  assert.deepEqual([first.body.enabled, first.body.available, first.body.status, first.body.language], [true, true, "none", "en"]);

  const before = ctx.fakeGateway.state.requests.length;
  const asked = await asStudent("POST", "/content/summary", { path: key });
  assert.equal(asked.status, 202, JSON.stringify(asked.body));
  assert.ok(["queued", "running"].includes(asked.body.status));
  await summaries.waitForSummaries();

  const done = (await asStudent("GET", url)).body;
  assert.equal(done.status, "done");
  assert.match(done.summary.overview, /share things equally/);
  assert.equal(done.summary.keyPoints.length, 3);
  const sent = ctx.fakeGateway.state.requests.slice(before);
  assert.deepEqual([...new Set(sent.map((r) => r.task))], ["notes", "content_summary"]);
  const text = JSON.stringify(sent);
  assert.ok(!text.includes(USERS.student.email), "nothing about the learner goes to the model");
  assert.ok(text.includes("Aline shares six mangoes"), "the book's own text does");

  // Someone else gets the same summary straight away; it isn't made again.
  const count = ctx.fakeGateway.state.requests.length;
  const again = await call("outsider")("POST", "/content/summary", { path: key });
  assert.equal(again.status, 200);
  assert.equal(again.body.status, "done");
  assert.equal(ctx.fakeGateway.state.requests.length, count);
});

test("videos need a transcript; learners have a daily limit; admins can hide summaries or switch them off", async () => {
  const noTranscript = `custom-content/${tag}/maths/no-transcript.mp4`;
  const info = (await asStudent("GET", `/content/summary?path=${encodeURIComponent(noTranscript)}`)).body;
  assert.equal(info.available, false);
  assert.match(info.reason, /transcript/);
  const refused = await asStudent("POST", "/content/summary", { path: noTranscript });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, "NO_TRANSCRIPT");

  const video = `custom-content/${tag}/maths/lesson.mp4`;
  assert.equal((await asStudent("POST", "/content/summary", { path: video })).status, 202);
  await summaries.waitForSummaries();
  assert.equal((await asStudent("GET", `/content/summary?path=${encodeURIComponent(video)}`)).body.status, "done");

  // The limit counts new summaries a learner starts (3 a day in this test).
  for (let i = 0; i < 2; i++) put(`custom-content/${tag}/extra/book${i}.pdf`, pdfWith(["Some text about fractions and sharing for the learners to read today."]));
  put(`custom-content/${tag}/extra/book2.pdf`, pdfWith(Array.from({ length: 4 }, (_, i) => `Chapter ${i + 1} explains how quarters and halves are used when sharing food at home.`)));
  await asAdmin("POST", "/content/manager/rescan");
  assert.equal((await asStudent("POST", "/content/summary", { path: `custom-content/${tag}/extra/book0.pdf` })).status, 202);
  const limited = await asStudent("POST", "/content/summary", { path: `custom-content/${tag}/extra/book1.pdf` });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "DAILY_LIMIT");
  await summaries.waitForSummaries();

  // A summary an admin hides isn't shown to learners; teachers still see it.
  const key = `custom-content/${tag}/maths/sharing.pdf`;
  assert.equal((await asAdmin("PATCH", "/content/summary", { path: key, hidden: true })).status, 200);
  assert.equal((await asStudent("GET", `/content/summary?path=${encodeURIComponent(key)}`)).body.status, "hidden");
  assert.equal((await call("teacher")("GET", `/content/summary?path=${encodeURIComponent(key)}`)).body.status, "done");

  // Switched off: nothing new can be asked for.
  assert.equal((await asAdmin("PUT", "/ai/admin/settings", { learnerSummaries: false })).body.learnerSummaries, false);
  const off = await call("teacher")("POST", "/content/summary", { path: `custom-content/${tag}/extra/book2.pdf` });
  assert.equal(off.status, 403);
  assert.equal((await asStudent("GET", `/content/summary?path=${encodeURIComponent(video)}`)).body.enabled, false);
  await asAdmin("PUT", "/ai/admin/settings", { learnerSummaries: true });
});

test("when the model fails the summary says why and can be asked for again; hidden files can't be summarised", async () => {
  const key = `custom-content/${tag}/extra/book2.pdf`;
  ctx.fakeGateway.state.fail = "runtime_unavailable";
  try {
    assert.equal((await call("teacher")("POST", "/content/summary", { path: key })).status, 202);
    await summaries.waitForSummaries();
  } finally {
    ctx.fakeGateway.state.fail = null;
  }
  const failed = (await call("teacher")("GET", `/content/summary?path=${encodeURIComponent(key)}`)).body;
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /isn't running/);
  assert.equal((await call("teacher")("POST", "/content/summary", { path: key })).status, 202, "a failed summary can be asked for again");
  await summaries.waitForSummaries();

  await call("teacher")("PATCH", "/content/manager/toggle", { target: "content", path_key: key, is_disabled: true });
  assert.equal((await asStudent("GET", `/content/summary?path=${encodeURIComponent(key)}`)).status, 404);
  assert.equal((await ctx.api("GET", `/content/summary?path=${encodeURIComponent(key)}`)).status, 401);
});
