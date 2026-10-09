import { isReservedRootSlug } from "./slug-policy.mjs";

/** A slug is one path segment; hierarchy separators belong to the route. */
export function hasSlugPathSeparator(value: unknown): boolean {
	return typeof value === "string" && /\/|%2f/i.test(value);
}

/** Reject explicit slug edits without consuming the CMS handler's request body. */
export async function validateSlugRequest(request: Request, db?: Pick<D1Database, "prepare">): Promise<Response | null> {
	if (!["POST", "PUT", "PATCH"].includes(request.method)) return null;
	const path = new URL(request.url).pathname;
	if (!/^\/_emdash\/api\/(?:content\/(?:pages|news)(?:\/|$)|taxonomies\/category\/terms(?:\/|$))/.test(path)) return null;
	if (!request.headers.get("Content-Type")?.startsWith("application/json")) return null;
	let body: unknown;
	try {
		body = await request.clone().json();
	} catch {
		// Leave malformed JSON to the CMS's normal validation response.
		return null;
	}
	const slug = body && typeof body === "object" && "slug" in body ? body.slug : undefined;
	if (hasSlugPathSeparator(slug)) return errorResponse(400, "VALIDATION_ERROR",
		"slugに /（スラッシュ）は使用できません。階層は親カテゴリーで指定してください。");
	if (typeof slug !== "string" || !slug) return null;
	const page = /^\/_emdash\/api\/content\/pages(?:\/|$)/.test(path);
	const category = /^\/_emdash\/api\/taxonomies\/category\/terms(?:\/|$)/.test(path);
	if (!page && !category) return null;
	if (isReservedRootSlug(slug)) return errorResponse(409, "CONFLICT", "このslugはサイトの既存ルートで使われています。別のslugを指定してください。");
	if (!db) return null;
	const query = page
		? "SELECT 1 AS present FROM taxonomies WHERE name = 'category' AND slug = ? LIMIT 1"
		: "SELECT 1 AS present FROM ec_pages WHERE slug = ? AND deleted_at IS NULL LIMIT 1";
	if (await db.prepare(query).bind(slug).first()) return errorResponse(409, "CONFLICT",
		`このslugは${page ? "カテゴリー" : "ページ"}で使われています。別のslugを指定してください。`);
	return null;
}

function errorResponse(status: number, code: string, message: string): Response {
	return Response.json({
		success: false,
		error: {
			code,
			message,
		},
	}, { status, headers: { "Cache-Control": "private, no-store" } });
}
