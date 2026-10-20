import { getEmDashEntry, getTaxonomyDefs } from "emdash";
import type { TaxonomyTerm } from "emdash";
import { getPageTaxonomy, termHref } from "./taxonomy-archive";

export type PageTerms = Record<string, TaxonomyTerm[]>;

export function taxonomyPageHref(name: string, termSlug: string, pageSlug: string): string {
	return `${termHref(name, termSlug)}/${encodeURIComponent(pageSlug)}`;
}

/** Stable ordering keeps previews, legacy aliases and sitemap URLs consistent. */
export function pageHref(slug: string, terms: Record<string, { slug: string }[]> = {}): string {
	for (const name of Object.keys(terms).toSorted()) {
		const term = terms[name]?.toSorted((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)[0];
		if (term) return taxonomyPageHref(name, term.slug, slug);
	}
	return `/${encodeURIComponent(slug)}`;
}

export async function getPageRoute(slug: string, filter?: { taxonomy: string; term: string }, locale?: string) {
	const taxonomy = filter ? await getPageTaxonomy(filter.taxonomy, locale) : undefined;
	if (filter && !taxonomy) return null;
	const { entry: page, error, cacheHint } = await getEmDashEntry("pages", slug, { locale });
	if (error) {
		if (error instanceof Error && error.name === "LiveEntryNotFoundError") return null;
		throw error;
	}
	if (!page) return null;
	const taxonomies = (await getTaxonomyDefs({ locale })).filter((def) => def.collections.includes("pages"));
	const terms: PageTerms = Object.fromEntries(taxonomies.map((def) => [def.name, page.data.terms?.[def.name] ?? []]));
	const term = filter ? terms[filter.taxonomy]?.find((entryTerm) => entryTerm.slug === filter.term) : undefined;
	if (filter && !term) return null;
	return { page, taxonomy, term, terms, taxonomies, cacheHint };
}
