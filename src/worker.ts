// Keep EmDash's scheduler and drain the bounded news-email outbox on each tick.
import emdashWorker from "@emdash-cms/cloudflare/worker";
import { sendPendingNews } from "./lib/news-subscriptions";

export { PluginBridge } from "@emdash-cms/cloudflare/worker";

export default {
	...emdashWorker,
	scheduled(controller, env, ctx) {
		emdashWorker.scheduled(controller, env, ctx);
		ctx.waitUntil(sendPendingNews(env).catch((error) => {
			console.error("[news-subscriptions] Queue processing failed", error);
		}));
	},
} satisfies ExportedHandler<Env>;
