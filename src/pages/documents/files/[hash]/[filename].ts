import type { APIRoute } from "astro";
import { documents } from "../../../../lib/documents";
import { privateRedirect } from "../../../../lib/campus-access";

export const GET: APIRoute = ({ params, cache }) => {
	cache.set(false);
	const headers = new Headers({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
	const document = documents.find((entry) => entry.pdfSha256 === params.hash && `${entry.slug}.pdf` === params.filename);
	return document ? privateRedirect(document.pdf, headers) : new Response("PDFが見つかりません。", { status: 404, headers });
};
