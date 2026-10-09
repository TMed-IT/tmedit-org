import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import seed from "../seed/seed.json" with { type: "json" };

const { Kysely } = createRequire(import.meta.resolve("emdash/db"))("kysely");
const sql = await readFile(new URL("../migrations/0001_page_document.sql", import.meta.url), "utf8");
async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), "tmedit-migration-"));
  const path = join(directory, "db.sqlite");
  const db = new Kysely({ dialect: createDialect({ url: `file:${path}` }) });
  try {
    await runMigrations(db);
    const oldSeed = structuredClone(seed);
    oldSeed.collections.find(c => c.slug === "pages").fields = oldSeed.collections.find(c => c.slug === "pages").fields.filter(f => f.slug !== "document");
    await applySeed(db, oldSeed, { includeContent: true });
    await db.destroy();
    const sqlite = new DatabaseSync(path);
    try { await fn(sqlite); } finally { sqlite.close(); }
  } finally { await db.destroy(); await rm(directory, { recursive: true, force: true }); }
}
function apply(db) {
  db.exec("BEGIN");
  try { db.exec(sql); db.exec("COMMIT"); }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

test("PDF migration preserves page content and revisions, and adds the seed's optional file definition", async () => {
  await fixture(db => {
    db.exec(`INSERT INTO revisions (id, collection, entry_id, data) VALUES ('fixture', 'pages', 'fixture', '{"title":"keep"}')`);
    const pages = db.prepare("SELECT * FROM ec_pages").all().map(row => ({ ...row }));
    const revisions = db.prepare("SELECT * FROM revisions").all();
    apply(db);
    assert.deepEqual(db.prepare("SELECT * FROM ec_pages").all().map(({ document, ...page }) => {
      assert.equal(document, null); return page;
    }), pages);
    assert.deepEqual(db.prepare("SELECT * FROM revisions").all(), revisions);
    const field = db.prepare("SELECT * FROM _emdash_fields WHERE slug = 'document'").get();
    assert.equal(field.type, "file");
    assert.equal(field.column_type, "TEXT");
    assert.equal(field.required, 0);
    assert.deepEqual(JSON.parse(field.validation), seed.collections.find(c => c.slug === "pages").fields.find(f => f.slug === "document").validation);
    assert.equal(db.prepare("SELECT status FROM _emdash_media_usage_index_status WHERE scope_key = 'pages'").get().status, "stale");
    assert.throws(() => apply(db));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM _emdash_fields WHERE slug = 'document'").get().count, 1);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = '_tmedit_page_document_guard'").get(), undefined);
  });
});

test("PDF migration invalidates active media coverage and rolls back when active coverage is missing", async () => {
  await fixture(db => {
    db.exec("UPDATE _emdash_media_usage_activation SET state = 'active' WHERE task_key = 'incremental_capture'");
    // If activation has no row in this version's fresh seed, insert the minimal identity.
    db.exec("INSERT OR IGNORE INTO _emdash_media_usage_activation (task_key, state) VALUES ('incremental_capture', 'active')");
    db.exec("DELETE FROM _emdash_media_usage_index_status WHERE scope_key = 'pages'");
    assert.throws(() => apply(db));
    assert.equal(db.prepare("SELECT 1 FROM pragma_table_info('ec_pages') WHERE name = 'document'").get(), undefined);
    db.exec(`INSERT INTO _emdash_media_usage_index_status
      (adapter_id, scope_type, scope_key, status, collection_id, capture_state, change_epoch, reconciliation_required)
      SELECT 'content-media', 'collection', 'pages', 'complete', id, 'active', 7, 0 FROM _emdash_collections WHERE slug = 'pages'`);
    apply(db);
    const status = db.prepare("SELECT * FROM _emdash_media_usage_index_status WHERE scope_key = 'pages'").get();
    assert.equal(status.status, "stale");
    assert.equal(status.change_epoch, 8);
    assert.equal(status.reconciliation_required, 1);
  });
});
