import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { Role } from "@emdash-cms/auth";
import { readResetConfirmation, resetAuthorization, resetSiteContent } from "../../lib/seed-reset.mjs";
import { ensureSubscriptionTables } from "../../lib/news-subscriptions";

export const prerender = false;
const reply = (status: number, message: string) => Response.json({ message }, {
	status, headers: { "Cache-Control": "private, no-store" },
});

export const GET: APIRoute = ({ locals }) => locals.user?.role === Role.ADMIN
	? reply(200, "初期化できます。") : reply(403, "管理者だけが実行できます。");

export const POST: APIRoute = async ({ request, locals, cache }) => {
	const denied = resetAuthorization(request, locals.user);
	if (denied) return reply(denied, "管理者権限と同一サイトからの操作が必要です。");
	if (!await readResetConfirmation(request)) return reply(400, "確認欄に「初期化」と入力してください。");

	const owner = crypto.randomUUID();
	let acquired = false;
	try {
		await env.DB.prepare("CREATE TABLE IF NOT EXISTS site_seed_lock (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)").run();
		const lock = await env.DB.prepare(`INSERT INTO site_seed_lock (id, owner, expires_at) VALUES (1, ?, ?)
			ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at WHERE site_seed_lock.expires_at < ?`)
			.bind(owner, Date.now() + 300_000, Date.now()).run();
		if (!lock.meta.changes) return reply(409, "初期化が実行中です。完了するまでお待ちください。");
		acquired = true;
		const { tags } = await resetSiteContent(locals.emdash.db, async () => {
			await ensureSubscriptionTables(env.DB);
			await env.DB.prepare("DELETE FROM news_deliveries").run();
		});
		locals.emdash.invalidateUrlPatternCache();
		if (cache.enabled) await cache.invalidate({ tags });
		console.info("[site-settings] Seed reset completed", { administrator: locals.user!.id });
		return reply(200, "初期化が完了しました。ホーム・固定ページ・お知らせをseedの状態に戻しました。");
	} catch (error) {
		console.error("[site-settings] Seed reset failed", error);
		return reply(500, "初期化を完了できませんでした。変更が一部反映されている可能性があります。管理者がログを確認してから再実行してください。");
	} finally {
		if (acquired) {
			try { await env.DB.prepare("DELETE FROM site_seed_lock WHERE id=1 AND owner=?").bind(owner).run(); }
			catch (error) { console.error("[site-settings] Seed lock release failed", error); }
		}
	}
};
