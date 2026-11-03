import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { createRequire } from "node:module";
import { getRequestContext, runWithContext } from "emdash/request-context";

const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
const state = globalThis.__ruleAccess = { env: {}, entry: null, pages: [], queries: [] };
const { outputFiles } = await build({
	stdin: { contents: `
		export { GET as download } from './src/pages/docs/[slug]/document';
		export { onRequest } from './src/middleware';
		export { getRules, getRule, ruleAccess } from './src/lib/documents';
		export { TOKEN_COOKIE } from './src/lib/verify-client';`, resolveDir: process.cwd() },
	bundle: true, write: false, format: "esm", platform: "node", define: { "import.meta.env.DEV": "false" },
	plugins: [{ name: "rule-platform", setup(build) {
		build.onResolve({ filter: /^(cloudflare:workers|astro:middleware|emdash)$/ }, args => ({ path: args.path, namespace: "test" }));
		build.onLoad({ filter: /.*/, namespace: "test" }, args => ({ resolveDir: process.cwd(), contents:
			args.path === "cloudflare:workers" ? "export const env = globalThis.__ruleAccess.env;" :
			args.path === "astro:middleware" ? "export const defineMiddleware = fn => fn;" : `
				import { getRequestContext } from 'emdash/request-context';
				export { getRequestContext, runWithContext } from 'emdash/request-context';
				export class OptionsRepository {} export const invalidateTaxonomyObjectCache = () => {};
				export const decodeSlug = value => value ? decodeURIComponent(value) : undefined;
				export async function getEmDashEntry(collection, slug) {
					const context = getRequestContext();
					const isPreview = !!(context?.editMode || context?.preview);
					globalThis.__ruleAccess.queries.push({collection, slug, context});
					if(globalThis.__ruleAccess.error)throw globalThis.__ruleAccess.error;
					return {entry:isPreview && globalThis.__ruleAccess.previewEntry ? globalThis.__ruleAccess.previewEntry : globalThis.__ruleAccess.entry,isPreview,cacheHint:{tags:['content:rules']}};
				}
				export async function getEmDashCollection(collection, filter) {
					globalThis.__ruleAccess.queries.push({collection, filter});
					return globalThis.__ruleAccess.pages.shift();
				}` }));
	}}],
});
const app = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
const rule = (campus = false) => ({ id: "rule", data: { id: "db-id", status: "published", title: "諸則", content: [{ _type: "block", children: [{ _type: "span", text: "本文" }] }], campus_only: campus, updatedAt: new Date("2026-11-03T00:00:00Z") } });
beforeEach(() => {
	state.env.VERIFY_CLIENT_SECRET = { get: async () => "test-secret" };
	state.entry = rule(); state.error = null; state.queries = []; state.pages = [];
	state.previewEntry = null;
	globalThis.fetch = originalFetch;
});
afterEach(() => { globalThis.fetch = originalFetch; });
function context(token) {
	const values = new Map(token ? [[app.TOKEN_COOKIE, token]] : []);
	return { params: { slug: "rule" }, url: new URL("https://tmedit.org/docs/rule/document"), locals: {},
		cookies: { get: key => values.has(key) ? { value: values.get(key) } : undefined, delete: key => values.delete(key) },
		cache: { set() {} }, values };
}

test("public rules and PDF data are available without verify, even when the service is unavailable", async () => {
	globalThis.fetch = () => { throw new Error("public rules must not call verify"); };
	const ctx = context("old-token");
	assert.equal(await app.ruleAccess(false, ctx, new Headers()), null);
	const response = await app.download(ctx);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("Cache-Control"), "private, no-store");
	assert.equal((await response.json()).title, "諸則");
});

test("PDF data remains available in edit mode without changing the caller's DB, locale or editing context", async () => {
	const outer = { editMode: true, locale: "ja", db: { session: "request-db" }, metrics: { cacheHits: 0 } };
	await runWithContext(outer, async () => {
		const response = await app.download(context());
		assert.equal(response.status, 200);
		assert.equal((await response.json()).title, state.entry.data.title);
		assert.equal(getRequestContext(), outer);
	});
	const read = state.queries[0].context;
	assert.equal(read.editMode, false);
	assert.equal(read.preview, undefined);
	assert.equal(read.db, outer.db);
	assert.equal(read.locale, outer.locale);
	assert.equal(read.metrics, outer.metrics);
});

test("PDF reads the published version while concurrent page reads keep draft changes and preview context", async () => {
	state.previewEntry = { ...rule(), data: { ...rule().data, title: "未公開の変更", content: [{ _type: "block", children: [{ _type: "span", text: "下書き本文" }] }] } };
	for (const outer of [{ editMode: true }, { editMode: false, preview: { collection: "rules", id: "db-id" } }]) {
		await runWithContext(outer, async () => {
			const [page, response] = await Promise.all([app.getRule("rule"), app.download(context())]);
			assert.equal(page.isPreview, true);
			assert.equal(page.entry.data.title, "未公開の変更");
			assert.equal(response.status, 200);
			const pdf = await response.json();
			assert.equal(pdf.title, state.entry.data.title);
			assert.deepEqual(pdf.content, state.entry.data.content);
			assert.equal(getRequestContext(), outer);
		});
	}
});

test("edit mode cannot use draft visibility or preview tokens to bypass published campus scope", async () => {
	state.entry = rule(true);
	state.previewEntry = rule(false);
	await runWithContext({ editMode: true, preview: { collection: "rules", id: "db-id" } }, async () => {
		const response = await app.download(context());
		assert.equal(response.status, 302);
		assert.equal(await response.text(), "");
		state.entry.data.status = "draft";
		assert.equal((await app.download(context())).status, 404);
	});
});

test("campus rule HTML and PDF data require verify; an admin login does not bypass it", async () => {
	state.entry = rule(true);
	for (const admin of [false, true]) {
		const ctx = context(); if (admin) ctx.locals.user = { id: "admin" };
		const response = await app.download(ctx);
		assert.equal(response.status, 302);
		assert.equal(new URL(response.headers.get("Location"), ctx.url).pathname, "/auth/verify/start");
		assert.equal(response.headers.get("Cache-Control"), "private, no-store");
		assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
		assert.equal(await response.text(), "");
	}
});

test("published edits, scope changes and revoked tokens take effect on the next PDF request", async () => {
	let checks = 0;
	globalThis.fetch = async () => Response.json({ active: ++checks === 1 });
	const ctx = context("token");
	assert.equal((await app.download(ctx)).status, 200);
	state.entry = rule(true); state.entry.data.title = "改訂版";
	const updated = await app.download(ctx);
	assert.equal((await updated.json()).title, "改訂版");
	assert.equal((await app.download(ctx)).status, 302);
	assert.equal(checks, 2);
	assert.equal(ctx.values.has(app.TOKEN_COOKIE), false);
	assert.equal(state.queries.length, 3);
});

test("verify outages fail closed with a private 503 and preserve the existing token", async () => {
	state.entry = rule(true);
	globalThis.fetch = async () => { throw new Error("offline"); };
	const ctx = context("token");
	const response = await app.onRequest(ctx, () => app.download(ctx));
	assert.equal(response.status, 503);
	assert.equal(response.headers.get("Cache-Control"), "private, no-store");
	assert.equal(ctx.values.get(app.TOKEN_COOKIE), "token");
});

test("rule lists paginate, filter private entries before presentation, and honor CMS failures", async () => {
	state.pages = [
		{ entries: [rule(), rule(true)], nextCursor: "page-2", cacheHint: { tags: ["page-1"] } },
		{ entries: [{ ...rule(), id: "second" }], cacheHint: { tags: ["page-2"] } },
	];
	const result = await app.getRules(false);
	assert.deepEqual(result.entries.map(entry => entry.id), ["rule", "second"]);
	assert.deepEqual(result.cacheHint.tags, ["page-1", "page-2"]);
	assert.equal(state.queries[0].filter.where.campus_only, "0");
	assert.equal(state.queries[1].filter.cursor, "page-2");
	state.pages = [{ entries: [rule(), rule(true)], cacheHint: {} }];
	assert.equal((await app.getRules(true)).entries.length, 2);
	state.error = new Error("CMS unavailable");
	await assert.rejects(app.getRule("rule"), /CMS unavailable/);
	state.error.name = "LiveEntryNotFoundError";
	assert.equal((await app.download(context())).status, 404);
});

test("deleted or unpublished entries return a private 404 without generating PDF data", async () => {
	state.entry.data.status = "draft";
	assert.equal((await app.download(context())).status, 404);
	state.entry = null;
	const response = await app.download(context());
	assert.equal(response.status, 404);
	assert.equal(response.headers.get("Cache-Control"), "private, no-store");
	assert.equal((await app.getRule("bad%2Fslug")).entry, null);
});

test("rule list uses the CMS display order across pages instead of a hard-coded title order", async () => {
	const entry = (id, title, display_order) => ({ ...rule(), id, data: { ...rule().data, title, display_order } });
	state.pages = [
		{ entries: [entry("second", "あとの文書", 20)], nextCursor: "next", cacheHint: {} },
		{ entries: [entry("first", "最初の文書", 10), entry("default", "既定の文書", undefined)], cacheHint: {} },
	];
	assert.deepEqual((await app.getRules(true)).entries.map(entry => entry.id), ["first", "second", "default"]);
	assert.deepEqual(state.queries[0].filter.orderBy, { display_order: "asc" });
});
