import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createRequire } from "node:module";

const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
globalThis.__categoryTest = { env: { VERIFY_CLIENT_SECRET: { get: async () => "test-secret" } } };
const state = globalThis.__categoryTest;
const { outputFiles } = await build({
  stdin: { contents: `
    export * from './src/lib/category-archive';
    export * from './src/lib/page-route';
    export { privateRedirect } from './src/lib/campus-access';
    export { TOKEN_COOKIE } from './src/lib/verify-client';
    export { onRequest } from './src/middleware';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node",
  define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "category-platform", setup(build) {
    build.onResolve({ filter: /^(emdash|cloudflare:workers|astro:middleware)$/ }, args => ({ path: args.path, namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents:
      args.path === "cloudflare:workers" ? "export const env = globalThis.__categoryTest.env;" :
      args.path === "astro:middleware" ? "export const defineMiddleware = fn => fn;" : `
        export const getTerm = (...args) => globalThis.__categoryTest.getTerm(...args);
        export const getEmDashCollection = (...args) => globalThis.__categoryTest.getCollection(...args);
        export const getEmDashEntry = (...args) => globalThis.__categoryTest.getEntry(...args);
        export class OptionsRepository {}
      ` }));
  }}],
});
const app = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
beforeEach(() => {
  state.term = { name: "category", slug: "festival", label: "大森祭", description: "説明文", locale: "ja", children: [{ slug: "festival-2026", label: "大森祭2026", children: [] }] };
  state.entries = [{ id: "public", data: { title: "一般公開" } }, { id: "campus", data: { title: "学内限定", campus_only: true } }];
  state.queries = [];
  state.getTerm = async (...args) => { state.queries.push(args); return state.term; };
  state.getCollection = async (...args) => {
    state.queries.push(args);
    return { entries: state.entries, cacheHint: { tags: ["pages", "taxonomy:category:festival"] } };
  };
  state.page = { id: "guide", data: { id: "page-ulid", title: "ガイド", terms: { category: [state.term] } } };
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
    values, url: new URL("https://tmedit.org/festival"), locals: {},
    cookies: { get: key => values.has(key) ? { value: values.get(key) } : undefined, delete: key => values.delete(key) },
  };
}

test("category archives request published pages directly assigned to the term and hide campus-only pages from anonymous visitors", async () => {
  const archive = await app.getCategoryArchive("festival", context().cookies, "ja");
  assert.deepEqual(state.queries, [
    ["category", "festival", { locale: "ja", includeCounts: false }],
    ["pages", { status: "published", locale: "ja", where: { category: "festival" }, orderBy: { title: "asc" } }],
  ]);
  assert.deepEqual(archive.pages.map(page => page.id), ["public"]);
  assert.equal(archive.category.description, "説明文");
  assert.deepEqual(archive.category.children.map(child => child.slug), ["festival-2026"]);
  assert.deepEqual(archive.cacheHint.tags, ["pages", "taxonomy:category:festival"]);
  assert.equal(app.categoryHref("大森祭 2026"), "/%E5%A4%A7%E6%A3%AE%E7%A5%AD%202026");
  state.term = null;
  state.queries = [];
  assert.equal(await app.getCategoryArchive("missing", context().cookies), null);
  assert.equal(state.queries.length, 1);
});

test("page routes accept only assigned categories, including each category of a page", async () => {
  assert.equal((await app.getPageRoute("guide", "festival", "ja")).page.data.id, "page-ulid");
  assert.deepEqual(state.queries, [["pages", "guide", { locale: "ja" }]]);
  assert.equal(await app.getPageRoute("guide", "unrelated", "ja"), null);
  state.page.data.terms.category.push({ slug: "workshop", label: "講習会" });
  assert.equal((await app.getPageRoute("guide", "workshop")).category.label, "講習会");
  assert.equal((await app.getPageRoute("guide")).category, undefined);
  state.page = { id: "privacy", data: { title: "プライバシーポリシー" } };
  assert.equal(await app.getPageRoute("privacy", "festival"), null);
  assert.equal((await app.getPageRoute("privacy")).page.id, "privacy");
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

test("page URLs encode both slugs and pick a stable category for legacy links and sitemaps", () => {
  assert.equal(app.categoryPageHref("大森祭 2026", "参加/案内"), "/%E5%A4%A7%E6%A3%AE%E7%A5%AD%202026/%E5%8F%82%E5%8A%A0%2F%E6%A1%88%E5%86%85");
  const categories = [{ slug: "workshop" }, { slug: "festival" }];
  assert.equal(app.pageHref("guide", categories), "/festival/guide");
  assert.deepEqual(categories.map(c => c.slug), ["workshop", "festival"]);
  assert.equal(app.pageHref("privacy"), "/privacy");
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

test("category archives recheck verify on each visit and remove campus-only pages immediately on revocation", async () => {
  let calls = 0;
  globalThis.fetch = async () => Response.json({ active: ++calls === 1 });
  const ctx = context("token");
  assert.deepEqual((await app.getCategoryArchive("festival", ctx.cookies)).pages.map(page => page.id), ["public", "campus"]);
  assert.deepEqual((await app.getCategoryArchive("festival", ctx.cookies)).pages.map(page => page.id), ["public"]);
  assert.equal(calls, 2);
  assert.equal(ctx.values.has(app.TOKEN_COOKIE), false);
});

test("category archives propagate CMS errors and fail closed with a private 503 when verify is unavailable", async () => {
  const error = new Error("CMS unavailable");
  state.getCollection = async () => ({ error });
  await assert.rejects(app.getCategoryArchive("festival", context().cookies), error);
  state.getCollection = async () => ({ entries: state.entries });
  globalThis.fetch = async () => { throw new Error("verify unavailable"); };
  const ctx = context("token");
  const response = await app.onRequest(ctx, () => app.getCategoryArchive("festival", ctx.cookies));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(ctx.values.get(app.TOKEN_COOKIE), "token");
});
