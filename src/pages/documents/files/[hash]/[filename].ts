import type { APIRoute } from "astro";
import { documentHref } from "../../../../lib/documents";
import { privateRedirect } from "../../../../lib/campus-access";

export const GET: APIRoute = ({ params, cache }) => {
	cache.set(false);
	const headers = new Headers({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
	const filename = params.filename ?? "";
	if (!/^[a-f0-9]{64}$/.test(params.hash ?? "") || !filename.endsWith(".pdf")) return new Response("文書が見つかりません。", { status: 404, headers });
	return privateRedirect(documentHref(filename.slice(0, -4)), headers);
};
