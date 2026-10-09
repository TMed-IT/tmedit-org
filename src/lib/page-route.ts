import { getEmDashEntry } from "emdash";
import { categoryHref } from "./category-archive";

export function categoryPageHref(categorySlug: string, pageSlug: string): string {
	return `${categoryHref(categorySlug)}/${encodeURIComponent(pageSlug)}`;
}

/** CMS previews and menu links enter via /{slug}; use a stable category order. */
export function pageHref(slug: string, categories: { slug: string }[] = []): string {
	const category = categories.toSorted((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)[0];
	return category ? categoryPageHref(category.slug, slug) : `/${encodeURIComponent(slug)}`;
}

export async function getPageRoute(slug: string, categorySlug?: string, locale?: string) {
	const { entry: page, error, cacheHint } = await getEmDashEntry("pages", slug, { locale });
	if (error) {
		if (error instanceof Error && error.name === "LiveEntryNotFoundError") return null;
		throw error;
	}
	if (!page) return null;
	const categories = page.data.terms?.category ?? [];
	const category = categories.find((term) => term.slug === categorySlug);
	// A page may be reached only through a category directly assigned to it.
	if (categorySlug !== undefined && !category) return null;
	return { page, category, cacheHint };
}
