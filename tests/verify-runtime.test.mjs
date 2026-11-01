import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(createRequire(import.meta.url).resolve("wrangler"));
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const { outputFiles } = await build({
	stdin: { contents: `
		import { verifyPost, VerifyUnavailable } from './src/lib/verify-client';
		export default { async fetch(request) {
			const path = new URL(request.url).pathname;
			try {
				return Response.json(await verifyPost(path, { token: 'test-token', code: 'test-code' }, { get: async () => 'test-secret' }));
			} catch (error) {
				return new Response(null, { status: error instanceof VerifyUnavailable ? 503 : 500 });
			}
		} };`, resolveDir: process.cwd() },
	bundle: true, write: false, format: "esm", platform: "browser",
});

test("Workers can exchange and introspect tokens without following redirects or forwarding credentials", async () => {
	const requests = [];
	let redirect = false;
	const mf = new Miniflare(convertV4MiniflareOptions({
		modules: true, compatibilityDate: "2026-09-24", script: outputFiles[0].text,
		outboundService: async (request) => {
			requests.push({ url: request.url, method: request.method, body: await request.json() });
			if (redirect) return new Response(null, { status: 307, headers: { Location: "https://other.example/credentials" } });
			return Response.json(request.url.endsWith("/auth/token")
				? { access_token: "test-token", token_type: "Bearer", expires_in: 3600 }
				: { active: true });
		},
	}));
	try {
		for (const path of ["/auth/token", "/auth/introspect"]) {
			const response = await mf.dispatchFetch(`https://site.example${path}`);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), path.endsWith("token")
				? { access_token: "test-token", token_type: "Bearer", expires_in: 3600 }
				: { active: true });
		}
		redirect = true;
		for (const path of ["/auth/token", "/auth/introspect"]) {
			assert.equal((await mf.dispatchFetch(`https://site.example${path}`)).status, 503);
		}
		assert.equal(requests.length, 4, "Redirects must not cause another outbound request");
		for (const request of requests) {
			assert.equal(new URL(request.url).origin, "https://verify.tmedit.org");
			assert.equal(request.method, "POST");
			assert.equal(request.body.client_id, "tmedit");
			assert.equal(request.body.client_secret, "test-secret");
		}
	} finally { await mf.dispose(); }
});
