import type { APIRoute } from "astro";
import { documentBytes } from "../../../lib/document-files";

export const prerender = false;

// /docs and its descendants are authenticated on every request by middleware.
export const GET: APIRoute = ({ params, cache }) => {
	cache.set(false);
	const headers = new Headers({
		"Cache-Control": "private, no-store",
		"X-Robots-Tag": "noindex, nofollow",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "no-referrer",
	});
	const slug = params.slug ?? "";
	const bytes = documentBytes(slug);
	if (!bytes) return new Response("PDFが見つかりません。", { status: 404, headers });
	headers.set("Content-Type", "application/pdf");
	headers.set("Content-Disposition", `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(`${slug}.pdf`)}`);
	headers.set("Content-Length", String(bytes.byteLength));
	return new Response(bytes, { headers });
};
