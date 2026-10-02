import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { ensureSubscriptionTables, redirectToNewsroom, validToken } from "../../../lib/news-subscriptions";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const token = url.searchParams.get("token") ?? String((await request.formData()).get("token") ?? "");
	if (!validToken(token)) return redirectToNewsroom(request, "invalid");

	await ensureSubscriptionTables(env.DB);
	const subscriber = await env.DB.prepare("SELECT email FROM news_subscribers WHERE unsubscribe_token = ?")
		.bind(token).first<{ email: string }>();
	if (subscriber) {
		await env.DB.batch([
			env.DB.prepare("DELETE FROM news_deliveries WHERE email = ? AND sent_at IS NULL").bind(subscriber.email),
			env.DB.prepare("DELETE FROM news_subscribers WHERE email = ? AND unsubscribe_token = ?").bind(subscriber.email, token),
		]);
	}
	return redirectToNewsroom(request, "removed");
};
