import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler"))("esbuild");

// Compile the actual routes; mock only platform bindings and framework entry points.
const { outputFiles } = await build({
  stdin: { contents: `
    export { GET as start } from './src/pages/auth/verify/start';
    export { GET as callback } from './src/pages/auth/verify/callback';
    export { isCampusRequest } from './src/lib/campus-access';
    export { onRequest } from './src/middleware';
    export * from './src/lib/verify-client';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: "esm", platform: "node",
  define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "test-platform", setup(build) {
    build.onResolve({ filter: /^(cloudflare:workers|astro:middleware|emdash)$/ }, args => ({ path: args.path, namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents:
      args.path === "cloudflare:workers" ? "export const env = globalThis.__verifyTestEnv;" :
      args.path === "astro:middleware" ? "export const defineMiddleware = fn => fn;" :
      "export class OptionsRepository {}" }));
  }}],
});
globalThis.__verifyTestEnv = { VERIFY_CLIENT_SECRET: { get: async () => "test-secret" } };
const app = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = originalFetch; });
function context(path, initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    url: new URL(path, "https://tmedit.org"), locals: {}, writes, values,
    cookies: {
      get: key => values.has(key) ? { value: values.get(key) } : undefined,
      set: (key, value, options) => { values.set(key, value); writes.push({ key, value, options }); },
      delete: (key, options) => { values.delete(key); writes.push({ key, deleted: true, options }); },
    },
    redirect: (url, status = 302) => new Response(null, { status, headers: { Location: url } }),
  };
}

test("safe return paths reject external redirects and keep subscription query parameters", () => {
  for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/auth/verify/start", "/\n/evil.example"])
    assert.equal(app.safeReturnTo(path), "/newsroom");
  assert.equal(app.safeReturnTo("/subscribe/confirm?token=abc"), "/subscribe/confirm?token=abc");
});

test("authorization flow binds state and PKCE to a secure browser cookie, then restores the destination", async () => {
  const ctx = context("/auth/verify/start?returnTo=%2Fnewsroom%2Fexample");
  const response = await app.start(ctx);
  const target = new URL(response.headers.get("Location"));
  const flow = JSON.parse(ctx.values.get(app.FLOW_COOKIE));
  assert.equal(target.origin, app.VERIFY_ORIGIN);
  assert.equal(target.searchParams.get("state"), flow.state);
  assert.equal(target.searchParams.get("code_challenge"), await app.challenge(flow.verifier));
  assert.equal(target.searchParams.get("code_challenge_method"), "S256");
  assert.equal(target.searchParams.get("redirect_uri"), app.CALLBACK_URL);
  assert.deepEqual(ctx.writes[0].options, { ...app.COOKIE_OPTIONS, maxAge: 1200 });
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  ctx.url = new URL(`${app.CALLBACK_URL}?code=${"c".repeat(43)}&state=${flow.state}`);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, app.VERIFY_ORIGIN + "/auth/token");
    const payload = JSON.parse(options.body);
    assert.equal(payload.code_verifier, flow.verifier);
    assert.equal(payload.client_secret, "test-secret");
    assert.equal(payload.client_id, "tmedit");
    return Response.json({ access_token: "t".repeat(43), token_type: "Bearer", expires_in: 3600 });
  };
  const completed = await app.callback(ctx);
  assert.equal(completed.headers.get("Location"), "/newsroom/example");
  assert.equal(ctx.values.get(app.TOKEN_COOKIE), "t".repeat(43));
  assert.equal(ctx.values.has(app.FLOW_COOKIE), false);
  assert.equal(ctx.writes[1].options.httpOnly, true);
});

test("callback rejects missing/mismatched state and expired flow without exchanging a code", async () => {
  globalThis.fetch = () => { throw new Error("must not fetch"); };
  const flow = { state: "s".repeat(43), verifier: "v".repeat(43), created: Date.now(), returnTo: "/" };
  for (const [queryState, cookie] of [
    ["wrong", flow], [null, flow], [flow.state, { ...flow, created: Date.now() - 21 * 60_000 }], [flow.state, null],
  ]) {
    const ctx = context(`/auth/verify/callback?code=${"c".repeat(43)}${queryState ? `&state=${queryState}` : ""}`,
      { [app.FLOW_COOKIE]: JSON.stringify(cookie) });
    assert.equal((await app.callback(ctx)).status, 400);
    assert.equal(ctx.values.has(app.TOKEN_COOKIE), false);
  }
});

test("each request checks the token; revocation removes it and anonymous requests need no secret", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ active: calls === 1 }); };
  const ctx = context("/newsroom", { [app.TOKEN_COOKIE]: "t".repeat(43) });
  assert.equal(await app.isCampusRequest(ctx.cookies), true);
  assert.equal(await app.isCampusRequest(ctx.cookies), false);
  assert.equal(calls, 2);
  assert.equal(ctx.values.has(app.TOKEN_COOKIE), false);
  assert.equal(await app.isCampusRequest(ctx.cookies), false);
  assert.equal(calls, 2);
});

test("service/network/invalid response failures return 503 and preserve the existing cookie", async () => {
  for (const transport of [
    async () => new Response(null, { status: 503 }),
    async () => new Response(null, { status: 401 }),
    async () => { throw new Error("network down"); },
    async () => Response.json({ active: "true" }),
    async () => new Response("not json"),
  ]) {
    globalThis.fetch = transport;
    const ctx = context("/newsroom", { [app.TOKEN_COOKIE]: "t".repeat(43) });
    const response = await app.onRequest(ctx, () => app.isCampusRequest(ctx.cookies));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(ctx.values.get(app.TOKEN_COOKIE), "t".repeat(43));
    assert.equal(ctx.writes.length, 0);
  }
});

test("expired authorization codes return 400 without replacing an existing token", async () => {
  const flow = { state: "s".repeat(43), verifier: "v".repeat(43), created: Date.now(), returnTo: "/" };
  const ctx = context(`/auth/verify/callback?code=${"c".repeat(43)}&state=${flow.state}`,
    { [app.FLOW_COOKIE]: JSON.stringify(flow), [app.TOKEN_COOKIE]: "old-token" });
  globalThis.fetch = async () => Response.json({ error: "invalid_grant" }, { status: 400 });
  const response = await app.onRequest(ctx, () => app.callback(ctx));
  assert.equal(response.status, 400);
  assert.equal(ctx.values.get(app.TOKEN_COOKIE), "old-token");
  assert.equal(ctx.writes.length, 0);
});

test("a stalled secret binding fails closed instead of leaving a request pending", async () => {
  const secret = globalThis.__verifyTestEnv.VERIFY_CLIENT_SECRET;
  const originalGet = secret.get;
  secret.get = () => new Promise(() => {});
  const ctx = context("/newsroom", { [app.TOKEN_COOKIE]: "t".repeat(43) });
  try {
    const response = await app.onRequest(ctx, () => app.isCampusRequest(ctx.cookies));
    assert.equal(response.status, 503);
    assert.equal(ctx.values.get(app.TOKEN_COOKIE), "t".repeat(43));
  } finally { secret.get = originalGet; }
});
