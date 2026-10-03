import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import config from "../astro.config.mjs";
import { createDialect } from "emdash/db/sqlite";
import { runMigrations } from "emdash/db";
import { applySeed } from "emdash/seed";
import { resetSiteContent } from "../src/lib/seed-reset.mjs";
import { permissionErrorMessage } from "../src/plugins/site-settings/messages.mjs";
import { resetOptions } from "../src/plugins/site-settings/reset-options.mjs";
import seed from "../seed/seed.json" with { type: "json" };

const require = createRequire(import.meta.resolve("emdash/db"));
const { Kysely, CompiledQuery } = require("kysely");
const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
globalThis.__seedTestEnv = {};
const { outputFiles } = await build({
  entryPoints: ["src/plugins/site-settings/seed.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
  packages: "external",
  plugins: [{ name: "seed-test-bindings", setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "bindings", namespace: "test" }));
    build.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const env = globalThis.__seedTestEnv;" }));
    build.onResolve({ filter: /seed-reset\.mjs$/ }, () => ({ path: new URL("../src/lib/seed-reset.mjs", import.meta.url).href, external: true }));
    build.onResolve({ filter: /^@emdash-cms\/auth$/ }, () => ({ path: import.meta.resolve("@emdash-cms/auth"), external: true }));
  }}],
});
const route = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

async function database() {
  const db = new Kysely({ dialect: createDialect({ url: ":memory:" }) });
  await runMigrations(db);
  await applySeed(db, seed, { includeContent: true });
  return db;
}
function d1(db) {
  return {
    prepare(query) {
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async run() {
          const result = await db.executeQuery(CompiledQuery.raw(query, parameters));
          return { meta: { changes: Number(result.numAffectedRows ?? 0) } };
        },
      };
    },
    batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}
const allTargets = resetOptions.map((option) => option.id);
function context(db, overrides = {}, targets = allTargets) {
  return {
    request: new Request("https://tmedit.org/_emdash/api/site-settings/seed", {
      method: "POST", headers: { Origin: "https://tmedit.org", "Content-Type": "application/json", "X-EmDash-Request": "1" },
      body: JSON.stringify({ confirmation: "初期化", targets }),
    }),
    locals: { user: { id: "admin", role: 50 }, emdash: { db, invalidateUrlPatternCache() {} } },
    cache: { enabled: false },
    ...overrides,
  };
}

test("the seed endpoint is explicitly registered under the protected EmDash API path", async () => {
  const integration = config.integrations.find((integration) => integration.name === "site-settings-api");
  assert.ok(integration, "Astro ignores _emdash directories unless the route is injected");
  const routes = [];
  await integration.hooks["astro:config:setup"]({ injectRoute: (route) => routes.push(route) });
  const route = routes.find((route) => route.pattern === "/_emdash/api/site-settings/seed");
  assert.ok(route);
  assert.equal(fileURLToPath(route.entrypoint), fileURLToPath(new URL("../src/plugins/site-settings/seed.ts", import.meta.url)));
  assert.equal(route.prerender, false);
});

test("reset API rejects non-admins, foreign origins, missing header, and invalid confirmation before DB access", async () => {
  for (const role of [undefined, 10, 40]) {
    const ctx = context(null);
    ctx.locals.user = role === undefined ? undefined : { role };
    assert.equal((await route.POST(ctx)).status, 403);
  }
  for (const headers of [
    { Origin: "https://other.example", "Content-Type": "application/json", "X-EmDash-Request": "1" },
    { Origin: "https://tmedit.org", "Content-Type": "application/json" },
  ]) {
    const request = new Request("https://tmedit.org/_emdash/api/site-settings/seed", { method: "POST", headers, body: '{"confirmation":"初期化"}' });
    assert.equal((await route.POST(context(null, { request }))).status, 403);
  }
  for (const body of ['{"confirmation":"yes"}', 'null', 'bad json', JSON.stringify({ confirmation: "初期化", extra: "x".repeat(1024) })]) {
    const ctx = context(null);
    ctx.request = new Request(ctx.request, { body });
    assert.equal((await route.POST(ctx)).status, 400);
  }
  assert.equal((await route.GET({ locals: {} })).status, 403);
  assert.equal((await route.GET({ locals: { user: { role: 50 } } })).status, 200);
});

test("missing routes and server failures are not reported as insufficient administrator permissions", () => {
  for (const status of [404, 500, 503]) {
    assert.doesNotMatch(permissionErrorMessage(status), /管理者だけ/);
    assert.match(permissionErrorMessage(status), new RegExp(`HTTP ${status}`));
  }
  assert.match(permissionErrorMessage(401), /ログイン/);
  assert.match(permissionErrorMessage(403), /管理者だけ/);
});

test("reset requires an explicit, nonempty selection of known items", async () => {
  for (const targets of [undefined, null, [], ["unknown"], ["users"], ["home", "home"], ["home", 1]]) {
    const ctx = context(null);
    ctx.request = new Request(ctx.request, { body: JSON.stringify({ confirmation: "初期化", targets }) });
    assert.equal((await route.POST(ctx)).status, 400);
  }
});

async function snapshot(db, target) {
  if (target === "settings") return db.selectFrom("options").selectAll().where("name", "like", "site:%").orderBy("name").execute();
  if (target === "menus") return {
    menus: await db.selectFrom("_emdash_menus").selectAll().orderBy("id").execute(),
    items: await db.selectFrom("_emdash_menu_items").selectAll().orderBy("id").execute(),
  };
  const collection = await db.selectFrom("_emdash_collections").selectAll().where("slug", "=", target).executeTakeFirst();
  return {
    collection,
    fields: await db.selectFrom("_emdash_fields").selectAll().where("collection_id", "=", collection.id).orderBy("id").execute(),
    entries: await db.selectFrom(`ec_${target}`).selectAll().orderBy("id").execute(),
    revisions: await db.selectFrom("revisions").selectAll().where("collection", "=", target).orderBy("id").execute(),
  };
}

for (const target of allTargets) {
  test(`resetting ${target} preserves every unselected item and only clears deliveries for news`, async () => {
    const db = await database();
    try {
      await db.updateTable("ec_home").set({ hero: JSON.stringify({ headline: "Customized home" }) }).execute();
      await db.updateTable("ec_pages").set({ title: "Customized page" }).execute();
      await db.updateTable("_emdash_menus").set({ label: "Customized menu" }).execute();
      await applySeed(db, { version: "1", defaultLocale: "ja", settings: { title: "Customized title", tagline: "Customized tagline" }, content: {
        news: [{ id: "custom-news", slug: "custom-news", status: "draft", data: { title: "Customized news" } }],
      } }, { includeContent: true, onConflict: "update" });
      await db.schema.createTable("news_deliveries").addColumn("id", "integer", col => col.primaryKey()).execute();
      await db.insertInto("news_deliveries").values({ id: 1 }).execute();
      const before = Object.fromEntries(await Promise.all(allTargets.map(async (id) => [id, await snapshot(db, id)])));
      globalThis.__seedTestEnv.DB = d1(db);
      const tags = [];
      const response = await route.POST(context(db, { cache: { enabled: true, async invalidate(value) { tags.push(...value.tags); } } }, [target]));
      assert.equal(response.status, 200);
      for (const other of allTargets.filter(id => id !== target)) {
        assert.deepEqual(await snapshot(db, other), before[other], `${other} must remain unchanged`);
      }
      assert.notDeepEqual(await snapshot(db, target), before[target]);
      assert.equal((await db.selectFrom("news_deliveries").selectAll().execute()).length, target === "news" ? 0 : 1);
      if (target === "menus") assert.ok(tags.includes("emdash:menu:primary"));
      if (target === "settings") assert.ok(tags.includes("emdash:settings"));
    } finally { await db.destroy(); }
  });
}

test("multiple selected items reset together and leave the remaining content untouched", async () => {
  const db = await database();
  try {
    await db.updateTable("ec_home").set({ hero: JSON.stringify({ headline: "Customized home" }) }).execute();
    await db.updateTable("ec_pages").set({ title: "Customized page" }).execute();
    const pages = await snapshot(db, "pages");
    const news = await snapshot(db, "news");
    const settings = await snapshot(db, "settings");
    await resetSiteContent(db, ["home", "menus"]);
    assert.notEqual((await db.selectFrom("ec_home").select("hero").executeTakeFirst()).hero, JSON.stringify({ headline: "Customized home" }));
    assert.deepEqual(await snapshot(db, "pages"), pages);
    assert.deepEqual(await snapshot(db, "news"), news);
    assert.deepEqual(await snapshot(db, "settings"), settings);
  } finally { await db.destroy(); }
});

test("seed reset replaces content, drafts, revisions and menus while preserving identity and unrelated data; rerunning is safe", async () => {
  const db = await database();
  try {
    await db.insertInto("users").values({ id: "admin", email: "admin@example.org", role: 50 }).execute();
    await db.insertInto("options").values({ name: "auth.test", value: '"keep"' }).execute();
    await applySeed(db, { ...seed, collections: [{ slug: "extra", label: "Extra", fields: [{ slug: "title", type: "text", label: "Title" }] }], content: { extra: [{ id: "keep", slug: "keep", status: "published", data: { title: "keep" } }] }, menus: [] }, { includeContent: true });
    await db.updateTable("ec_home").set({ hero: JSON.stringify({ headline: "Changed" }) }).execute();
    await db.insertInto("revisions").values({ id: "revision", collection: "home", entry_id: "old", data: "{}" }).execute();
    await db.insertInto("_emdash_seo").values({ collection: "home", content_id: "old", seo_title: "old" }).execute();
    globalThis.__seedTestEnv.DB = d1(db);
    await db.schema.createTable("news_subscribers").addColumn("email", "text", col => col.primaryKey()).execute();
    await db.insertInto("news_subscribers").values({ email: "subscriber@example.org" }).execute();
    await db.schema.createTable("news_deliveries").addColumn("id", "integer", col => col.primaryKey()).execute();
    await db.insertInto("news_deliveries").values({ id: 1 }).execute();
    const oldIds = (await db.selectFrom("ec_home").select("id").execute()).map(row => row.id);
    const tags = [];
    const ctx = context(db, { cache: { enabled: true, async invalidate(value) { tags.push(...value.tags); } } });
    assert.equal((await route.POST(ctx)).status, 200);
    assert.ok(tags.includes(oldIds[0]));
    assert.equal((await db.selectFrom("ec_home").selectAll().execute()).length, 1);
    assert.notEqual((await db.selectFrom("ec_home").select("hero").executeTakeFirst()).hero, JSON.stringify({ headline: "Changed" }));
    assert.equal((await db.selectFrom("ec_pages").selectAll().execute()).length, 2);
    assert.equal((await db.selectFrom("ec_news").selectAll().execute()).length, 0);
    assert.equal((await db.selectFrom("_emdash_menus").selectAll().execute()).length, 4);
    assert.equal((await db.selectFrom("revisions").selectAll().where("id", "=", "revision").execute()).length, 0);
    assert.equal((await db.selectFrom("_emdash_seo").selectAll().execute()).length, 0);
    assert.equal((await db.selectFrom("news_deliveries").selectAll().execute()).length, 0);
    assert.equal((await db.selectFrom("news_subscribers").selectAll().execute()).length, 1);
    assert.equal((await db.selectFrom("users").select("role").executeTakeFirst()).role, 50);
    assert.equal((await db.selectFrom("options").select("value").where("name", "=", "auth.test").executeTakeFirst()).value, '"keep"');
    assert.equal((await db.selectFrom("ec_extra").select("title").executeTakeFirst()).title, "keep");
    assert.ok((await db.selectFrom("ec_pages").select("locale").execute()).every(row => row.locale === "ja"));
    assert.equal((await route.POST(context(db))).status, 200);
    assert.equal((await db.selectFrom("site_seed_lock").selectAll().execute()).length, 0);
  } finally { await db.destroy(); }
});

test("related collections prevent reset before any content or delivery mutation", async () => {
  const db = await database();
  try {
    await db.insertInto("_emdash_relations").values({ id: "relation", slug: "linked", parent_collection: "home", child_collection: "pages", parent_label: "Home", child_label: "Page" }).execute();
    let mutated = false;
    await assert.rejects(resetSiteContent(db, ["home"], async () => { mutated = true; }), /関連/);
    assert.equal(mutated, false);
    assert.equal((await db.selectFrom("ec_home").selectAll().execute()).length, 1);
  } finally { await db.destroy(); }
});

test("an existing reset lock rejects duplicate execution without deleting content", async () => {
  const db = await database();
  try {
    globalThis.__seedTestEnv.DB = d1(db);
    await db.schema.createTable("site_seed_lock").addColumn("id", "integer", col => col.primaryKey()).addColumn("owner", "text").addColumn("expires_at", "integer").execute();
    await db.insertInto("site_seed_lock").values({ id: 1, owner: "other", expires_at: Date.now() + 300_000 }).execute();
    assert.equal((await route.POST(context(db))).status, 409);
    assert.equal((await db.selectFrom("ec_home").selectAll().execute()).length, 1);
    assert.equal((await db.selectFrom("site_seed_lock").select("owner").executeTakeFirst()).owner, "other");
  } finally { await db.destroy(); }
});
