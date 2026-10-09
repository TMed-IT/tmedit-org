import { getEmDashCollection, getTerm } from "emdash";
import type { AstroCookies } from "astro";
import { isCampusRequest } from "./campus-access";

export function categoryHref(slug: string): string {
	return `/${encodeURIComponent(slug)}`;
}

/** Query this term only; descendants are navigation links, not extra page filters. */
export async function getCategoryArchive(slug: string, cookies: AstroCookies, locale?: string) {
	const category = await getTerm("category", slug, { locale, includeCounts: false });
	if (!category) return null;
	const { entries, error, cacheHint } = await getEmDashCollection("pages", {
		status: "published",
		locale: category.locale,
		where: { category: category.slug },
		orderBy: { title: "asc" },
	});
	if (error) throw error;
	const campusRequest = await isCampusRequest(cookies);
	return {
		category,
		pages: campusRequest ? entries : entries.filter((page) => !page.data.campus_only),
		cacheHint,
	};
}
