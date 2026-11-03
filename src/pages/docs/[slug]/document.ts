import type { APIRoute } from "astro";
import { getRule, ruleAccess } from "../../../lib/documents";

export const prerender = false;

export const GET: APIRoute = async (context) => {
	const { entry, cacheHint } = await getRule(context.params.slug, true);
	context.cache.set(cacheHint);
	context.cache.set(false);
	const headers = new Headers({
		"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow",
		"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
	});
	if (!entry) return new Response("文書が見つかりません。", { status: 404, headers });
	const denied = await ruleAccess(entry.data.campus_only, context, headers);
	if (denied) return denied;
	return Response.json({ slug: entry.id, title: entry.data.title, content: entry.data.content, updatedAt: entry.data.updatedAt.toISOString() }, { headers });
};
