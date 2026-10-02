import type { APIRoute } from "astro";
import { getEmDashCollection } from "emdash";

const SUPPORTED_COLLECTIONS = new Set(["news", "pages"]);

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function entryPath(collection: "news" | "pages", slug: string): string {
	if (collection === "news") return `/newsroom/${slug}`;
	return slug === "home" ? "/" : `/${slug}`;
}

export const GET: APIRoute = async ({ params, url, cache }) => {
	const collection = params.collection;
	if (!collection || !SUPPORTED_COLLECTIONS.has(collection)) {
		return new Response("Not found", { status: 404 });
	}

	const typedCollection = collection as "news" | "pages";
	const { entries, error, cacheHint } = await getEmDashCollection(typedCollection, {
		status: "published",
		limit: 100,
	});
	if (error) throw error;
	cache.set(cacheHint);

	const urls = entries
		.filter((entry) => {
			const data = entry.data as typeof entry.data & {
				campus_only?: boolean;
				seo?: { noIndex?: boolean };
			};
			return !data.campus_only && !data.seo?.noIndex;
		})
		.map((entry) => {
			const location = new URL(entryPath(typedCollection, entry.id), url.origin).href;
			return [
				"  <url>",
				`    <loc>${escapeXml(location)}</loc>`,
				`    <lastmod>${entry.data.updatedAt.toISOString()}</lastmod>`,
				"  </url>",
			].join("\n");
		})
		.join("\n");

	return new Response(
		[
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
			urls,
			"</urlset>",
		].join("\n"),
		{
			headers: { "Content-Type": "application/xml; charset=utf-8" },
		},
	);
};
