import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import seed from "../seed/seed.json" with { type: "json" };
import { collectDocuments, sha256, syncDocuments } from "../scripts/sync-documents.mjs";
import manifest from "../src/generated/documents/manifest.json" with { type: "json" };

const tag = "v2026.08.02-3";
const commit = "a".repeat(40);
const pdf = Buffer.from("%PDF-1.7\nfixture");
const sources = [
	{ slug: "regulations", title: "変更後の規約" },
	{ slug: "governance", title: "運営規程" },
	{ slug: "新しい文書", title: "追加された文書" },
];
const assets = sources.map(({ slug }, index) => ({ id: index + 1, name: `${slug}.pdf`, size: pdf.length, digest: `sha256:${sha256(pdf)}` }));
const calls = [];
const fakeApi = async (path, binary) => {
	calls.push(path);
	if (path.includes("/releases/tags/")) return { tag_name: tag, draft: false, prerelease: false, published_at: "2026-08-02T06:01:40Z", assets };
	if (path.includes("/commits/")) return { sha: commit };
	if (path.includes("/contents/")) {
		assert.ok(path.endsWith(`?ref=${commit}`), "Markdown must come from the resolved tag commit, never main");
		const document = sources.find(({ slug }) => path.includes(`/${encodeURIComponent(slug)}.md?`));
		return { encoding: "base64", content: Buffer.from(`# ${document.title}\n\n本文\n`).toString("base64") };
	}
	if (path.includes("/releases/assets/")) { assert.equal(binary, true); return pdf; }
	throw new Error(`Unexpected API call: ${path}`);
};

test("document sync discovers release PDFs and pins their matching Markdown to the same release", async () => {
	calls.length = 0;
	const { files, manifest: result } = await collectDocuments(tag, fakeApi);
	assert.equal(result.commit, commit);
	assert.equal(result.tag, tag);
	assert.deepEqual(result.documents.map(({ slug }) => slug), sources.map(({ slug }) => slug));
	assert.equal(files.length, 7);
	assert.ok(!calls.some((path) => path.endsWith("/contents") || path.includes("ref=main")));
	for (const document of result.documents) {
		assert.equal(document.pdf, `/docs/${encodeURIComponent(document.slug)}/document`);
		assert.equal("title" in document, false);
		assert.equal("description" in document, false);
		const file = files.find((entry) => entry.path === `src/generated/documents/files/${sha256(pdf)}/${document.slug}.pdf`);
		assert.deepEqual(file?.data, pdf);
	}
	assert.ok(files.every((entry) => !entry.path.startsWith("brand/")), "Campus PDFs must never be written to public assets");
});

test("sync rejects unpublished releases, invalid PDFs and missing attachments before changing local content", async () => {
	const root = await mkdtemp(join(tmpdir(), "tmedit-documents-"));
	try {
		await writeFile(join(root, "keep.txt"), "previous published documents");
		for (const scenario of ["missing", "truncated", "digest", "draft", "prerelease", "filename", "duplicate", "source"]) {
			const api = async (path, binary) => {
				const result = await fakeApi(path, binary);
				if (path.includes("/releases/tags/")) {
					if (scenario === "missing") return { ...result, assets: [] };
					if (scenario === "draft") return { ...result, draft: true };
					if (scenario === "prerelease") return { ...result, prerelease: true };
					if (scenario === "digest") return { ...result, assets: assets.map((asset) => ({ ...asset, digest: "sha256:wrong" })) };
					if (scenario === "filename") return { ...result, assets: [{ ...assets[0], name: "../invalid.pdf" }] };
					if (scenario === "duplicate") return { ...result, assets: [assets[0], assets[0]] };
				}
				if (scenario === "source" && path.includes("/contents/")) return { encoding: "none" };
				return binary && scenario === "truncated" ? Buffer.from("not a pdf") : result;
			};
			await assert.rejects(syncDocuments(tag, { api, root }));
			assert.deepEqual(await readdir(root), ["keep.txt"]);
			assert.equal(await readFile(join(root, "keep.txt"), "utf8"), "previous published documents");
		}
		await assert.rejects(collectDocuments("../main", fakeApi));
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("sync ignores non-PDF attachments and removes withdrawn documents and old files", async () => {
	const root = await mkdtemp(join(tmpdir(), "tmedit-documents-"));
	try {
		await syncDocuments(tag, { api: fakeApi, root });
		const api = async (path, binary) => {
			const result = await fakeApi(path, binary);
			return path.includes("/releases/tags/") ? { ...result, assets: [assets[0], { name: "README.txt" }] } : result;
		};
		const result = await syncDocuments(tag, { api, root });
		assert.deepEqual(result.documents.map((document) => document.slug), ["regulations"]);
		assert.deepEqual((await readdir(join(root, "src/generated/documents"))).sort(), ["files", "manifest.json", "regulations.md"]);
		assert.deepEqual(await readdir(join(root, `src/generated/documents/files/${sha256(pdf)}`)), ["regulations.pdf"]);
		assert.deepEqual(await readdir(join(root, "src/generated")), ["documents"]);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test("latest sync resolves the current release once, so delayed notifications cannot select an old version", async () => {
	let lookups = 0;
	const api = async (path, binary) => {
		if (path.endsWith("/releases/latest")) { lookups++; return { tag_name: tag }; }
		return fakeApi(path, binary);
	};
	const { manifest: result } = await collectDocuments("--latest", api);
	assert.equal(result.tag, tag);
	assert.equal(result.commit, commit);
	assert.equal(lookups, 1);
});

test("generated Markdown and PDF files match the published manifest", async () => {
	for (const document of manifest.documents) {
		const markdown = await readFile(new URL(`../src/generated/documents/${document.slug}.md`, import.meta.url));
		const attachment = await readFile(new URL(`../src/generated/documents/files/${document.pdfSha256}/${document.slug}.pdf`, import.meta.url));
		assert.equal(sha256(markdown), document.markdownSha256);
		assert.equal(sha256(attachment), document.pdfSha256);
		assert.equal(attachment.length, document.bytes);
		assert.equal(attachment.subarray(0, 5).toString(), "%PDF-");
	}
});

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
