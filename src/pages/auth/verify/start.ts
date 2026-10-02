import type { APIRoute } from "astro";
import { CALLBACK_URL, CLIENT_ID, COOKIE_OPTIONS, FLOW_COOKIE, VERIFY_ORIGIN, challenge, randomToken, safeReturnTo } from "../../../lib/verify-client";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
	const verifier = randomToken();
	const state = randomToken();
	const flow = { verifier, state, returnTo: safeReturnTo(url.searchParams.get("returnTo")), created: Date.now() };
	cookies.set(FLOW_COOKIE, JSON.stringify(flow), { ...COOKIE_OPTIONS, maxAge: 20 * 60 });
	const target = new URL("/auth/authorize", VERIFY_ORIGIN);
	target.search = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, state,
		code_challenge: await challenge(verifier), code_challenge_method: "S256" }).toString();
	const response = redirect(target.href, 302);
	response.headers.set("Cache-Control", "private, no-store");
	response.headers.set("Referrer-Policy", "no-referrer");
	return response;
};
