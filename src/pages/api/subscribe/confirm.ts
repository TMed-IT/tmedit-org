import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { isCampusRequest } from "../../../lib/campus-access";
import { ensureSubscriptionTables, hashToken, noStore, redirectToNewsroom, sameOrigin, validToken } from "../../../lib/news-subscriptions";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
	if (!(await isCampusRequest(cookies))) return noStore(new Response("登録には在籍確認が必要です。お知らせページから確認してください。", { status: 403 }));
	if (!sameOrigin(request)) return noStore(new Response("Invalid origin", { status: 403 }));
	const form = await request.formData();
	const token = String(form.get("token") ?? "");
	if (!validToken(token)) return redirectToNewsroom(request, "invalid");

	await ensureSubscriptionTables(env.DB);
	const result = await env.DB.prepare(`
		UPDATE news_subscribers SET status = 'active', confirmation_hash = NULL, confirmed_at = ?
		WHERE status = 'pending' AND confirmation_hash = ? AND requested_at > ?
	`).bind(Date.now(), await hashToken(token), Date.now() - 24 * 60 * 60_000).run();
	return redirectToNewsroom(request, result.meta.changes === 1 ? "active" : "invalid");
};
