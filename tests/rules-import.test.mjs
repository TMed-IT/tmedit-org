import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importRules } from "../scripts/import-rules.mjs";

test("one-time rule import preserves existing CMS edits and imports Markdown as campus-only published content", async () => {
	const directory = await mkdtemp(join(tmpdir(), "rules-import-"));
	try {
		await writeFile(join(directory, "existing.md"), "# Changed source\n\nMust not replace CMS");
		await writeFile(join(directory, "new.md"), "# 新しい諸則\n\n## 目的\n\n本文です。\n\n1. 項目\n");
		const created = [], published = [];
		const client = {
			async *listAll(collection) { assert.equal(collection, "rules"); yield { slug: "existing" }; for (const entry of created) yield entry; },
			async create(collection, data) { assert.equal(collection, "rules"); const entry = { ...data, id: "new-id" }; created.push(entry); return entry; },
			async publish(collection, id) { published.push({ collection, id }); },
		};
		assert.equal(await importRules(client, directory), 1);
		assert.equal(created[0].data.title, "新しい諸則");
		assert.equal(created[0].data.campus_only, true);
		assert.ok(created[0].data.content.some(block => block.style === "h2"));
		assert.ok(created[0].data.content.some(block => block.listItem === "number"));
		assert.deepEqual(published, [{ collection: "rules", id: "new-id" }]);
		assert.equal(await importRules(client, directory), 0);
		assert.equal(created.length, 1);
	} finally { await rm(directory, { recursive: true, force: true }); }
});
