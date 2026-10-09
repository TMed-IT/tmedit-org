import { EmDashClient } from "emdash/client";
import seed from "../seed/seed.json" with { type: "json" };

const baseUrl = new URL(process.argv[2] || "http://localhost:4321");
const local = ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
if (!local && !process.env.EMDASH_TOKEN) throw new Error("本番への反映には管理者のEMDASH_TOKENを設定してください。");
const client = new EmDashClient({ baseUrl: baseUrl.origin, token: process.env.EMDASH_TOKEN, devBypass: local && !process.env.EMDASH_TOKEN });
const field = seed.collections.find(({ slug }) => slug === "pages").fields.find(({ slug }) => slug === "document");
const collection = await client.collection("pages");
const existing = collection.fields.find(({ slug }) => slug === field.slug);
if (existing) {
	if (existing.type !== field.type || JSON.stringify(existing.validation?.allowedMimeTypes) !== JSON.stringify(field.validation.allowedMimeTypes)) {
		throw new Error("既存のdocumentフィールドの型・許可形式が異なります。管理画面で確認してください。");
	}
	console.info("添付PDF欄は追加済みです。");
} else {
	await client.createField("pages", field);
	console.info("ページに添付PDF欄を追加しました。既存の記事・履歴は保持しています。");
}
