import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import { ensureTaxonomySetup } from "../src/lib/taxonomy-setup.mjs";
import seed from "../seed/seed.json" with { type: "json" };

const { Kysely } = createRequire(import.meta.resolve("emdash/db"))("kysely");

test("fresh sites prune unused built-in classifications, retain omorisai, and install URL constraints once", async () => {
  const db = new Kysely({ dialect: createDialect({ url: ":memory:" }) });
  try {
    await runMigrations(db);
    await applySeed(db, seed, { includeContent: true });
    assert.equal(await ensureTaxonomySetup(db), true);
    const definitions = await db.selectFrom("_emdash_taxonomy_defs").select("name").execute();
    assert.deepEqual(definitions.map(def => def.name), ["omorisai"]);
    assert.equal((await db.selectFrom("taxonomies").selectAll().where("name", "=", "omorisai").execute())[0].slug, "2026");
    await assert.rejects(db.updateTable("ec_pages").set({ slug: "omorisai" }).where("slug", "=", "privacy").execute(), /page slug conflicts/);
    assert.equal(await ensureTaxonomySetup(db), true);
  } finally { await db.destroy(); }
});

test("startup never prunes an existing category with terms or a user-created taxonomy", async () => {
  const db = new Kysely({ dialect: createDialect({ url: ":memory:" }) });
  try {
    await runMigrations(db);
    await applySeed(db, { ...seed, taxonomies: [
      { name: "category", label: "カテゴリー", collections: ["pages"], hierarchical: true, terms: [{ slug: "keep", label: "Keep" }] },
      { name: "technology", label: "使用技術", collections: ["pages"], hierarchical: false },
    ] }, { includeContent: true });
    await ensureTaxonomySetup(db);
    assert.equal((await db.selectFrom("_emdash_taxonomy_defs").select("name").where("name", "=", "category").execute()).length > 0, true);
    assert.equal((await db.selectFrom("_emdash_taxonomy_defs").select("name").where("name", "=", "technology").execute()).length, 1);
    assert.equal((await db.selectFrom("taxonomies").select("slug").where("name", "=", "category").execute())[0].slug, "keep");
  } finally { await db.destroy(); }
});
