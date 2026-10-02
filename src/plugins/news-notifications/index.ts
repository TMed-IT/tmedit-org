import { env } from "cloudflare:workers";
import { definePlugin } from "emdash";
import { ensureSubscriptionTables } from "../../lib/news-subscriptions";

export function createPlugin() {
	return definePlugin({
		id: "news-notifications",
		version: "1.0.0",
		capabilities: ["content:read"],
		hooks: {
			"content:afterPublish": {
				handler: async ({ collection, content }, ctx) => {
					if (collection !== "news") return;
					const data = content.data;
					if (!data || typeof data !== "object") return;
					const fields = data as Record<string, unknown>;
					if (typeof content.id !== "string" || typeof content.slug !== "string") return;
					const campusOnly = fields.campus_only === true;
					const title = campusOnly
						? "学内限定のお知らせ"
						: String(fields.title ?? "新しいお知らせ").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
					await ensureSubscriptionTables(env.DB);
					const result = await env.DB.prepare(`
						INSERT OR IGNORE INTO news_deliveries
							(news_id, email, title, slug, campus_only, created_at, next_attempt_at)
						SELECT ?, email, ?, ?, ?, ?, ? FROM news_subscribers WHERE status = 'active'
					`).bind(content.id, title, content.slug, campusOnly ? 1 : 0, Date.now(), Date.now()).run();
					ctx.log.info("Queued news notifications", { newsId: content.id, count: result.meta.changes });
				},
			},
		},
	});
}
