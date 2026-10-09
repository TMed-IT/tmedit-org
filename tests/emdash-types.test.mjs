import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/generate-emdash-types.mjs", import.meta.url));

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "tmedit-types-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, "seed"));
	await copyFile(new URL("../seed/seed.json", import.meta.url), join(root, "seed/seed.json"));
	await writeFile(join(root, "package.json"), JSON.stringify({ emdash: { seed: "seed/seed.json" } }));
	return root;
}

test("offline generation replaces stale DB types with the current seed without a server", async (t) => {
	const root = await fixture(t);
	const output = join(root, "emdash-env.d.ts");
	await writeFile(output, "export interface Ghost {}\n");
	await mkdir(join(root, ".emdash"));
	await writeFile(join(root, ".emdash/seed.json"), JSON.stringify({ version: "1", collections: [] }));
	await exec(process.execPath, [script], { cwd: root, timeout: 30_000 });
	const types = await readFile(output, "utf8");
	assert.match(types, /export interface Home \{\s+id: string;/);
	assert.match(types, /home: Home;/);
	assert.match(types, /news: New;/);
	assert.match(types, /pages: Page;/);
	assert.doesNotMatch(types, /Ghost|hero_headline/);
	await exec(process.execPath, [script], { cwd: root, timeout: 30_000 });
	assert.equal(await readFile(output, "utf8"), types);
});

test("invalid seed stops type generation and preserves the existing declarations", async (t) => {
	const root = await fixture(t);
	const output = join(root, "emdash-env.d.ts");
	await writeFile(output, "existing declarations\n");
	await writeFile(join(root, "seed/seed.json"), "{invalid json");
	await assert.rejects(exec(process.execPath, [script], { cwd: root, timeout: 30_000 }));
	assert.equal(await readFile(output, "utf8"), "existing declarations\n");
});
