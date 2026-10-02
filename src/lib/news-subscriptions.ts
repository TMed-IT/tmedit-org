import type { D1Database, SendEmail } from "@cloudflare/workers-types";

const encoder = new TextEncoder();

export type SubscriptionDb = D1Database;

export async function ensureSubscriptionTables(db: SubscriptionDb): Promise<void> {
	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS news_subscribers (
			email TEXT PRIMARY KEY,
			status TEXT NOT NULL CHECK (status IN ('pending', 'active')),
			confirmation_hash TEXT,
			unsubscribe_token TEXT NOT NULL UNIQUE,
			requested_at INTEGER NOT NULL,
			confirmed_at INTEGER
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS news_deliveries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			news_id TEXT NOT NULL,
			email TEXT NOT NULL,
			title TEXT NOT NULL,
			slug TEXT NOT NULL,
			campus_only INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			next_attempt_at INTEGER NOT NULL,
			lease_until INTEGER,
			attempts INTEGER NOT NULL DEFAULT 0,
			sent_at INTEGER,
			UNIQUE (news_id, email)
		)`),
	]);
}

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizedEmail(value: string): string | null {
	const email = value.trim().toLowerCase();
	return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

export function validToken(value: string | null): value is string {
	return !!value && /^[a-f0-9]{64}$/.test(value);
}

export function sameOrigin(request: Request): boolean {
	const origin = request.headers.get("Origin");
	return !origin || origin === new URL(request.url).origin;
}

export function noStore(response: Response): Response {
	response.headers.set("Cache-Control", "private, no-store");
	response.headers.set("Referrer-Policy", "no-referrer");
	return response;
}

export function redirectToNewsroom(request: Request, status: string): Response {
	const url = new URL("/newsroom", request.url);
	url.searchParams.set("subscription", status);
	return new Response(null, {
		status: 303,
		headers: {
			Location: url.toString(),
			"Cache-Control": "private, no-store",
			"Referrer-Policy": "no-referrer",
		},
	});
}

type Delivery = {
	id: number;
	email: string;
	title: string;
	slug: string;
	campus_only: number;
	attempts: number;
	unsubscribe_token: string;
};

type DeliveryEnv = {
	DB: SubscriptionDb;
	EMAIL: SendEmail;
	EMAIL_FROM: string;
	EMAIL_FROM_NAME: string;
	SITE_URL: string;
};

/** Send a small bounded batch each cron tick; failed sends are retried, not lost. */
export async function sendPendingNews(env: DeliveryEnv): Promise<void> {
	await ensureSubscriptionTables(env.DB);
	const now = Date.now();
	const { results } = await env.DB.prepare(`
		SELECT d.id, d.email, d.title, d.slug, d.campus_only, d.attempts, s.unsubscribe_token
		FROM news_deliveries d
		JOIN news_subscribers s ON s.email = d.email AND s.status = 'active'
		WHERE d.sent_at IS NULL AND d.attempts < 5
			AND d.next_attempt_at <= ? AND (d.lease_until IS NULL OR d.lease_until <= ?)
		ORDER BY d.id LIMIT 20
	`).bind(now, now).all<Delivery>();

	for (const delivery of results) {
		const claimed = await env.DB.prepare(`
			UPDATE news_deliveries SET lease_until = ?, attempts = attempts + 1
			WHERE id = ? AND sent_at IS NULL AND (lease_until IS NULL OR lease_until <= ?)
				AND EXISTS (SELECT 1 FROM news_subscribers WHERE email = ? AND status = 'active')
		`).bind(Date.now() + 120_000, delivery.id, Date.now(), delivery.email).run();
		if (claimed.meta.changes !== 1) continue;

		const article = new URL(
			delivery.campus_only === 1 ? "/newsroom" : `/newsroom/${encodeURIComponent(delivery.slug)}`,
			env.SITE_URL,
		);
		const unsubscribe = new URL("/subscribe/unsubscribe", env.SITE_URL);
		unsubscribe.searchParams.set("token", delivery.unsubscribe_token);
		const campusOnly = delivery.campus_only === 1;
		const subject = campusOnly ? "【IT部】学内限定のお知らせ" : `【IT部】${delivery.title}`;
		const text = campusOnly
			? `学内限定のお知らせが公開されました。在籍確認を済ませたブラウザでご確認ください。\n${article}\n\n配信停止: ${unsubscribe}`
			: `新しいお知らせが公開されました。\n\n${delivery.title}\n${article}\n\n配信停止: ${unsubscribe}`;
		try {
			if (import.meta.env.DEV) {
				console.info("[news-subscriptions] Development delivery", { to: delivery.email, subject, text });
			} else {
				await env.EMAIL.send({
					to: delivery.email,
					from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
					subject,
					text,
					headers: { "List-Unsubscribe": `<${unsubscribe}>` },
				});
			}
			await env.DB.prepare("UPDATE news_deliveries SET sent_at = ?, lease_until = NULL WHERE id = ?")
				.bind(Date.now(), delivery.id).run();
		} catch (error) {
			console.error("[news-subscriptions] Delivery failed", { id: delivery.id, error });
			const backoff = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(5, delivery.attempts));
			await env.DB.prepare("UPDATE news_deliveries SET lease_until = NULL, next_attempt_at = ? WHERE id = ?")
				.bind(Date.now() + backoff, delivery.id).run();
		}
	}
	await env.DB.prepare("DELETE FROM news_deliveries WHERE created_at < ?")
		.bind(Date.now() - 90 * 24 * 60 * 60_000).run();
	await env.DB.prepare("DELETE FROM news_subscribers WHERE status = 'pending' AND requested_at < ?")
		.bind(Date.now() - 2 * 24 * 60 * 60_000).run();
}
