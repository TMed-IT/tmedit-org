import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import seed from "../seed/seed.json" with { type: "json" };
import { hasSlugPathSeparator, validateSlugRequest } from "../src/lib/slug-validation.ts";
import { installSlugConstraints } from "../src/lib/slug-policy.mjs";
import { resetSiteContent } from "../src/lib/seed-reset.mjs";

test("CMS requests reject slash slugs and leave valid slug requests readable", async () => {
  for (const path of ["content/pages", "content/pages/page-id", "content/news/news-id", "taxonomies/category/terms", "taxonomies/category/terms/festival"]) {
    for (const slug of ["festival/2026", "festival%2F2026", "festival%2f2026"]) {
      const request = new Request(`https://tmedit.org/_emdash/api/${path}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }),
      });
      const response = await validateSlugRequest(request);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error.message, /slugに \/.*使用できません/);
      assert.deepEqual(await request.json(), { slug });
    }
  }
  for (const slug of ["festival-2026", "大森祭2026", null, undefined]) {
    const request = new Request("https://tmedit.org/_emdash/api/content/pages", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }),
    });
    assert.equal(await validateSlugRequest(request), null);
  }
  assert.equal(hasSlugPathSeparator("festival-2026"), false);
  const unrelated = new Request("https://tmedit.org/api/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"slug":"a/b"}',
  });
  assert.equal(await validateSlugRequest(unrelated), null);
});

test("slug API validation detects reserved paths and collisions across page/category namespaces", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE ec_pages (id TEXT PRIMARY KEY, slug TEXT, deleted_at TEXT);
      CREATE TABLE taxonomies (id TEXT PRIMARY KEY, name TEXT, slug TEXT);
      INSERT INTO ec_pages VALUES ('page', 'guide', NULL);
      INSERT INTO ec_pages VALUES ('trashed', 'old-guide', '2026-01-01');
      INSERT INTO taxonomies VALUES ('category', 'category', 'festival');`);
    const adapter = { prepare: sql => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) ?? null }) }) };
    for (const [path, slug] of [
      ["content/pages", "festival"], ["taxonomies/category/terms", "guide"],
      ["content/pages", "newsroom"], ["taxonomies/category/terms", "newsroom"],
      ["content/pages", "robots.txt"], ["taxonomies/category/terms", "sitemap-pages.xml"],
    ]) {
      const request = new Request(`https://tmedit.org/_emdash/api/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }),
      });
      const response = await validateSlugRequest(request, adapter);
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error.code, "CONFLICT");
    }
    const valid = new Request("https://tmedit.org/_emdash/api/taxonomies/category/terms", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"slug":"old-guide"}',
    });
    assert.equal(await validateSlugRequest(valid, adapter), null);
  } finally { db.close(); }
});

test("DB conflict checks cover inserts, renames, restored pages and staged draft slugs", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE ec_pages (id TEXT PRIMARY KEY, slug TEXT, deleted_at TEXT);
      CREATE TABLE taxonomies (id TEXT PRIMARY KEY, name TEXT, slug TEXT);
      CREATE TABLE revisions (id TEXT PRIMARY KEY, collection TEXT, data TEXT);
      INSERT INTO ec_pages VALUES ('page', 'guide', NULL);
      INSERT INTO ec_pages VALUES ('trashed', 'festival', '2026-01-01');
      INSERT INTO taxonomies VALUES ('category', 'category', 'festival');`);
    db.exec(await readFile(new URL("../migrations/0005_slug_route_conflicts.sql", import.meta.url), "utf8"));
    assert.throws(() => db.exec("INSERT INTO ec_pages VALUES ('bad', 'festival', NULL)"), /page slug conflicts/);
    assert.throws(() => db.exec("INSERT INTO taxonomies VALUES ('bad', 'category', 'guide')"), /category slug conflicts/);
    assert.throws(() => db.exec("UPDATE ec_pages SET slug = 'festival' WHERE id = 'page'"), /page slug conflicts/);
    assert.throws(() => db.exec("UPDATE taxonomies SET slug = 'guide' WHERE id = 'category'"), /category slug conflicts/);
    assert.throws(() => db.exec("UPDATE ec_pages SET deleted_at = NULL WHERE id = 'trashed'"), /page slug conflicts/);
    assert.throws(() => db.exec(`INSERT INTO revisions VALUES ('bad', 'pages', '{"_slug":"festival"}')`), /draft page slug conflicts/);
    for (const slug of ["newsroom", "_emdash", "favicon.svg", "sitemap-pages.xml", ".", ".."]) {
      assert.throws(() => db.prepare("INSERT INTO ec_pages VALUES ('bad', ?, NULL)").run(slug), /page slug conflicts/);
      assert.throws(() => db.prepare("INSERT INTO taxonomies VALUES ('bad', 'category', ?)").run(slug), /category slug conflicts/);
    }
    db.exec("INSERT INTO ec_pages VALUES ('good', 'new-guide', NULL)");
    assert.equal(db.prepare("SELECT slug FROM ec_pages WHERE id = 'page'").get().slug, "guide");
  } finally { db.close(); }
});

test("CMS reset restores DB slug constraints after replacing the pages/news tables", async () => {
  const { Kysely, CompiledQuery } = createRequire(import.meta.resolve("emdash/db"))("kysely");
  const db = new Kysely({ dialect: createDialect({ url: ":memory:" }) });
  try {
    await runMigrations(db);
    await applySeed(db, seed, { includeContent: true });
    // Validate the immutable SQL migrations against the actual EmDash schema.
    for (const file of ["0004_single_segment_slugs.sql", "0005_slug_route_conflicts.sql"]) {
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8");
      for (const statement of sql.match(/CREATE TRIGGER[\s\S]*?END;/g)) {
        await db.executeQuery(CompiledQuery.raw(statement));
      }
    }
    await resetSiteContent(db, ["pages", "news"]);
    await assert.rejects(db.executeQuery(CompiledQuery.raw("UPDATE ec_pages SET slug = 'a/b' WHERE slug = 'privacy'")), /slug cannot contain a slash/);
    await assert.rejects(db.executeQuery(CompiledQuery.raw("UPDATE ec_pages SET slug = 'newsroom' WHERE slug = 'privacy'")), /page slug conflicts/);
    // Installation is idempotent, including a repeated reset.
    await installSlugConstraints(db);
    await resetSiteContent(db, ["pages"]);
    await assert.rejects(db.executeQuery(CompiledQuery.raw("UPDATE ec_pages SET slug = 'a%2Fb' WHERE slug = 'privacy'")), /slug cannot contain a slash/);
  } finally { await db.destroy(); }
});

test("DB constraints reject slash slugs in pages, categories and staged drafts without rewriting existing content", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE ec_pages (id TEXT PRIMARY KEY, slug TEXT, title TEXT);
      CREATE TABLE ec_news (id TEXT PRIMARY KEY, slug TEXT);
      CREATE TABLE taxonomies (id TEXT PRIMARY KEY, name TEXT, slug TEXT);
      CREATE TABLE revisions (id TEXT PRIMARY KEY, collection TEXT, data TEXT);
      INSERT INTO ec_pages VALUES ('existing', 'privacy', 'Keep');`);
    db.exec(await readFile(new URL("../migrations/0004_single_segment_slugs.sql", import.meta.url), "utf8"));
    for (const slug of ["a/b", "a%2Fb", "a%2fb"]) {
      for (const table of ["ec_pages", "ec_news"]) {
        assert.throws(() => db.prepare(`INSERT INTO ${table} (id, slug) VALUES ('bad', ?)`).run(slug), /slug cannot contain a slash/);
      }
      assert.throws(() => db.prepare("UPDATE ec_pages SET slug = ? WHERE id = 'existing'").run(slug), /slug cannot contain a slash/);
      assert.throws(() => db.prepare("INSERT INTO taxonomies VALUES ('bad', 'category', ?)").run(slug), /category slug cannot contain a slash/);
      for (const collection of ["pages", "news"]) {
        assert.throws(() => db.prepare("INSERT INTO revisions VALUES ('bad', ?, ?)").run(collection, JSON.stringify({ _slug: slug })), /draft slug cannot contain a slash/);
      }
    }
    db.exec(`INSERT INTO taxonomies VALUES ('child', 'category', 'festival-2026');
      INSERT INTO revisions VALUES ('draft', 'pages', '{"_slug":"guide"}');`);
    assert.throws(() => db.exec("UPDATE taxonomies SET slug = 'a/b' WHERE id = 'child'"), /category slug cannot contain a slash/);
    assert.throws(() => db.exec(`UPDATE revisions SET data = '{"_slug":"a/b"}' WHERE id = 'draft'`), /draft slug cannot contain a slash/);
    assert.equal(db.prepare("SELECT title FROM ec_pages WHERE id = 'existing'").get().title, "Keep");
    assert.equal(db.prepare("SELECT slug FROM taxonomies WHERE id = 'child'").get().slug, "festival-2026");
  } finally { db.close(); }
});
