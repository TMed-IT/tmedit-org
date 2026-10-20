import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createRequire } from "node:module";

const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
globalThis.__taxonomyTest = { env: { VERIFY_CLIENT_SECRET: { get: async () => "test-secret" } } };
const state = globalThis.__taxonomyTest;
const { outputFiles } = await build({
  stdin: { contents: `
    export * from './src/lib/taxonomy-archive';
    export * from './src/lib/page-route';
    export { privateRedirect } from './src/lib/campus-access';
    export { TOKEN_COOKIE } from './src/lib/verify-client';
    export { onRequest } from './src/middleware';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node",
  define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "category-platform", setup(build) {
    build.onResolve({ filter: /^(emdash|cloudflare:workers|astro:middleware)$/ }, args => ({ path: args.path, namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents:
      args.path === "cloudflare:workers" ? "export const env = globalThis.__taxonomyTest.env;" :
      args.path === "astro:middleware" ? "export const defineMiddleware = fn => fn;" : `
        export const getTerm = (...args) => globalThis.__taxonomyTest.getTerm(...args);
        export const getEmDashCollection = (...args) => globalThis.__taxonomyTest.getCollection(...args);
        export const getEmDashEntry = (...args) => globalThis.__taxonomyTest.getEntry(...args);
        export class OptionsRepository {}
        export const invalidateTaxonomyObjectCache = () => {};
        export const getTaxonomyDef = (...args) => globalThis.__taxonomyTest.getDefinition(...args);
        export const getTaxonomyDefs = (...args) => globalThis.__taxonomyTest.getDefinitions(...args);
        export const getTaxonomyTermsWithCacheHint = (...args) => globalThis.__taxonomyTest.getTerms(...args);
      ` }));
  }}],
});
const app = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
beforeEach(() => {
  state.definitions = [{ name: "omorisai", label: "大森祭", hierarchical: false, collections: ["pages"], locale: "ja" }];
  state.getDefinition = async (name) => state.definitions.find(def => def.name === name) ?? null;
  state.getDefinitions = async () => state.definitions;
  state.term = { name: "omorisai", slug: "2026", label: "2026", description: "説明文", locale: "ja", children: [] };
  state.getTerms = async (...args) => { state.queries.push(args); return { data: [state.term], cacheHint: { tags: ["taxonomy:omorisai"] } }; };
  state.entries = [{ id: "public", data: { title: "一般公開" } }, { id: "campus", data: { title: "学内限定", campus_only: true } }];
  state.queries = [];
  state.getTerm = async (...args) => { state.queries.push(args); return state.term; };
  state.getCollection = async (...args) => {
    state.queries.push(args);
    return { entries: state.entries, cacheHint: { tags: ["pages", "taxonomy:omorisai"] } };
  };
  state.page = { id: "guide", data: { id: "page-ulid", title: "ガイド", terms: { omorisai: [state.term] } } };
  state.getEntry = async (...args) => {
    state.queries.push(args);
    return { entry: state.page, cacheHint: { tags: ["pages", "page-ulid"] } };
  };
  globalThis.fetch = async () => { throw new Error("anonymous requests must not contact verify"); };
});
afterEach(() => { globalThis.fetch = originalFetch; });
function context(token) {
  const values = new Map(token ? [[app.TOKEN_COOKIE, token]] : []);
  return {
    values, url: new URL("https://tmedit.org/omorisai/2026"), locals: {},
    cookies: { get: key => values.has(key) ? { value: values.get(key) } : undefined, delete: key => values.delete(key) },
  };
}

test("taxonomy archives request published pages directly assigned to the term and hide campus-only pages from anonymous visitors", async () => {
  const archive = await app.getTaxonomyArchive("omorisai", "2026", context().cookies, "ja");
  assert.deepEqual(state.queries, [
    ["omorisai", "2026", { locale: "ja", includeCounts: false }],
    ["pages", { status: "published", locale: "ja", where: { omorisai: "2026" }, orderBy: { title: "asc" } }],
  ]);
  assert.deepEqual(archive.pages.map(page => page.id), ["public"]);
  assert.equal(archive.term.description, "説明文");
  assert.equal(archive.taxonomy.label, "大森祭");
  assert.deepEqual(archive.cacheHint.tags, ["pages", "taxonomy:omorisai"]);
  assert.equal(app.termHref("omorisai", "2026"), "/omorisai/2026");
  state.term = null;
  state.queries = [];
  assert.equal(await app.getTaxonomyArchive("omorisai", "missing", context().cookies), null);
  assert.equal(state.queries.length, 1);
});

test("page routes validate the taxonomy and assigned term, and only expose taxonomies attached to pages", async () => {
  assert.equal((await app.getPageRoute("guide", { taxonomy: "omorisai", term: "2026" }, "ja")).page.data.id, "page-ulid");
  assert.deepEqual(state.queries, [["pages", "guide", { locale: "ja" }]]);
  assert.equal(await app.getPageRoute("guide", { taxonomy: "omorisai", term: "unrelated" }), null);
  assert.equal(await app.getPageRoute("guide", { taxonomy: "missing", term: "2026" }), null);
  state.definitions.push({ name: "technology", label: "使用技術", collections: ["pages"] });
  state.page.data.terms.technology = [{ slug: "python", label: "Python" }];
  assert.equal((await app.getPageRoute("guide", { taxonomy: "technology", term: "python" })).term.label, "Python");
  state.definitions[1].collections = ["news"];
  assert.equal(await app.getPageRoute("guide", { taxonomy: "technology", term: "python" }), null);
  assert.equal((await app.getPageRoute("guide")).terms.technology, undefined);
  state.page = { id: "privacy", data: { title: "プライバシーポリシー" } };
  assert.equal(await app.getPageRoute("privacy", { taxonomy: "omorisai", term: "2026" }), null);
  assert.equal((await app.getPageRoute("privacy")).page.id, "privacy");
});

test("taxonomy indexes use CMS definitions and terms without exposing content or counts", async () => {
  const index = await app.getTaxonomyIndex("omorisai", "ja");
  assert.equal(index.taxonomy.label, "大森祭");
  assert.deepEqual(index.terms, [state.term]);
  assert.deepEqual(state.queries, [["omorisai", { locale: "ja", includeCounts: false }]]);
  assert.equal(await app.getTaxonomyIndex("missing"), null);
  state.definitions[0].collections = ["news"];
  assert.equal(await app.getTaxonomyIndex("omorisai"), null);
  assert.equal(await app.getTaxonomyArchive("omorisai", "2026", context().cookies), null);
});

test("page routes distinguish missing content from CMS errors", async () => {
  state.page = null;
  assert.equal(await app.getPageRoute("missing"), null);
  const missing = new Error("Not found");
  missing.name = "LiveEntryNotFoundError";
  state.getEntry = async () => ({ error: missing });
  assert.equal(await app.getPageRoute("missing"), null);
  const unavailable = new Error("CMS unavailable");
  state.getEntry = async () => ({ error: unavailable });
  await assert.rejects(app.getPageRoute("guide"), unavailable);
});

test("page URLs encode all segments and pick a stable taxonomy and term without mutating assignments", () => {
  assert.equal(app.taxonomyPageHref("omorisai", "2026", "参加/案内"), "/omorisai/2026/%E5%8F%82%E5%8A%A0%2F%E6%A1%88%E5%86%85");
  const terms = { technology: [{ slug: "python" }], omorisai: [{ slug: "2027" }, { slug: "2026" }] };
  assert.equal(app.pageHref("guide", terms), "/omorisai/2026/guide");
  assert.deepEqual(terms.omorisai.map(term => term.slug), ["2027", "2026"]);
  assert.equal(app.pageHref("privacy"), "/privacy");
  assert.equal(app.pageHref("guide", { empty: [], technology: [{ slug: "python" }] }), "/technology/python/guide");
});

test("redirects retain private caching and robots headers on the returned response", () => {
  const headers = new Headers({ "X-Robots-Tag": "noindex, nofollow" });
  const response = app.privateRedirect("/auth/verify/start?returnTo=%2Ffestival%2Fcampus-guide", headers);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(response.headers.get("Location"), "/auth/verify/start?returnTo=%2Ffestival%2Fcampus-guide");
  assert.equal(headers.has("Location"), false);
});

test("taxonomy archives recheck verify on each visit and remove campus-only pages immediately on revocation", async () => {
  let calls = 0;
  globalThis.fetch = async () => Response.json({ active: ++calls === 1 });
  const ctx = context("token");
  assert.deepEqual((await app.getTaxonomyArchive("omorisai", "2026", ctx.cookies)).pages.map(page => page.id), ["public", "campus"]);
  assert.deepEqual((await app.getTaxonomyArchive("omorisai", "2026", ctx.cookies)).pages.map(page => page.id), ["public"]);
  assert.equal(calls, 2);
  assert.equal(ctx.values.has(app.TOKEN_COOKIE), false);
});

test("taxonomy archives propagate CMS errors and fail closed with a private 503 when verify is unavailable", async () => {
  const error = new Error("CMS unavailable");
  state.getCollection = async () => ({ error });
  await assert.rejects(app.getTaxonomyArchive("omorisai", "2026", context().cookies), error);
  state.getCollection = async () => ({ entries: state.entries });
  globalThis.fetch = async () => { throw new Error("verify unavailable"); };
  const ctx = context("token");
  const response = await app.onRequest(ctx, () => app.getTaxonomyArchive("omorisai", "2026", ctx.cookies));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(ctx.values.get(app.TOKEN_COOKIE), "token");
});
