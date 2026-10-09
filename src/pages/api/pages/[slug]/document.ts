import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { decodeSlug, getEmDashEntry } from "emdash";
import { disableSharedCache, isCampusRequest } from "../../../../lib/campus-access";

export const prerender = false;

/** A page attachment is served only while its page is visible to this visitor. */
export const GET: APIRoute = async ({ params, cookies, url, cache }) => {
	const headers = new Headers({
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "no-referrer",
		"X-Robots-Tag": "noindex, nofollow",
	});
	disableSharedCache(cache, headers);
	const unavailable = () => new Response("添付PDFが見つかりません。", { status: 404, headers });
	const slug = decodeSlug(params.slug);
	if (!slug) return unavailable();

	const { entry: page, error, cacheHint } = await getEmDashEntry("pages", slug);
	cache.set(cacheHint);
	cache.set(false);
	if (error) {
		if (error instanceof Error && error.name === "LiveEntryNotFoundError") return unavailable();
		throw error;
	}
	if (!page) return unavailable();
	if (page.data.campus_only && !(await isCampusRequest(cookies))) {
		return new Response("添付PDFの閲覧には在籍確認が必要です。ページから在籍確認を行ってください。", { status: 403, headers });
	}

	const file = page.data.document;
	if (!file?.id || (file.provider && file.provider !== "local")) return unavailable();
	// Read the current media record rather than trusting the reference's cached URL or MIME type.
	const media = await env.DB.prepare("SELECT filename, mime_type, storage_key, status FROM media WHERE id = ?")
		.bind(file.id).first<{ filename: string; mime_type: string; storage_key: string; status: string }>();
	if (!media || media.mime_type !== "application/pdf" || media.status !== "ready") return unavailable();
	const pdf = await env.MEDIA.get(media.storage_key);
	if (!pdf) return unavailable();
	const contentType = pdf.httpMetadata?.contentType;
	if (contentType && contentType.split(";", 1)[0].trim().toLowerCase() !== "application/pdf") return unavailable();

	const filename = encodeURIComponent(media.filename || "document.pdf").replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
	headers.set("Content-Type", "application/pdf");
	headers.set("Content-Disposition", `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="document.pdf"; filename*=UTF-8''${filename}`);
	// Native PDF viewers supply their own isolation; CSP sandbox can prevent them from opening.
	headers.set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
	if (pdf.size > 0) headers.set("Content-Length", String(pdf.size));
	return new Response(pdf.body, { headers });
};
