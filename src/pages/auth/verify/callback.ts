import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { CALLBACK_URL, COOKIE_OPTIONS, FLOW_COOKIE, TOKEN_COOKIE, VerifyUnavailable, safeReturnTo, verifyPost } from "../../../lib/verify-client";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
	const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
	let flow;
	try { flow = JSON.parse(cookies.get(FLOW_COOKIE)?.value ?? "null"); } catch { flow = null; }
	const code = url.searchParams.get("code");
	if (!flow || typeof flow.state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(flow.state) || flow.state !== url.searchParams.get("state") ||
		!code || !/^[A-Za-z0-9_-]{43}$/.test(code) || typeof flow.verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier) ||
		typeof flow.created !== "number" || flow.created > Date.now() || Date.now() - flow.created > 20 * 60_000) {
		return new Response("確認リンクが無効か、有効期限が切れています。お知らせページから確認をやり直してください。", { status: 400, headers });
	}
	const result = await verifyPost("/auth/token", { code, code_verifier: flow.verifier, redirect_uri: CALLBACK_URL }, env.VERIFY_CLIENT_SECRET);
	if (typeof result.access_token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.access_token) || result.token_type !== "Bearer" ||
		typeof result.expires_in !== "number" || !Number.isInteger(result.expires_in) || result.expires_in <= 0 || result.expires_in > 90 * 24 * 60 * 60) {
		throw new VerifyUnavailable();
	}
	cookies.set(TOKEN_COOKIE, result.access_token, { ...COOKIE_OPTIONS, maxAge: result.expires_in });
	cookies.delete(FLOW_COOKIE, COOKIE_OPTIONS);
	const response = redirect(safeReturnTo(typeof flow.returnTo === "string" ? flow.returnTo : null), 302);
	for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
	return response;
};
