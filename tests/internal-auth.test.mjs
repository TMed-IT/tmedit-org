import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { getAuthProviderStorage } from "emdash/api/route-utils";
import { createKyselyAdapter } from "@emdash-cms/auth/adapters/kysely";
import { getInternalAvatarUrl } from "../auth/avatar.ts";

const { Kysely } = createRequire(import.meta.resolve("emdash/db"))("kysely");
const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
const authOrigin = "https://auth.example.org";
const { outputFiles } = await build({
  entryPoints: ["auth/routes/callback.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{ name: "internal-auth-test-bindings", setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `export const env = { AUTH_URL: ${JSON.stringify(authOrigin)} };` }));
    build.onResolve({ filter: /^(emdash\/|@emdash-cms\/auth)/ }, (args) => ({ path: import.meta.resolve(args.path), external: true }));
  }}],
});
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

test("auth avatar URLs match the normalized email keys used by auth storage", async () => {
  const hash = createHash("sha256").update("user@example.org").digest("hex");
  assert.equal(await getInternalAvatarUrl(" User@Example.ORG ", authOrigin), `${authOrigin}/avatar/${hash}`);
});

for (const scenario of ["new", "linked", "auto-linked", "disabled"]) {
  test(`internal login uses the auth avatar for a ${scenario} account`, async (t) => {
    const db = new Kysely({ dialect: createDialect({ url: ":memory:" }) });
    try {
      await runMigrations(db);
      await db.insertInto("options").values({ name: "emdash:setup_complete", value: "true" }).execute();
      const adapter = createKyselyAdapter(db);
      let existing;
      if (scenario !== "new") {
        const bootstrap = await adapter.createUser({ email: "admin@example.org", role: 50 });
        await adapter.createOAuthAccount({ provider: "internal", providerAccountId: "bootstrap", userId: bootstrap.id });
        existing = await adapter.createUser({ email: "user@example.org", name: "Existing User", role: 40, avatarUrl: "https://old.example.org/avatar.png" });
        if (scenario !== "auto-linked") {
          await adapter.createOAuthAccount({ provider: "internal", providerAccountId: "external-id", userId: existing.id });
        }
        if (scenario === "disabled") await adapter.updateUser(existing.id, { disabled: true });
      }
      const storage = getAuthProviderStorage(db, "internal", { states: { indexes: ["expiresAt"] } });
      const redirectUri = "https://site.example.org/_emdash/api/auth/callback";
      await storage.states.put("state", { verifier: "verifier", redirectUri, expiresAt: new Date(Date.now() + 60_000).toISOString() });
      t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(String(input), `${authOrigin}/auth/emdash/token`);
        assert.deepEqual(JSON.parse(init.body), { code: "code", code_verifier: "verifier", redirect_uri: redirectUri });
        return Response.json({ user: { id: "external-id", email: "user@example.org", name: "Auth User" } });
      });
      const sessionValues = new Map();
      const response = await GET({
        locals: { emdash: { db } }, url: new URL(`${redirectUri}?code=code&state=state`),
        session: { set(key, value) { sessionValues.set(key, value); } },
        redirect(location) { return new Response(null, { status: 302, headers: { Location: location } }); },
      });
      assert.equal(await storage.states.get("state"), null);
      const user = await adapter.getUserByEmail("user@example.org");
      assert.equal(user.role, scenario === "new" ? 50 : 40);
      if (scenario === "disabled") {
        assert.equal(response.headers.get("Location"), "/?auth_error=account_disabled");
        assert.equal(user.avatarUrl, existing.avatarUrl);
        assert.equal(sessionValues.size, 0);
      } else {
        assert.equal(response.headers.get("Location"), "/_emdash/admin");
        assert.equal(user.avatarUrl, await getInternalAvatarUrl("user@example.org", authOrigin));
        assert.equal(sessionValues.get("user").id, user.id);
        if (existing) assert.equal(user.id, existing.id);
      }
    } finally { await db.destroy(); }
  });
}
