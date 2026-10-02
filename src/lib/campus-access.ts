import { env } from "cloudflare:workers";
import type { AstroCookies } from "astro";
import { COOKIE_OPTIONS, TOKEN_COOKIE, tokenActive } from "./verify-client";

/** Validate on every request so revocation by verify takes effect immediately. */
export async function isCampusRequest(cookies: AstroCookies): Promise<boolean> {
	const token = cookies.get(TOKEN_COOKIE)?.value;
	if (!token) return false;
	const active = await tokenActive(token, env.VERIFY_CLIENT_SECRET);
	if (!active) cookies.delete(TOKEN_COOKIE, COOKIE_OPTIONS);
	return active;
}

/** Identity-dependent responses must not enter a shared cache. */
export function disableSharedCache(cache: { set(value: false): void }, headers: Headers): void {
	cache.set(false);
	headers.set("Cache-Control", "private, no-store");
}
