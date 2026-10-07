// Phase 1: real transactions and versioned migrations.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer } from "./helpers.js";

let ctx;

before(async () => {
  ctx = await startTestServer();
  await ctx.db.prepare("CREATE TABLE tx_probe (id INTEGER PRIMARY KEY, note TEXT)").run();
});

after(async () => {
  await ctx.stop();
});

test("a failing transaction rolls back every statement in it", async () => {
  const { localDb } = ctx.dbManager;
  const tx = localDb.transaction(async () => {
    await localDb.prepare("INSERT INTO tx_probe (id, note) VALUES (99, 'tx-test')").run();
    await localDb.prepare("SELECT * FROM table_that_does_not_exist").all();
  });
  await assert.rejects(tx(), /table_that_does_not_exist/);
  const row = await localDb.prepare("SELECT id FROM tx_probe WHERE id = 99").get();
  assert.equal(row, undefined);
});

test("a successful transaction commits, and nested transactions join it", async () => {
  const { localDb } = ctx.dbManager;
  const inner = localDb.transaction(async () => {
    await localDb.prepare("INSERT INTO tx_probe (id, note) VALUES (98, 'inner')").run();
  });
  const outer = localDb.transaction(async () => {
    await localDb.prepare("INSERT INTO tx_probe (id, note) VALUES (97, 'outer')").run();
    await inner();
  });
  await outer();
  const rows = await localDb.prepare("SELECT id FROM tx_probe WHERE id IN (97, 98) ORDER BY id").all();
  assert.deepEqual(rows.map((r) => r.id), [97, 98]);
});

test("the RETURNING-id fallback works inside a transaction", async () => {
  const { localDb } = ctx.dbManager;
  // schema_migrations has a text primary key and no id column.
  const tx = localDb.transaction(async () => {
    const info = await localDb.prepare("INSERT INTO schema_migrations (id) VALUES ('9999_fallback_test')").run();
    assert.equal(info.changes, 1);
  });
  await tx();
  const row = await localDb.prepare("SELECT id FROM schema_migrations WHERE id = '9999_fallback_test'").get();
  assert.ok(row);
});

test("every migration file is applied exactly once", async () => {
  const { pool } = ctx.dbManager;
  const { runMigrations } = await import("../src/db/migrate.js");
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "../src/db/migrations");
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.js$/.test(f)).map((f) => f.replace(/\.js$/, "")).sort();

  await runMigrations(pool); // second run must be a no-op
  const applied = (await pool.query("SELECT id FROM schema_migrations WHERE id NOT LIKE '9999_%' ORDER BY id")).rows.map((r) => r.id);
  assert.deepEqual(applied, files);
});
