import { decodeSlug, getEmDashCollection, getEmDashEntry, getRequestContext, runWithContext } from "emdash";
import type { AstroCookies } from "astro";
import { disableSharedCache, isCampusRequest, privateRedirect } from "./campus-access";
import { verificationPath } from "./verify-client";

export function documentHref(slug: string): string {
	return `/docs/${encodeURIComponent(slug)}`;
}

export async function getRule(slug: string | undefined, publishedOnly = false) {
	const decoded = decodeSlug(slug);
	if (!decoded || /[\/\\]/.test(decoded)) return { entry: null, cacheHint: {} };
	try {
		const load = () => getEmDashEntry("rules", decoded);
		const result = await (publishedOnly ? runWithContext({ ...getRequestContext(), editMode: false, preview: undefined }, load) : load());
		if (result.error) throw result.error;
		if (publishedOnly && (result.isPreview || result.entry?.data.status !== "published")) return { entry: null, cacheHint: result.cacheHint };
		return result;
	} catch (error) {
		if (error instanceof Error && error.name === "LiveEntryNotFoundError") return { entry: null, cacheHint: {} };
		throw error;
	}
}

export async function getRules(campus: boolean) {
	const entries = [];
	let cursor: string | undefined;
	const tags = new Set<string>();
	do {
		const result = await getEmDashCollection("rules", {
			status: "published", limit: 100, cursor,
			orderBy: { display_order: "asc" },
			...(campus ? {} : { where: { campus_only: "0" } }),
		});
		if (result.error) throw result.error;
		entries.push(...result.entries.filter((entry) => campus || !entry.data.campus_only));
		for (const tag of result.cacheHint.tags ?? []) tags.add(tag);
		cursor = result.nextCursor;
	} while (cursor);
	return { entries: entries.sort((a, b) => (a.data.display_order ?? 100) - (b.data.display_order ?? 100) || a.data.title.localeCompare(b.data.title, "ja")), cacheHint: { tags: [...tags] } };
}

export async function ruleAccess(campusOnly: boolean, context: { cookies: AstroCookies; url: URL; cache: { set(value: false): void } }, headers: Headers): Promise<Response | null> {
	disableSharedCache(context.cache, headers);
	if (!campusOnly) return null;
	headers.set("X-Robots-Tag", "noindex, nofollow");
	return await isCampusRequest(context.cookies) ? null : privateRedirect(verificationPath(context.url), headers);
}

export function ruleDate(date: Date): string {
	return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(date);
}
