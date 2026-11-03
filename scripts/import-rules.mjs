import { readFile, readdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EmDashClient, markdownToPortableText } from "emdash/client";

export async function importRules(client, directory) {
	const existing = new Set();
	for await (const item of client.listAll("rules")) existing.add(item.slug);
	let imported = 0;
	for (const filename of (await readdir(directory)).filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md").sort()) {
		const slug = filename.slice(0, -3);
		if (existing.has(slug)) continue;
		const content = markdownToPortableText(await readFile(join(directory, filename), "utf8"));
		const titleBlock = content.find((block) => block._type === "block" && block.style === "h1");
		const title = titleBlock?.children?.map((span) => span.text ?? "").join("") || slug;
		const entry = await client.create("rules", { slug, locale: "ja", status: "draft", data: {
			title, content: content.filter((block) => block !== titleBlock), campus_only: true,
		} });
		await client.publish("rules", entry.id);
		existing.add(slug);
		imported++;
	}
	return imported;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({ options: { url: { type: "string", default: "http://localhost:4321" }, source: { type: "string", default: "src/generated/documents" } } });
	const url = new URL(values.url);
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (!local && !process.env.EMDASH_TOKEN) throw new Error("CMSの編集権限を持つEMDASH_TOKENを環境変数へ設定してください。");
	const client = new EmDashClient({ baseUrl: url.origin, token: process.env.EMDASH_TOKEN, devBypass: local && !process.env.EMDASH_TOKEN });
	const count = await importRules(client, resolve(values.source));
	console.info(`${count} 文書を諸則コレクションへ取り込みました。既存のCMS記事は変更していません。`);
}
