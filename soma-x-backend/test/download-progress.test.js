// Download progress for the admin pages: "13 of 20, 65%", what's on its way, and what failed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDownloadProgress } from "../src/services/sync/download-progress.js";

test("counts files and bytes, and only reaches 100% when the batch is over", () => {
  const p = createDownloadProgress();
  assert.equal(p.snapshot().status, "init");
  p.start([{ key: "a", size: 100 }, { key: "b", size: 300 }, { key: "c", size: 600 }]);
  assert.equal(p.running, true);

  p.begin("a", "A book");
  p.bytes("a", 50);
  let s = p.snapshot();
  assert.deepEqual([s.done, s.total, s.bytesDone, s.bytesTotal, s.percent], [0, 3, 50, 1000, 5]);
  assert.deepEqual(s.current, ["A book"]);

  p.bytes("a", 500); // a re-fetch never counts for more than the file's size
  p.finish("a", "A book", "downloaded");
  p.finish("b", "B book", "skipped");
  p.begin("c", "C book");
  p.finish("c", "C book", "failed");
  s = p.snapshot();
  assert.deepEqual([s.done, s.downloaded, s.skipped, s.failed, s.bytesDone, s.percent], [3, 1, 1, 1, 1000, 99]);
  assert.deepEqual([s.current, s.failedNames], [[], ["C book"]]);

  p.end();
  s = p.snapshot();
  assert.deepEqual([s.status, s.percent, p.running], ["failed", 100, false]);
});

test("without sizes the bar counts files", () => {
  const p = createDownloadProgress();
  p.start([{ key: "a" }, { key: "b", size: 10 }, { key: "c" }, { key: "d" }]);
  p.finish("a", "a", "downloaded");
  assert.equal(p.snapshot().percent, 25);
  for (const k of ["b", "c", "d"]) p.finish(k, k, "updated");
  p.end();
  assert.deepEqual([p.snapshot().status, p.snapshot().percent, p.snapshot().downloaded], ["finished", 100, 4]);
});
