import assert from "node:assert/strict";
import { test } from "node:test";
import { homeContent } from "../src/lib/home-content.ts";
import { homeFieldWidgets } from "../src/plugins/site-settings/home-sections.mjs";
import seed from "../seed/seed.json" with { type: "json" };

test("the home schema uses four registered section widgets and preserves the initial copy", () => {
	const collection = seed.collections.find((item) => item.slug === "home");
	assert.deepEqual(collection.fields.map((field) => field.slug), ["hero", "activities", "projects", "faq"]);
	for (const field of collection.fields) {
		assert.equal(field.type, "json");
		assert.ok(homeFieldWidgets.some((widget) => `site-settings:${widget.name}` === field.widget));
	}
	assert.equal(collection.admin.quickCreate, false);
	const data = seed.content.home[0].data;
	const result = homeContent(data);
	assert.equal(result.hero.headline, data.hero.headline);
	assert.deepEqual(result.activities.items, data.activities.items);
	assert.deepEqual(result.faq.items, data.faq.items);
});

test("stored settings cannot override home headings, links, or GitHub configuration", () => {
	const result = homeContent({
		hero: { headline: "紹介", primaryCtaUrl: "https://example.com" },
		projects: { organization: "other", githubUrl: "https://example.com", maxProjects: 99 },
		activities_headline: "変更", faq_headline: "変更",
		hero_cta_label: "変更", hero_cta_url: "https://example.com",
		projects_organization: "other", projects_github_url: "https://example.com", projects_max: 99,
	});
	assert.equal(result.hero.primaryCtaLabel, "活動を見る");
	assert.equal(result.hero.primaryCtaUrl, "#activities");
	assert.equal(result.activities.headline, "活動内容");
	assert.equal(result.projects.headline, "公開プロジェクト");
	assert.equal(result.projects.organization, "tmed-it");
	assert.equal(result.projects.githubUrl, "https://github.com/tmed-it");
	assert.equal(result.projects.maxProjects, 5);
	assert.equal(result.faq.headline, "よくある質問");
});

test("legacy copy remains visible before resetting home and malformed JSON cannot break section rendering", () => {
	const result = homeContent({ hero_headline: "従来の見出し", activities_items: [{ title: "活動", description: "説明" }], faq_items: [{ question: "質問", answer: "回答" }] });
	assert.equal(result.hero.headline, "従来の見出し");
	assert.equal(result.activities.items[0].title, "活動");
	assert.equal(result.faq.items[0].answer, "回答");
	const malformed = homeContent({ hero: [], activities: { items: [null, 123, { title: {} }] }, faq: { items: "wrong" } });
	assert.equal(malformed.hero.headline, "");
	assert.deepEqual(malformed.activities.items, Array(3).fill({ title: "", description: "" }));
	assert.deepEqual(malformed.faq.items, []);
});
