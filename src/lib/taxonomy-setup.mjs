import { installSlugConstraints } from "./slug-policy.mjs";

const setups = new WeakMap();

/** New databases inherit unused EmDash defaults for the absent posts collection. */
export function ensureTaxonomySetup(db, invalidate = () => {}) {
	if (!setups.has(db)) {
		const setup = (async () => {
			const removed = await db.deleteFrom("_emdash_taxonomy_defs")
				.where("id", "in", ["taxdef_category", "taxdef_tag"])
				.where("name", "in", ["category", "tag"])
				.where("collections", "=", '["posts"]')
				.where(({ not, exists, selectFrom }) => not(exists(selectFrom("taxonomies").select("id").whereRef("taxonomies.name", "=", "_emdash_taxonomy_defs.name"))))
				.where(({ not, exists, selectFrom }) => not(exists(selectFrom("_emdash_collections").select("id").where("slug", "=", "posts"))))
				.executeTakeFirst();
			await db.deleteFrom("_emdash_taxonomy_def_groups")
				.where("id", "in", ["taxdef_category", "taxdef_tag"])
				.where("name", "in", ["category", "tag"])
				.where(({ not, exists, selectFrom }) => not(exists(selectFrom("_emdash_taxonomy_defs").select("id").whereRef("_emdash_taxonomy_defs.name", "=", "_emdash_taxonomy_def_groups.name"))))
				.execute();
			await installSlugConstraints(db);
			if (Number(removed.numDeletedRows) > 0) invalidate();
			return Number(removed.numDeletedRows) > 0;
		})();
		setups.set(db, setup);
		setup.catch(() => setups.delete(db));
	}
	return setups.get(db);
}
