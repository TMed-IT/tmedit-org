import { isReservedRootSlug } from "./slug-policy.mjs";

/** A slug is one path segment; hierarchy separators belong to the route. */
export function hasSlugPathSeparator(value: unknown): boolean {
	return typeof value === "string" && /\/|%2f/i.test(value);
}

/** Validate writes without consuming the CMS handler's request body. */
export async function validateSlugRequest(request: Request, db?: Pick<D1Database, "prepare">): Promise<Response | null> {
	if (!["POST", "PUT", "PATCH"].includes(request.method)) return null;
	const path = new URL(request.url).pathname;
	const page = /^\/_emdash\/api\/content\/pages(?:\/|$)/.test(path);
	const news = /^\/_emdash\/api\/content\/news(?:\/|$)/.test(path);
	const term = /^\/_emdash\/api\/taxonomies\/[^/]+\/terms(?:\/|$)/.test(path);
	const definition = /^\/_emdash\/api\/taxonomies(?:\/[^/]+)?$/.test(path);
	if (!page && !news && !term && !definition) return null;
	if (!request.headers.get("Content-Type")?.startsWith("application/json")) return null;
	let body: Record<string, unknown>;
	try {
		const input: unknown = await request.clone().json();
		if (!input || typeof input !== "object" || Array.isArray(input)) return null;
		body = input as Record<string, unknown>;
	} catch { return null; }
	const slug = body.slug;
	if (hasSlugPathSeparator(slug) || (term && (slug === "." || slug === ".."))) return errorResponse(400, "VALIDATION_ERROR", "slugに /（スラッシュ）やパスの区切りは使用できません。");
	if (term || news) return null; // Terms may share a name with pages or other taxonomies' terms.
	if (definition) {
		const name = typeof body.name === "string" ? body.name : decodeURIComponent(path.split("/").pop() ?? "");
		// Definitions can later be attached to pages; reserve valid public names now.
		if (isReservedRootSlug(name)) return errorResponse(409, "CONFLICT", "この分類名はサイトの既存ルートで使われています。");
		if (db && await db.prepare("SELECT 1 AS present FROM ec_pages WHERE slug = ? AND deleted_at IS NULL LIMIT 1").bind(name).first()) return errorResponse(409, "CONFLICT", "この分類名はページのslugで使われています。");
		return null;
	}
	if (typeof slug !== "string" || !slug) return null;
	if (isReservedRootSlug(slug)) return errorResponse(409, "CONFLICT", "このslugはサイトの既存ルートで使われています。別のslugを指定してください。");
	if (db && await db.prepare("SELECT 1 AS present FROM _emdash_taxonomy_def_groups WHERE name = ? AND EXISTS (SELECT 1 FROM json_each(collections) WHERE value = 'pages') LIMIT 1").bind(slug).first()) return errorResponse(409, "CONFLICT", "このslugは分類名で使われています。別のslugを指定してください。");
	return null;
}

function errorResponse(status: number, code: string, message: string): Response {
	return Response.json({ success: false, error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store" } });
}
