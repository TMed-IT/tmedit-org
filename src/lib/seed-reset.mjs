import { Role } from "@emdash-cms/auth";
import { SchemaRegistry, invalidateCollectionCache, invalidateSchemaObjectCache, invalidateMenuObjectCache } from "emdash";
import { applySeed, validateSeed } from "emdash/seed";
import seed from "../../seed/seed.json" with { type: "json" };

export function resetAuthorization(request, user) {
	if (!user || user.role !== Role.ADMIN) return 403;
	if (request.method !== "POST") return 405;
	if (request.headers.get("Origin") !== new URL(request.url).origin ||
		request.headers.get("X-EmDash-Request") !== "1") return 403;
	if (!request.headers.get("Content-Type")?.startsWith("application/json")) return 415;
	return null;
}

export async function readResetConfirmation(request) {
	const reader = request.body?.getReader();
	if (!reader) return false;
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 1024) { await reader.cancel(); return false; }
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
		return JSON.parse(new TextDecoder().decode(bytes)).confirmation === "初期化";
	} catch { return false; }
	finally { reader.releaseLock(); }
}

/** Reset only the site's seeded content, never auth, media, or subscribers. */
export async function resetSiteContent(db, beforeReset = async () => {}) {
	const validation = validateSeed(seed);
	if (!validation.valid) throw new Error("Seed validation failed");
	const slugs = seed.collections.map((collection) => collection.slug);
	// Do not silently break references belonging to another collection.
	const relations = await db.selectFrom("_emdash_relations").selectAll().execute();
	if (relations.some((relation) => slugs.includes(relation.parent_collection) || slugs.includes(relation.child_collection))) {
		throw new Error("ホーム・ページ・お知らせに関連が設定されています。関連を解除してから初期化してください。");
	}
	const registry = new SchemaRegistry(db);
	const tags = [...slugs];
	for (const slug of slugs) {
		if (await registry.getCollection(slug)) {
			const entries = await db.selectFrom(`ec_${slug}`).select("id").execute();
			tags.push(...entries.map((entry) => entry.id));
		}
	}
	await beforeReset();
	try {
		for (const slug of slugs) {
			if (await registry.getCollection(slug)) await registry.deleteCollection(slug, { force: true });
		}
		for (const table of ["revisions", "_emdash_seo", "_emdash_comments", "content_taxonomies", "_emdash_revision_prune_queue", "_emdash_entry_locks"]) {
			await db.deleteFrom(table).where("collection", "in", slugs).execute();
		}
		await db.deleteFrom("_emdash_content_bylines").where("collection_slug", "in", slugs).execute();
		const names = seed.menus.map((menu) => menu.name);
		const menus = await db.selectFrom("_emdash_menus").select("id").where("name", "in", names).execute();
		for (const menu of menus) {
			await db.deleteFrom("_emdash_menu_items").where("menu_id", "=", menu.id).execute();
			await db.deleteFrom("_emdash_menus").where("id", "=", menu.id).execute();
		}
		await applySeed(db, seed, { includeContent: true, onConflict: "update" });
		return { tags };
	} finally {
		for (const slug of slugs) invalidateCollectionCache(slug);
		invalidateSchemaObjectCache();
		invalidateMenuObjectCache();
	}
}
