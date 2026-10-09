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
const categorySql = await readFile(new URL("../migrations/0002_page_categories.sql", import.meta.url), "utf8");
const legacySql = await readFile(new URL("../migrations/0003_remove_legacy_posts.sql", import.meta.url), "utf8");
async function fixture(fn, prepareSeed = () => {}) {
  const directory = await mkdtemp(join(tmpdir(), "tmedit-migration-"));
  const path = join(directory, "db.sqlite");
  const db = new Kysely({ dialect: createDialect({ url: `file:${path}` }) });
  try {
    await runMigrations(db);
    const oldSeed = structuredClone(seed);
    delete oldSeed.taxonomies;
    oldSeed.collections.find(c => c.slug === "pages").fields = oldSeed.collections.find(c => c.slug === "pages").fields.filter(f => f.slug !== "document");
    prepareSeed(oldSeed);
    await applySeed(db, oldSeed, { includeContent: true });
    await db.destroy();
    const sqlite = new DatabaseSync(path);
    try { await fn(sqlite); } finally { sqlite.close(); }
  } finally { await db.destroy(); await rm(directory, { recursive: true, force: true }); }
}
function apply(db, migration = sql) {
  db.exec("BEGIN");
  try { db.exec(migration); db.exec("COMMIT"); }
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

test("legacy post migration deletes legacy collections and metadata but preserves categories and existing pages", async () => {
  await fixture(db => {
    db.exec(`INSERT INTO taxonomies (id, name, slug, label, locale, translation_group, data)
      VALUES ('category-term', 'category', 'festival', '大森祭', 'ja', 'category-term', '{"description":"説明"}'),
             ('legacy-tag', 'tag', 'legacy', 'Legacy', 'ja', 'legacy-tag', '{}');
      INSERT INTO content_taxonomies (collection, entry_id, taxonomy_id)
      SELECT 'pages', translation_group, 'category-term' FROM ec_pages LIMIT 1;
      INSERT INTO content_taxonomies (collection, entry_id, taxonomy_id)
      VALUES ('posts', 'legacy-posts', 'category-term'), ('post', 'legacy-post', 'legacy-tag');
      INSERT INTO revisions (id, collection, entry_id, data)
      VALUES ('legacy-revision', 'posts', 'legacy-posts', '{}'), ('page-revision', 'pages', 'page', '{}');
      INSERT INTO _emdash_seo (collection, content_id) VALUES ('posts', 'legacy-posts');
      INSERT INTO _emdash_comments (id, collection, content_id, author_name, author_email, body)
      VALUES ('legacy-comment', 'post', 'legacy-post', 'Author', 'author@example.com', 'Comment');
      INSERT INTO _emdash_comment_reactions (id, comment_id, voter_hash)
      VALUES ('legacy-reaction', 'legacy-comment', 'hash');
      CREATE VIRTUAL TABLE _emdash_fts_posts USING fts5(title);
      UPDATE _emdash_taxonomy_def_groups SET collections = '["post","posts","news"]' WHERE name = 'category';`);
    apply(db, categorySql);
    const pages = db.prepare("SELECT * FROM ec_pages").all();
    const categories = db.prepare("SELECT * FROM taxonomies WHERE name = 'category'").all();
    const pageAssignments = db.prepare("SELECT * FROM content_taxonomies WHERE collection = 'pages'").all();
    const remainingRevisions = db.prepare("SELECT * FROM revisions WHERE collection NOT IN ('post', 'posts')").all();
    const legacyFields = db.prepare("SELECT f.id FROM _emdash_fields f JOIN _emdash_collections c ON c.id = f.collection_id WHERE c.slug IN ('post', 'posts')").all();
    apply(db, legacySql);
    assert.deepEqual(db.prepare("SELECT * FROM ec_pages").all(), pages);
    assert.deepEqual(db.prepare("SELECT * FROM taxonomies WHERE name = 'category'").all(), categories);
    assert.deepEqual(db.prepare("SELECT * FROM content_taxonomies").all(), pageAssignments);
    assert.deepEqual(JSON.parse(db.prepare("SELECT collections FROM _emdash_taxonomy_def_groups WHERE name = 'category'").get().collections), ["news", "pages"]);
    assert.equal(db.prepare("SELECT 1 FROM _emdash_taxonomy_defs WHERE name = 'tag'").get(), undefined);
    for (const table of ["ec_post", "ec_posts", "_emdash_fts_posts"]) {
      assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(table), undefined);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _emdash_collections WHERE slug IN ('post', 'posts')").get().n, 0);
    assert.equal(legacyFields.length, 2);
    for (const field of legacyFields) assert.equal(db.prepare("SELECT 1 FROM _emdash_fields WHERE id = ?").get(field.id), undefined);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _emdash_seo WHERE collection IN ('post', 'posts')").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _emdash_comment_reactions").get().n, 0);
    assert.deepEqual(db.prepare("SELECT * FROM revisions").all(), remainingRevisions);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM _emdash_comments").get().n, 0);
    // Missing legacy collections and repeated application are both supported.
    apply(db, legacySql);
    assert.deepEqual(db.prepare("SELECT * FROM ec_pages").all(), pages);
  }, oldSeed => {
    for (const slug of ["post", "posts"]) {
      oldSeed.collections.push({ slug, label: "Legacy", fields: [{ slug: "title", label: "Title", type: "string" }] });
      oldSeed.content[slug] = [{ id: `legacy-${slug}`, slug: "legacy", status: "published", data: { title: "Legacy" } }];
    }
  });
});

test("legacy post migration also handles orphaned metadata after the collection was already deleted", async () => {
  await fixture(db => {
    apply(db, categorySql);
    db.exec("INSERT INTO revisions (id, collection, entry_id, data) VALUES ('orphan', 'posts', 'missing', '{}')");
    const pages = db.prepare("SELECT * FROM ec_pages").all();
    apply(db, legacySql);
    assert.deepEqual(db.prepare("SELECT * FROM ec_pages").all(), pages);
    assert.equal(db.prepare("SELECT 1 FROM revisions WHERE id = 'orphan'").get(), undefined);
    assert.deepEqual(JSON.parse(db.prepare("SELECT collections FROM _emdash_taxonomy_def_groups WHERE name = 'category'").get().collections), ["pages"]);
  });
});

test("category migration preserves existing targets, translated labels, terms, descriptions, hierarchy, and page assignments", async () => {
  await fixture(db => {
    db.exec(`INSERT INTO _emdash_taxonomy_def_groups (id, name, hierarchical, collections)
      VALUES ('category-group', 'category', 1, '["posts","news"]')
      ON CONFLICT(name) DO UPDATE SET hierarchical = 1, collections = '["posts","news"]';
      INSERT INTO _emdash_taxonomy_defs (id, name, label, locale, hierarchical, collections, translation_group)
      VALUES ('category-ja', 'category', 'カテゴリー', 'ja', 1, '["posts","news"]', 'category-group'),
             ('category-en', 'category', 'Categories', 'en', 1, '["posts","news"]', 'category-group')
      ON CONFLICT(name, locale) DO UPDATE SET label = excluded.label;
      INSERT INTO taxonomies (id, name, slug, label, locale, translation_group, parent_id, data)
      VALUES ('parent-ja', 'category', 'festival', '大森祭', 'ja', 'parent-ja', NULL, '{"description":"説明文"}'),
             ('child-ja', 'category', 'festival-2026', '大森祭2026', 'ja', 'child-ja', 'parent-ja', '{}');
      INSERT INTO content_taxonomies (collection, entry_id, taxonomy_id)
      SELECT 'pages', id, 'child-ja' FROM ec_pages LIMIT 1;`);
    const terms = db.prepare("SELECT * FROM taxonomies ORDER BY id").all();
    const assignments = db.prepare("SELECT * FROM content_taxonomies").all();
    const pages = db.prepare("SELECT * FROM ec_pages").all();
    const labels = db.prepare("SELECT id, label FROM _emdash_taxonomy_defs WHERE name = 'category' ORDER BY id").all();
    apply(db, categorySql);
    const group = db.prepare("SELECT * FROM _emdash_taxonomy_def_groups WHERE name = 'category'").get();
    assert.deepEqual(JSON.parse(group.collections), ["posts", "news", "pages"]);
    for (const row of db.prepare("SELECT * FROM _emdash_taxonomy_defs WHERE name = 'category'").all()) {
      assert.equal(row.collections, group.collections);
      assert.equal(row.translation_group, group.id);
      assert.equal(row.hierarchical, 1);
    }
    assert.deepEqual(db.prepare("SELECT id, label FROM _emdash_taxonomy_defs WHERE name = 'category' ORDER BY id").all(), labels);
    assert.deepEqual(db.prepare("SELECT * FROM taxonomies ORDER BY id").all(), terms);
    assert.deepEqual(db.prepare("SELECT * FROM content_taxonomies").all(), assignments);
    assert.deepEqual(db.prepare("SELECT * FROM ec_pages").all(), pages);
    apply(db, categorySql);
    assert.deepEqual(JSON.parse(db.prepare("SELECT collections FROM _emdash_taxonomy_def_groups WHERE name = 'category'").get().collections), ["posts", "news", "pages"]);
  });
});

test("category migration restores a missing shared definition and rolls back if the existing definition is invalid", async () => {
  await fixture(db => {
    db.exec(`INSERT INTO _emdash_taxonomy_defs (id, name, label, locale, hierarchical, collections)
      VALUES ('category-ja', 'category', 'カテゴリー', 'ja', 1, '["posts"]')
      ON CONFLICT(name, locale) DO UPDATE SET hierarchical = 1, collections = '["posts"]';
      DELETE FROM _emdash_taxonomy_def_groups WHERE name = 'category';`);
    apply(db, categorySql);
    assert.deepEqual(JSON.parse(db.prepare("SELECT collections FROM _emdash_taxonomy_def_groups WHERE name = 'category'").get().collections), ["posts", "pages"]);
    db.exec("UPDATE _emdash_taxonomy_def_groups SET collections = '{}' WHERE name = 'category'");
    assert.throws(() => apply(db, categorySql));
    assert.equal(db.prepare("SELECT collections FROM _emdash_taxonomy_def_groups WHERE name = 'category'").get().collections, '{}');
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = '_tmedit_page_categories_guard'").get(), undefined);
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
