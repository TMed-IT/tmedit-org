import { readFile, writeFile } from "node:fs/promises";

const storeId = process.env.CLOUDFLARE_SECRETS_STORE_ID;
if (!storeId || !/^[a-f0-9]{32}$/i.test(storeId) || /^0+$/.test(storeId)) {
  throw new Error("Set CLOUDFLARE_SECRETS_STORE_ID to the existing verify Secrets Store ID before deploying.");
}
// Astro generates the configuration Wrangler uses for deployment during the build.
const path = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(await readFile(path, "utf8"));
const binding = config.secrets_store_secrets?.find(item => item.binding === "VERIFY_CLIENT_SECRET");
if (!binding || binding.secret_name !== "CLIENT_SECRET_MAIN") {
  throw new Error("The built Worker is missing the verify secret binding. Run pnpm build first.");
}
binding.store_id = storeId;
await writeFile(path, JSON.stringify(config, null, 2) + "\n");
console.info("Configured the verify Secrets Store binding.");
