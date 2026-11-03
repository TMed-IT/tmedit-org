import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function* files(directory) {
	let entries;
	try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) yield* files(path);
		else yield path;
	}
}
const hashes = new Set();
const dataUrls = [];
for await (const path of files("src/generated/documents")) {
	const bytes = await readFile(path);
	hashes.add(hash(bytes));
	if (path.endsWith(".pdf")) dataUrls.push(Buffer.from(`data:application/pdf;base64,${bytes.toString("base64")}`));
}
for await (const path of files("dist/client")) {
	const bytes = await readFile(path);
	const root = relative("dist/client", path).split(/[\\/]/, 1)[0];
	if (["docs", "documents"].includes(root) || hashes.has(hash(bytes)) || dataUrls.some((url) => bytes.includes(url))) {
		throw new Error(`学内限定の文書が公開アセットに含まれています: ${path}`);
	}
}
console.log("Verified rule content and legacy documents are absent from public assets.");
