import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import seed from "../seed/seed.json" with { type: "json" };
const { Kysely } = createRequire(import.meta.resolve("emdash/db"))("kysely");
const migration = await readFile(new URL("../migrations/0009_rules_collection.sql", import.meta.url), "utf8");
const orderMigration = await readFile(new URL("../migrations/0010_rules_display_order.sql", import.meta.url), "utf8");

for (const active of [false, true]) {
	test(`rules migration preserves existing CMS data and registers fields, indexes and media coverage (active=${active})`, async () => {
		const directory = await mkdtemp(join(tmpdir(), "rules-migration-"));
		const path = join(directory, "db.sqlite");
		const db = new Kysely({ dialect: createDialect({ url: `file:${path}` }) });
		try {
			await runMigrations(db);
			await applySeed(db, { ...seed, collections: seed.collections.filter(c => c.slug !== "rules") }, { includeContent: true });
			await db.destroy();
			const sqlite = new DatabaseSync(path);
			try {
				if (active) sqlite.exec("INSERT INTO _emdash_media_usage_activation (task_key,state) VALUES ('incremental_capture','active') ON CONFLICT(task_key) DO UPDATE SET state='active'");
				const pages = sqlite.prepare("SELECT * FROM ec_pages ORDER BY id").all();
				const fields = sqlite.prepare("SELECT * FROM _emdash_fields ORDER BY id").all();
				const triggers = sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
				sqlite.exec("BEGIN"); sqlite.exec(migration); sqlite.exec("COMMIT");
				assert.deepEqual(sqlite.prepare("SELECT * FROM ec_pages ORDER BY id").all(), pages);
				assert.deepEqual(sqlite.prepare("SELECT * FROM _emdash_fields WHERE collection_id != (SELECT id FROM _emdash_collections WHERE slug='rules') ORDER BY id").all(), fields);
				assert.deepEqual(sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name!='ec_rules' AND name NOT LIKE 'tmedit_rules_%' ORDER BY name").all(), triggers);
				const collection = sqlite.prepare("SELECT * FROM _emdash_collections WHERE slug='rules'").get();
				assert.equal(collection.label, "諸則"); assert.equal(collection.url_pattern, "/docs/{slug}");
				const actual = sqlite.prepare("SELECT slug,type,required,default_value FROM _emdash_fields WHERE collection_id=? ORDER BY sort_order").all(collection.id);
				assert.deepEqual(actual.map(({slug,type,required,default_value}) => ({slug,type,required,defaultValue:default_value ? JSON.parse(default_value) : undefined})), seed.collections.find(c => c.slug === "rules").fields.filter(f => f.slug !== "display_order").map(({slug,type,required,defaultValue}) => ({slug,type,required:Number(required),defaultValue})));
				sqlite.exec("INSERT INTO ec_rules (id,slug,title,content) VALUES ('rule','valid','Title','[]')");
				assert.equal(sqlite.prepare("SELECT campus_only FROM ec_rules WHERE id='rule'").get().campus_only, 1);
				assert.throws(() => sqlite.exec("UPDATE ec_rules SET slug='bad/path' WHERE id='rule'"), /one path segment/);
				assert.throws(() => sqlite.exec(`INSERT INTO revisions (id,collection,entry_id,data) VALUES ('bad','rules','rule','{"_slug":"bad%2Fpath"}')`), /one path segment/);
				const coverage = sqlite.prepare("SELECT capture_state,collection_id FROM _emdash_media_usage_index_status WHERE scope_key='rules'").get();
				assert.equal(coverage.capture_state, "active");
				assert.equal(coverage.collection_id, collection.id);
				assert.equal(sqlite.prepare("SELECT count(*) n FROM _emdash_media_usage_work WHERE collection_slug='rules' AND content_id='rule'").get().n, 1);
				assert.equal(sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND tbl_name='ec_rules' AND name LIKE 'emdash_mu_%'").get().n, 3);
				assert.throws(() => sqlite.exec(migration), /CHECK constraint failed/);
			} finally { sqlite.close(); }
		} finally { await db.destroy(); await rm(directory, { recursive: true, force: true }); }
	});
}

test("display order migration preserves articles and revisions while adding the CMS field and indexes", async () => {
	const directory = await mkdtemp(join(tmpdir(), "rules-order-migration-"));
	const path = join(directory, "db.sqlite");
	const db = new Kysely({ dialect: createDialect({ url: `file:${path}` }) });
	try {
		await runMigrations(db);
		const oldSeed = { ...seed, collections: seed.collections.map(c => c.slug === "rules" ? { ...c, fields: c.fields.filter(f => f.slug !== "display_order") } : c) };
		await applySeed(db, oldSeed, { includeContent: true });
		await db.destroy();
		const sqlite = new DatabaseSync(path);
		try {
			sqlite.exec("INSERT INTO ec_rules (id,slug,title,content,campus_only) VALUES ('rule','rule','Existing','[]',0)");
			sqlite.exec(`INSERT INTO revisions (id,collection,entry_id,data) VALUES ('revision','rules','rule','{"title":"Draft","campus_only":true}')`);
			const article = sqlite.prepare("SELECT * FROM ec_rules WHERE id='rule'").get();
			const revisions = sqlite.prepare("SELECT * FROM revisions").all();
			const pages = sqlite.prepare("SELECT * FROM ec_pages ORDER BY id").all();
			sqlite.exec("BEGIN"); sqlite.exec(orderMigration); sqlite.exec("COMMIT");
			assert.deepEqual({ ...sqlite.prepare("SELECT * FROM ec_rules WHERE id='rule'").get() }, { ...article, display_order: 100 });
			assert.deepEqual(sqlite.prepare("SELECT * FROM revisions").all(), revisions);
			assert.deepEqual(sqlite.prepare("SELECT * FROM ec_pages ORDER BY id").all(), pages);
			const field = sqlite.prepare("SELECT type,required,default_value,indexed,translatable FROM _emdash_fields WHERE slug='display_order'").get();
			assert.deepEqual({ ...field }, { type: "integer", required: 1, default_value: "100", indexed: 1, translatable: 0 });
			assert.equal(sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='index' AND sql LIKE '%display_order%'").get().n, 2);
			assert.throws(() => sqlite.exec(orderMigration), /CHECK constraint failed/);
		} finally { sqlite.close(); }
	} finally { await db.destroy(); await rm(directory, { recursive: true, force: true }); }
});
