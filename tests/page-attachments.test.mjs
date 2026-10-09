import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import seed from "../seed/seed.json" with { type: "json" };

const require = createRequire(import.meta.resolve("emdash/db"));
const { Kysely, CompiledQuery } = require("kysely");
const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
globalThis.__attachmentTest = { env: {} };
const { outputFiles } = await build({
  stdin: { contents: `
    export { GET } from './src/pages/api/pages/[slug]/document';
    export { onRequest } from './src/middleware';
    export { isPageAttachmentKey } from './src/lib/page-attachments';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node",
  define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "attachment-platform", setup(build) {
    build.onResolve({ filter: /^(emdash|cloudflare:workers|astro:middleware)$/ }, args => ({ path: args.path, namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents:
      args.path === "cloudflare:workers" ? "export const env = globalThis.__attachmentTest.env;" :
      args.path === "astro:middleware" ? "export const defineMiddleware = fn => fn;" : `
        export const decodeSlug = value => value ? decodeURIComponent(value) : undefined;
        export const getEmDashEntry = async () => globalThis.__attachmentTest.result;
        export class OptionsRepository {}
        ` }));
  }}],
});
const app = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const state = globalThis.__attachmentTest;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  state.result = { entry: { data: { document: { id: "pdf", meta: { storageKey: "untrusted-key" } } } }, cacheHint: { tags: ["pages"] } };
  state.media = new Map([["pdf", { id: "pdf", storageKey: "actual.pdf", mimeType: "application/pdf", filename: '資料"\r\n.pdf', status: "ready" }]]);
  state.downloads = [];
  state.env.VERIFY_CLIENT_SECRET = { get: async () => "test-secret" };
  state.env.DB = { prepare() {
    let id;
    return { bind(value) { id = value; return this; }, async first() {
      const media = state.media.get(id);
      return media ? { filename: media.filename, mime_type: media.mimeType, storage_key: media.storageKey, status: media.status } : null;
    } };
  } };
  state.env.MEDIA = { get: async key => {
    state.downloads.push(key);
    return { httpMetadata: { contentType: "application/pdf" }, size: 8, body: new Blob(["%PDF-1.7"]).stream() };
  } };
  globalThis.fetch = originalFetch;
});
function context(query = "", token) {
  const cacheHints = [];
  return {
    params: { slug: "example" }, url: new URL(`https://tmedit.org/api/pages/example/document${query}`),
    cookies: { get: () => token ? { value: token } : undefined, delete() {} },
    cache: { set: value => cacheHints.push(value) }, cacheHints,
    locals: {},
  };
}

test("public attachments render inline and download with a safely encoded original filename, never trusting cached keys", async () => {
  for (const [query, disposition] of [["", "inline"], ["?download=1", "attachment"]]) {
    const ctx = context(query);
    const response = await app.GET(ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.match(response.headers.get("Content-Disposition"), new RegExp(`^${disposition};`));
    assert.match(response.headers.get("Content-Disposition"), /filename\*=UTF-8''%E8%B3%87%E6%96%99%22%0D%0A.pdf/);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(ctx.cacheHints.at(-1), false);
    assert.equal(await response.text(), "%PDF-1.7");
  }
  assert.deepEqual(state.downloads, ["actual.pdf", "actual.pdf"]);
});

test("campus attachments require an active verify token on every preview and download request", async () => {
  state.result.entry.data.campus_only = true;
  assert.equal((await app.GET(context())).status, 403);
  assert.deepEqual(state.downloads, []);
  let checks = 0;
  globalThis.fetch = async () => Response.json({ active: ++checks === 1 });
  try {
    assert.equal((await app.GET(context("", "token"))).status, 200);
    assert.equal((await app.GET(context("?download=1", "token"))).status, 403);
    assert.equal(checks, 2);
    assert.equal(state.downloads.length, 1);
    globalThis.fetch = async () => { throw new Error("verify unavailable"); };
    const ctx = context("", "token");
    const response = await app.onRequest(ctx, () => app.GET(ctx));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  } finally { globalThis.fetch = originalFetch; }
});

test("missing, unpublished, deleted, pending, external, and non-PDF attachments are not served", async () => {
  for (const update of [
    () => { state.result.entry = null; },
    () => { state.result.entry.data.document = null; },
    () => { state.result.entry.data.document.provider = "external"; },
    () => { state.media.clear(); },
    () => { state.media.get("pdf").status = "pending"; },
    () => { state.media.get("pdf").mimeType = "text/html"; },
  ]) {
    const result = structuredClone(state.result);
    const media = new Map([...state.media].map(([key, value]) => [key, { ...value }]));
    update();
    assert.equal((await app.GET(context())).status, 404);
    assert.deepEqual(state.downloads, []);
    state.result = result;
    state.media = media;
  }
  const ctx = context();
  state.env.MEDIA.get = async () => ({ httpMetadata: { contentType: "text/html" }, size: 0 });
  assert.equal((await app.GET(ctx)).status, 404);
});

test("page references and revision references block direct media URLs, while unrelated media remain public", async () => {
  const db = new Kysely({ dialect: createDialect({ url: ":memory:" }) });
  await runMigrations(db);
  await applySeed(db, seed, { includeContent: true });
  const d1 = { prepare(query) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return (await db.executeQuery(CompiledQuery.raw(query, values))).rows[0] ?? null; },
    };
  } };
  state.env.DB = d1;
  try {
    await db.updateTable("ec_pages").set({ document: JSON.stringify({ id: "pdf", meta: { storageKey: "actual.pdf" } }) }).execute();
    assert.equal(await app.isPageAttachmentKey(d1, "actual.pdf"), true);
    assert.equal(await app.isPageAttachmentKey(d1, "other.pdf"), false);
    for (const path of ["actual.pdf", "%61ctual.pdf", "%2561ctual.pdf"]) {
      const ctx = context();
      ctx.url = new URL(`https://tmedit.org/_emdash/api/media/file/${path}`);
      assert.equal((await app.onRequest(ctx, () => { throw new Error("must not reach public storage"); })).status, 404);
    }
    const ctx = context();
    ctx.url = new URL("https://tmedit.org/_emdash/api/media/file/actual.pdf");
    ctx.locals.user = { id: "admin" };
    const response = await app.onRequest(ctx, () => new Response("admin media"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    await db.updateTable("ec_pages").set({ document: null }).execute();
    await db.insertInto("revisions").values({ id: "revision", collection: "pages", entry_id: "example", data: JSON.stringify({ document: { meta: { storageKey: "actual.pdf" } } }) }).execute();
    assert.equal(await app.isPageAttachmentKey(d1, "actual.pdf"), true);
  } finally { await db.destroy(); }
});
