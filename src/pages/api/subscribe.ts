import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { isCampusRequest } from "../../lib/campus-access";
import {
	ensureSubscriptionTables,
	hashToken,
	noStore,
	normalizedEmail,
	randomToken,
	redirectToNewsroom,
	sameOrigin,
} from "../../lib/news-subscriptions";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
	if (!(await isCampusRequest(cookies))) return noStore(new Response("登録には在籍確認が必要です。お知らせページから確認してください。", { status: 403 }));
	if (!sameOrigin(request)) return noStore(new Response("Invalid origin", { status: 403 }));
	if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
		return noStore(new Response("Invalid form", { status: 415 }));
	}
	const form = await request.formData();
	if (form.get("website")) return redirectToNewsroom(request, "pending");
	if (form.get("consent") !== "on") return redirectToNewsroom(request, "invalid");
	const email = normalizedEmail(String(form.get("email") ?? ""));
	if (!email) return redirectToNewsroom(request, "invalid");

	try {
		await ensureSubscriptionTables(env.DB);
		const existing = await env.DB.prepare("SELECT status, requested_at FROM news_subscribers WHERE email = ?")
			.bind(email).first<{ status: string; requested_at: number }>();
		if (existing?.status === "active" || (existing && Date.now() - existing.requested_at < 15 * 60_000)) {
			return redirectToNewsroom(request, "pending");
		}

		const token = randomToken();
		const tokenHash = await hashToken(token);
		const unsubscribeToken = randomToken();
		const result = await env.DB.prepare(`
			INSERT INTO news_subscribers (email, status, confirmation_hash, unsubscribe_token, requested_at)
			VALUES (?, 'pending', ?, ?, ?)
			ON CONFLICT(email) DO UPDATE SET
				confirmation_hash = excluded.confirmation_hash,
				requested_at = excluded.requested_at
			WHERE news_subscribers.status = 'pending' AND news_subscribers.requested_at < ?
		`).bind(email, tokenHash, unsubscribeToken, Date.now(), Date.now() - 15 * 60_000).run();
		if (result.meta.changes !== 1) return redirectToNewsroom(request, "pending");

		const confirmation = new URL("/subscribe/confirm", import.meta.env.DEV ? request.url : env.SITE_URL);
		confirmation.searchParams.set("token", token);
		if (import.meta.env.DEV) {
			console.info(`[news-subscriptions] Confirmation URL for ${email}: ${confirmation}`);
		} else {
			await env.EMAIL.send({
				to: email,
				from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
				subject: "【IT部】お知らせメールの購読確認",
				text: `お知らせメールの購読を希望した場合は、在籍確認を済ませたブラウザで次のページを開いて確定してください。\n${confirmation}\n\n心当たりがない場合、このメールは無視してください。`,
			});
		}
		return redirectToNewsroom(request, "pending");
	} catch (error) {
		console.error("[news-subscriptions] Registration failed", error);
		return redirectToNewsroom(request, "error");
	}
};
