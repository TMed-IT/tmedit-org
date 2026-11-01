import assert from "node:assert/strict";
import { beforeEach, afterEach, test } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import manifest from "../src/generated/documents/manifest.json" with { type: "json" };

const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
const state = globalThis.__documentAccessTest = { env: {}, downloads: 0, documents: manifest.documents };
const { outputFiles } = await build({
  stdin: { contents: `
    export { onRequest } from './src/middleware';
    export { GET as download } from './src/pages/docs/[slug]/document';
    export { GET as legacy } from './src/pages/documents/files/[hash]/[filename]';
    export { TOKEN_COOKIE } from './src/lib/verify-client';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node",
  define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "document-test-platform", setup(build) {
    build.onResolve({ filter: /^(cloudflare:workers|astro:middleware|emdash)$/ }, args => ({ path: args.path, namespace: "test" }));
    build.onResolve({ filter: /\/document-files$/ }, () => ({ path: "document-files", namespace: "test" }));
    build.onResolve({ filter: /\/documents$/ }, () => ({ path: "documents", namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents:
      args.path === "cloudflare:workers" ? "export const env = globalThis.__documentAccessTest.env;" :
      args.path === "astro:middleware" ? "export const defineMiddleware = fn => fn;" :
      args.path === "documents" ? "export const documents = globalThis.__documentAccessTest.documents;" :
      args.path === "document-files" ? `export function documentBytes(slug) {
        globalThis.__documentAccessTest.downloads++;
        return slug === 'regulations' ? new TextEncoder().encode('%PDF-1.7') : null;
      }` : "export class OptionsRepository {} export const invalidateTaxonomyObjectCache = () => {};" }));
  }}],
});
const app = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
beforeEach(() => {
  state.env.VERIFY_CLIENT_SECRET = { get: async () => "test-secret" };
  state.downloads = 0;
  globalThis.fetch = originalFetch;
});
afterEach(() => { globalThis.fetch = originalFetch; });

function context(path, token) {
  const values = new Map(token ? [[app.TOKEN_COOKIE, token]] : []);
  const hints = [];
  return {
    url: new URL(path, "https://tmedit.org"), params: { slug: "regulations" }, locals: {},
    cookies: { get: key => values.has(key) ? { value: values.get(key) } : undefined, delete: key => values.delete(key) },
    cache: { set: hint => hints.push(hint) }, values, hints,
  };
}

const regulations = manifest.documents.find((document) => document.slug === "regulations");
const oldPdf = `/documents/files/${regulations.pdfSha256}/regulations.pdf`;

test("anonymous visits cannot render document pages or obtain current or legacy PDFs", async () => {
  globalThis.fetch = () => { throw new Error("No verify call is needed without a cookie"); };
  for (const path of ["/docs", "/docs/regulations", "/docs/regulations/document?download=1", "/documents", "/documents/regulations", oldPdf, "/%64ocs/regulations"]) {
    const ctx = context(path);
    const response = await app.onRequest(ctx, () => { throw new Error("Restricted content must not render"); });
    assert.equal(response.status, 302);
    const target = new URL(response.headers.get("Location"), ctx.url);
    assert.equal(target.pathname, "/auth/verify/start");
    assert.equal(target.searchParams.get("returnTo"), path);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(ctx.hints.at(-1), false);
    assert.equal(await response.text(), "");
  }
  assert.equal(state.downloads, 0);
});

test("every page, PDF and legacy visit introspects verify and never returns shared-cache headers", async () => {
  let checks = 0;
  globalThis.fetch = async url => { assert.match(url, /\/auth\/introspect$/); checks++; return Response.json({ active: true }); };
  for (const path of ["/docs", "/docs/regulations", "/documents/regulations", oldPdf]) {
    const ctx = context(path, "active-token");
    const response = await app.onRequest(ctx, () => new Response("private content", { headers: { "Cache-Control": "public, max-age=3600" } }));
    assert.equal(await response.text(), "private content");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(ctx.hints.at(-1), false);
  }
  const ctx = context("/docs/regulations/document", "active-token");
  const response = await app.onRequest(ctx, () => app.download(ctx));
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.match(response.headers.get("Content-Disposition"), /^attachment;/);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(await response.text(), "%PDF-1.7");
  assert.equal(checks, 5);
});

test("revocation, CMS admin login and verify outages do not bypass document authentication", async () => {
  const revoked = context("/docs/regulations/document", "revoked-token");
  revoked.locals.user = { id: "cms-admin" };
  globalThis.fetch = async () => Response.json({ active: false });
  const response = await app.onRequest(revoked, () => app.download(revoked));
  assert.equal(response.status, 302);
  assert.equal(revoked.values.has(app.TOKEN_COOKIE), false);
  assert.equal(state.downloads, 0);
  globalThis.fetch = async () => { throw new Error("verify unavailable"); };
  const offline = context("/docs/regulations/document", "token");
  const unavailable = await app.onRequest(offline, () => app.download(offline));
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Cache-Control"), "private, no-store");
  assert.equal(offline.values.get(app.TOKEN_COOKIE), "token");
  assert.equal(state.downloads, 0);
});

test("legacy PDF URLs lead only to authenticated downloads and unknown files return private 404s", async () => {
  globalThis.fetch = async () => Response.json({ active: true });
  const ctx = context(oldPdf, "token");
  ctx.params = { hash: regulations.pdfSha256, filename: "regulations.pdf" };
  const response = await app.onRequest(ctx, () => app.legacy(ctx));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/docs/regulations/document");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const missing = context("/docs/missing/document", "token");
  missing.params.slug = "missing";
  const notFound = await app.onRequest(missing, () => app.download(missing));
  assert.equal(notFound.status, 404);
  assert.equal(notFound.headers.get("Cache-Control"), "private, no-store");
});

test("an unrelated route remains public and former PDFs no longer exist in the public asset directory", async () => {
  const ctx = context("/docs-other");
  const response = await app.onRequest(ctx, () => new Response("public"));
  assert.equal(await response.text(), "public");
  assert.equal(ctx.hints.length, 0);
  for (const document of manifest.documents) {
    await assert.rejects(readFile(new URL(`../brand/documents/files/${document.pdfSha256}/${document.slug}.pdf`, import.meta.url)), { code: "ENOENT" });
  }
});
