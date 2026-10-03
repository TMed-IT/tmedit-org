import { Role } from "@emdash-cms/auth";
import { SchemaRegistry, invalidateCollectionCache, invalidateSchemaObjectCache, invalidateMenuObjectCache } from "emdash";
import { applySeed, validateSeed } from "emdash/seed";
import seed from "../../seed/seed.json" with { type: "json" };
import { validResetTargets } from "../plugins/site-settings/reset-options.mjs";

export function resetAuthorization(request, user) {
	if (!user || user.role !== Role.ADMIN) return 403;
	if (request.method !== "POST") return 405;
	if (request.headers.get("Origin") !== new URL(request.url).origin ||
		request.headers.get("X-EmDash-Request") !== "1") return 403;
	if (!request.headers.get("Content-Type")?.startsWith("application/json")) return 415;
	return null;
}

export async function readResetSelection(request) {
	const reader = request.body?.getReader();
	if (!reader) return null;
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 1024) { await reader.cancel(); return null; }
			chunks.push(value);
		}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
		const input = JSON.parse(new TextDecoder().decode(bytes));
		return input?.confirmation === "初期化" && validResetTargets(input.targets) ? input.targets : null;
	} catch { return null; }
	finally { reader.releaseLock(); }
}

/** Reset only the site's seeded content, never auth, media, or subscribers. */
export async function resetSiteContent(db, targets, beforeReset = async () => {}) {
	if (!validResetTargets(targets)) throw new Error("初期化する項目を選択してください。");
	const collections = seed.collections.filter((collection) => targets.includes(collection.slug));
	const selectedSeed = {
		version: seed.version,
		defaultLocale: seed.defaultLocale,
		...(collections.length ? { collections, content: Object.fromEntries(collections.map(({ slug }) => [slug, seed.content[slug] ?? []])) } : {}),
		...(targets.includes("menus") ? { menus: seed.menus } : {}),
		...(targets.includes("settings") ? { settings: seed.settings } : {}),
	};
	const validation = validateSeed(selectedSeed);
	if (!validation.valid) throw new Error("Seed validation failed");
	const slugs = collections.map((collection) => collection.slug);
	// Do not silently break references belonging to another collection.
	const relations = slugs.length ? await db.selectFrom("_emdash_relations").selectAll().execute() : [];
	if (relations.some((relation) => slugs.includes(relation.parent_collection) || slugs.includes(relation.child_collection))) {
		throw new Error("選択したコレクションに関連が設定されています。関連を解除してから初期化してください。");
	}
	const registry = new SchemaRegistry(db);
	const tags = [...slugs];
	if (targets.includes("settings")) tags.push("emdash:settings");
	if (targets.includes("menus")) tags.push(...seed.menus.map((menu) => `emdash:menu:${menu.name}`));
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
		if (slugs.length) {
			for (const table of ["revisions", "_emdash_seo", "_emdash_comments", "content_taxonomies", "_emdash_revision_prune_queue", "_emdash_entry_locks"]) {
				await db.deleteFrom(table).where("collection", "in", slugs).execute();
			}
			await db.deleteFrom("_emdash_content_bylines").where("collection_slug", "in", slugs).execute();
		}
		const names = selectedSeed.menus?.map((menu) => menu.name);
		const menus = names ? await db.selectFrom("_emdash_menus").select("id").where("name", "in", names).execute() : [];
		for (const menu of menus) {
			await db.deleteFrom("_emdash_menu_items").where("menu_id", "=", menu.id).execute();
			await db.deleteFrom("_emdash_menus").where("id", "=", menu.id).execute();
		}
		await applySeed(db, selectedSeed, { includeContent: true, onConflict: "update" });
		return { tags };
	} finally {
		for (const slug of slugs) invalidateCollectionCache(slug);
		if (slugs.length) invalidateSchemaObjectCache();
		if (targets.includes("menus")) invalidateMenuObjectCache();
	}
}
