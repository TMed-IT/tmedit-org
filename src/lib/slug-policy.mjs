// Reserve root paths used by Astro, EmDash and the site's public assets.
export const reservedRootSlugs = [
	"newsroom", "api", "auth", "subscribe", "_emdash", "_astro", "_image", "login", "404",
	"omorisai26", "omorisai2026",
	"robots.txt", "sitemap.xml", "sitemap-index.xml", "favicon.svg", "icon-fill.svg", "loading.svg", "Icon.svg",
];

export function isReservedRootSlug(slug) {
	return reservedRootSlugs.includes(slug) || (slug.startsWith("sitemap-") && slug.endsWith(".xml")) || slug === "." || slug === "..";
}

function trigger(name, operation, table, condition, message) {
	return `CREATE TRIGGER IF NOT EXISTS ${name}\nBEFORE ${operation} ON ${table}\nWHEN ${condition}\nBEGIN\n  SELECT RAISE(ABORT, '${message}');\nEND;`;
}

const separator = (value) => `(instr(${value}, '/') > 0 OR instr(lower(${value}), '%2f') > 0)`;
const reserved = (value) => `(${value} IN (${[...reservedRootSlugs, ".", ".."].map(s => `'${s}'`).join(", ")}) OR ${value} GLOB 'sitemap-*.xml')`;
const existingTaxonomy = (value) => `EXISTS (SELECT 1 FROM _emdash_taxonomy_def_groups WHERE name = ${value} AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages'))`;
const existingPage = (value) => `EXISTS (SELECT 1 FROM ec_pages WHERE slug = ${value} AND deleted_at IS NULL)`;
const appliesToPages = `EXISTS (SELECT 1 FROM json_each(NEW.collections) WHERE value = 'pages')`;
const stagedSlug = "json_extract(NEW.data, '$._slug')";

export const slashSlugConstraints = [
	...["pages", "news"].flatMap(collection => [
		{ table: `ec_${collection}`, sql: trigger(`tmedit_${collection}_slug_insert`, "INSERT", `ec_${collection}`, separator("NEW.slug"), "slug cannot contain a slash") },
		{ table: `ec_${collection}`, sql: trigger(`tmedit_${collection}_slug_update`, "UPDATE OF slug", `ec_${collection}`, separator("NEW.slug"), "slug cannot contain a slash") },
	]),
	{ table: "taxonomies", sql: trigger("tmedit_term_slug_insert", "INSERT", "taxonomies", `${separator("NEW.slug")} OR NEW.slug IN ('.', '..')`, "term slug must be one path segment") },
	{ table: "taxonomies", sql: trigger("tmedit_term_slug_update", "UPDATE OF slug", "taxonomies", `${separator("NEW.slug")} OR NEW.slug IN ('.', '..')`, "term slug must be one path segment") },
	{ table: "revisions", sql: trigger("tmedit_revision_slug_insert", "INSERT", "revisions", `NEW.collection IN ('pages', 'news') AND json_valid(NEW.data) AND ${separator(stagedSlug)}`, "draft slug cannot contain a slash") },
	{ table: "revisions", sql: trigger("tmedit_revision_slug_update", "UPDATE OF collection, data", "revisions", `NEW.collection IN ('pages', 'news') AND json_valid(NEW.data) AND ${separator(stagedSlug)}`, "draft slug cannot contain a slash") },
];

// Taxonomy names occupy the root namespace. Term slugs are scoped by taxonomy.
export const collisionSlugConstraints = [
	{ table: "ec_pages", sql: trigger("tmedit_pages_taxonomy_conflict_insert", "INSERT", "ec_pages", `NEW.deleted_at IS NULL AND (${reserved("NEW.slug")} OR ${existingTaxonomy("NEW.slug")})`, "page slug conflicts with an existing route or taxonomy") },
	{ table: "ec_pages", sql: trigger("tmedit_pages_taxonomy_conflict_update", "UPDATE OF slug, deleted_at", "ec_pages", `NEW.deleted_at IS NULL AND (${reserved("NEW.slug")} OR ${existingTaxonomy("NEW.slug")})`, "page slug conflicts with an existing route or taxonomy") },
	{ table: "_emdash_taxonomy_def_groups", sql: trigger("tmedit_taxonomy_name_conflict_insert", "INSERT", "_emdash_taxonomy_def_groups", `${appliesToPages} AND (${reserved("NEW.name")} OR ${existingPage("NEW.name")})`, "taxonomy name conflicts with an existing route or page") },
	{ table: "_emdash_taxonomy_def_groups", sql: trigger("tmedit_taxonomy_name_conflict_update", "UPDATE OF name, collections", "_emdash_taxonomy_def_groups", `${appliesToPages} AND (${reserved("NEW.name")} OR ${existingPage("NEW.name")})`, "taxonomy name conflicts with an existing route or page") },
	{ table: "revisions", sql: trigger("tmedit_revision_taxonomy_conflict_insert", "INSERT", "revisions", `NEW.collection = 'pages' AND json_valid(NEW.data) AND (${reserved(stagedSlug)} OR ${existingTaxonomy(stagedSlug)})`, "draft page slug conflicts with an existing route or taxonomy") },
	{ table: "revisions", sql: trigger("tmedit_revision_taxonomy_conflict_update", "UPDATE OF collection, data", "revisions", `NEW.collection = 'pages' AND json_valid(NEW.data) AND (${reserved(stagedSlug)} OR ${existingTaxonomy(stagedSlug)})`, "draft page slug conflicts with an existing route or taxonomy") },
];

export const obsoleteSlugTriggers = [
	"tmedit_category_slug_insert", "tmedit_category_slug_update",
	"tmedit_pages_slug_conflict_insert", "tmedit_pages_slug_conflict_update",
	"tmedit_category_slug_conflict_insert", "tmedit_category_slug_conflict_update",
	"tmedit_revision_slug_conflict_insert", "tmedit_revision_slug_conflict_update",
];

/** Reinstall constraints dropped along with content tables during a CMS reset. */
export async function installSlugConstraints(db) {
	for (const name of obsoleteSlugTriggers) await db.executeQuery({ sql: `DROP TRIGGER IF EXISTS ${name}`, parameters: [], query: { kind: "RawNode", sqlFragments: [`DROP TRIGGER IF EXISTS ${name}`], parameters: [] } });
	const tables = new Set((await db.selectFrom("sqlite_master").select("name").where("type", "=", "table").execute()).map(row => row.name));
	for (const { table, sql } of [...slashSlugConstraints, ...collisionSlugConstraints]) {
		if (!tables.has(table)) continue;
		await db.executeQuery({ sql, parameters: [], query: { kind: "RawNode", sqlFragments: [sql], parameters: [] } });
	}
}
