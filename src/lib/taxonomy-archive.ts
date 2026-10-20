import { getEmDashCollection, getTaxonomyDef, getTaxonomyTermsWithCacheHint, getTerm } from "emdash";
import type { AstroCookies } from "astro";
import { isCampusRequest } from "./campus-access";

export function taxonomyHref(name: string): string {
	return `/${encodeURIComponent(name)}`;
}

export function termHref(name: string, slug: string): string {
	return `${taxonomyHref(name)}/${encodeURIComponent(slug)}`;
}

/** Only taxonomies attached to pages have public routes on this site. */
export async function getPageTaxonomy(name: string, locale?: string) {
	const taxonomy = await getTaxonomyDef(name, { locale });
	return taxonomy?.collections.includes("pages") ? taxonomy : null;
}

export async function getTaxonomyIndex(name: string, locale?: string) {
	const taxonomy = await getPageTaxonomy(name, locale);
	if (!taxonomy) return null;
	const { data: terms, cacheHint } = await getTaxonomyTermsWithCacheHint(name, { locale, includeCounts: false });
	return { taxonomy, terms, cacheHint };
}

/** Terms are independent filters; descendants are not included in an archive. */
export async function getTaxonomyArchive(name: string, slug: string, cookies: AstroCookies, locale?: string) {
	const taxonomy = await getPageTaxonomy(name, locale);
	if (!taxonomy) return null;
	const term = await getTerm(name, slug, { locale, includeCounts: false });
	if (!term) return null;
	const { entries, error, cacheHint } = await getEmDashCollection("pages", {
		status: "published",
		locale: term.locale,
		where: { [name]: term.slug },
		orderBy: { title: "asc" },
	});
	if (error) throw error;
	const campusRequest = await isCampusRequest(cookies);
	return { taxonomy, term, pages: campusRequest ? entries : entries.filter((page) => !page.data.campus_only), cacheHint };
}
