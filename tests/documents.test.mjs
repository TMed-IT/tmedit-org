import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import seed from "../seed/seed.json" with { type: "json" };

const migration = await readFile(new URL("../migrations/0007_documents_route.sql", import.meta.url), "utf8");
const docsMigration = await readFile(new URL("../migrations/0008_docs_route.sql", import.meta.url), "utf8");

test("document route migration applies to the existing EmDash schema and retains all published data", async () => {
	const directory = await mkdtemp(join(tmpdir(), "tmedit-document-migration-"));
	const path = join(directory, "before.db");
	const { Kysely } = createRequire(import.meta.resolve("emdash/db"))("kysely");
	const connection = new Kysely({ dialect: createDialect({ url: `file:${path}` }) });
	try {
		await runMigrations(connection);
		await applySeed(connection, seed, { includeContent: true });
	} finally { await connection.destroy(); }
	const db = new DatabaseSync(path);
	try {
		// Existing production installations have 0006's shared constraints.
		const previous = await readFile(new URL("../migrations/0006_omorisai_taxonomy.sql", import.meta.url), "utf8");
		for (const statement of previous.match(/CREATE TRIGGER[\s\S]*?END;/g)) db.exec(statement);
		const sharedTriggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
		const pages = db.prepare("SELECT * FROM ec_pages ORDER BY id").all();
		const fields = db.prepare("SELECT * FROM _emdash_fields ORDER BY id").all();
		db.exec(migration);
		assert.deepEqual(db.prepare("SELECT * FROM ec_pages ORDER BY id").all(), pages);
		assert.deepEqual(db.prepare("SELECT * FROM _emdash_fields ORDER BY id").all(), fields);
		assert.deepEqual(db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'tmedit_documents_%' ORDER BY name").all(), sharedTriggers);
		const existingTriggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
		db.exec(docsMigration);
		assert.deepEqual(db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name NOT LIKE 'tmedit_docs_%' ORDER BY name").all(), existingTriggers);
		assert.deepEqual(db.prepare("SELECT * FROM ec_pages ORDER BY id").all(), pages);
		assert.throws(() => db.exec("UPDATE ec_pages SET slug='docs' WHERE slug='privacy'"), /page slug conflicts/);
		assert.throws(() => db.exec("UPDATE ec_pages SET slug='documents' WHERE slug='privacy'"), /page slug conflicts/);
		assert.throws(() => db.exec("UPDATE ec_pages SET slug='newsroom' WHERE slug='privacy'"), /page slug conflicts/);
	} finally { db.close(); await rm(directory, { recursive: true, force: true }); }
});

function fixture() {
	const db = new DatabaseSync(":memory:");
	db.exec(`CREATE TABLE ec_pages (id TEXT PRIMARY KEY, slug TEXT, deleted_at TEXT);
		CREATE TABLE _emdash_taxonomy_def_groups (name TEXT, collections TEXT);
		CREATE TABLE revisions (id TEXT PRIMARY KEY, collection TEXT, data TEXT);
		INSERT INTO ec_pages VALUES ('keep', 'privacy', NULL);`);
	return db;
}

for (const [route, routeMigration] of [["documents", migration], ["docs", docsMigration]]) {
test(`${route} route migration reserves the namespace for pages, drafts and taxonomies while retaining content`, () => {
	const db = fixture();
	try {
		db.exec(routeMigration);
		assert.equal(db.prepare("SELECT slug FROM ec_pages WHERE id='keep'").get().slug, "privacy");
		assert.throws(() => db.exec(`INSERT INTO ec_pages VALUES ('bad', '${route}', NULL)`), /page slug conflicts/);
		assert.throws(() => db.exec(`UPDATE ec_pages SET slug='${route}' WHERE id='keep'`), /page slug conflicts/);
		assert.throws(() => db.exec(`INSERT INTO _emdash_taxonomy_def_groups VALUES ('${route}', '["pages"]')`), /taxonomy name conflicts/);
		assert.throws(() => db.exec(`INSERT INTO revisions VALUES ('draft', 'pages', '{"_slug":"${route}"}')`), /draft page slug conflicts/);
		db.exec(`INSERT INTO ec_pages VALUES ('deleted', '${route}', '2026-10-20')`);
		assert.throws(() => db.exec("UPDATE ec_pages SET deleted_at=NULL WHERE id='deleted'"), /page slug conflicts/);
		db.exec(`INSERT INTO _emdash_taxonomy_def_groups VALUES ('${route}', '["news"]')`);
		assert.throws(() => db.exec(`UPDATE _emdash_taxonomy_def_groups SET collections='["pages"]' WHERE name='${route}'`), /taxonomy name conflicts/);
		db.exec(`INSERT INTO revisions VALUES ('editable', 'pages', '{"_slug":"guide"}')`);
		assert.throws(() => db.exec(`UPDATE revisions SET data='{"_slug":"${route}"}' WHERE id='editable'`), /draft page slug conflicts/);
	} finally { db.close(); }
});

test(`${route} route migration stops on an existing page, taxonomy or draft without deleting it`, () => {
	for (const sql of [
		`INSERT INTO ec_pages VALUES ('conflict', '${route}', NULL)`,
		`INSERT INTO _emdash_taxonomy_def_groups VALUES ('${route}', '["pages"]')`,
		`INSERT INTO revisions VALUES ('conflict', 'pages', '{"_slug":"${route}"}')`,
	]) {
		const db = fixture();
		try {
			db.exec(sql);
			db.exec("BEGIN");
			assert.throws(() => db.exec(routeMigration), /CHECK constraint failed/);
			db.exec("ROLLBACK");
			assert.equal(db.prepare("SELECT slug FROM ec_pages WHERE id='keep'").get().slug, "privacy");
			assert.equal(db.prepare(`SELECT name FROM sqlite_master WHERE name='_tmedit_${route}_route_guard'`).get(), undefined);
		} finally { db.close(); }
	}
});
}
