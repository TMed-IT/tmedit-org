import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import manifest from "../src/generated/documents/manifest.json" with { type: "json" };

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function* files(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) yield* files(path);
		else yield path;
	}
}

const privateHashes = new Set(manifest.documents.flatMap((document) => [document.pdfSha256, document.markdownSha256]));
const embedded = new Set();
const privateUrls = await Promise.all(manifest.documents.map(async (document) => {
	const bytes = await readFile(`src/generated/documents/files/${document.pdfSha256}/${document.slug}.pdf`);
	return `data:application/pdf;base64,${bytes.toString("base64")}`;
}));

for await (const path of files("dist/client")) {
	const bytes = await readFile(path);
	const root = relative("dist/client", path).split(/[\\/]/, 1)[0];
	if (["docs", "documents"].includes(root) || privateHashes.has(hash(bytes)) || privateUrls.some((url) => bytes.includes(Buffer.from(url)))) {
		throw new Error(`学内限定の文書が公開アセットに含まれています: ${path}`);
	}
}

for await (const path of files("dist/server")) {
	if (![".js", ".mjs"].includes(extname(path))) continue;
	const text = await readFile(path, "utf8");
	for (const match of text.matchAll(/data:application\/pdf;base64,([A-Za-z0-9+/=]+)/g)) {
		embedded.add(hash(Buffer.from(match[1], "base64")));
	}
}
for (const document of manifest.documents) {
	if (!embedded.has(document.pdfSha256)) throw new Error(`学内限定PDFがサーバーに含まれていません: ${document.slug}`);
}
console.log("Verified campus documents are server-only and absent from public assets.");
