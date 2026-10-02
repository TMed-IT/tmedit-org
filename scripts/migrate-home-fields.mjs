import { readFile } from "node:fs/promises";
import { EmDashClient } from "emdash/client";

const baseUrl = process.argv[2] || "http://localhost:4321";
const token = process.env.EMDASH_TOKEN;
const client = new EmDashClient({
	baseUrl,
	...(token ? { token } : { devBypass: new URL(baseUrl).hostname === "localhost" }),
});

const seed = JSON.parse(await readFile(new URL("../seed/seed.json", import.meta.url), "utf8"));
const pageSchema = seed.collections.find((collection) => collection.slug === "pages");
if (!pageSchema) throw new Error("pages collection is missing from seed");
const homeFields = pageSchema.fields.filter((field) =>
	field.slug.startsWith("hero_") ||
	field.slug.startsWith("activities_") ||
	field.slug.startsWith("projects_") ||
	field.slug.startsWith("faq_"),
);

const schema = await client.collection("pages");
const existing = new Set(schema.fields.map((field) => field.slug));
for (const field of homeFields) {
	if (existing.has(field.slug)) continue;
	await client.createField("pages", {
		slug: field.slug,
		label: field.label,
		type: field.type,
		validation: field.validation ?? null,
	});
	console.log(`Added ${field.slug}`);
}

const listed = await client.list("pages", { status: "published", limit: 100 });
const home = listed.items.find((item) => item.slug === "home");
if (!home) throw new Error("Published home page was not found");
const current = await client.get("pages", home.id, { raw: true });
const blocks = Array.isArray(current.data.content) ? current.data.content : [];
const block = (type) => blocks.find((item) => item?._type === `marketing.${type}`) ?? {};
const hero = block("hero");
const activities = block("activities");
const projects = block("projects");
const faq = block("faq");
const migrated = {
	hero_headline: hero.headline,
	hero_subheadline: hero.subheadline,
	hero_cta_label: hero.primaryCtaLabel,
	hero_cta_url: hero.primaryCtaUrl,
	activities_headline: activities.headline,
	activities_subheadline: activities.subheadline,
	activities_items: activities.items,
	projects_headline: projects.headline,
	projects_subheadline: projects.subheadline,
	projects_organization: projects.organization,
	projects_github_url: projects.githubUrl,
	projects_max: projects.maxProjects,
	faq_headline: faq.headline,
	faq_subheadline: faq.subheadline,
	faq_items: faq.items,
};
const updates = Object.fromEntries(
	Object.entries(migrated).filter(([key, value]) =>
		current.data[key] == null && value != null,
	),
);
if (Object.keys(updates).length > 0) {
	if (!current._rev) throw new Error("Home page revision token is missing");
	await client.update("pages", home.id, { data: updates, _rev: current._rev });
	console.log(`Copied ${Object.keys(updates).length} home fields into the existing draft (not published).`);
} else {
	console.log("Home fields are already present; no content was changed.");
}
