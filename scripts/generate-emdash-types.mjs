import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// EmDash's offline generator migrates an in-memory DB and applies only the seed
// schema. It never reads or changes the development or production database.
// This helper is bundled in EmDash 1.1 but has no public package export yet.
const generatorUrl = new URL("schema/project-env-types.mjs", import.meta.resolve("emdash"));
const { generateProjectEnvTypes } = await import(generatorUrl.href);
const projectRoot = process.cwd();
const config = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
const seedPath = config.emdash?.seed;
if (typeof seedPath !== "string" || !seedPath) throw new Error("package.json の emdash.seed を設定してください。");
const seed = JSON.parse(await readFile(resolve(projectRoot, seedPath), "utf8"));

// Isolate seed discovery from .emdash/seed.json and prevent EmDash's fallback to
// its default seed when the configured file is missing or malformed.
const temporaryRoot = await mkdtemp(join(tmpdir(), "tmedit-typegen-"));
let types;
try {
	await writeFile(join(temporaryRoot, "package.json"), JSON.stringify({ emdash: { seed: "seed.json" } }));
	await writeFile(join(temporaryRoot, "seed.json"), JSON.stringify(seed));
	types = await generateProjectEnvTypes(temporaryRoot);
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}
await writeFile(resolve(projectRoot, "emdash-env.d.ts"), types);
console.info("Generated EmDash collection types from the project seed.");
