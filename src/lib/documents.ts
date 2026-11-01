import type { MarkdownInstance } from "astro";
import manifest from "../generated/documents/manifest.json";

const modules = import.meta.glob<MarkdownInstance<Record<string, unknown>>>("../generated/documents/*.md", { eager: true });

export const documents = manifest.documents.map((document) => {
	const markdown = modules[`../generated/documents/${document.slug}.md`];
	if (!markdown) throw new Error(`Missing document source: ${document.slug}`);
	const headings = markdown.getHeadings();
	return {
		...document,
		title: headings.find((heading) => heading.depth === 1)?.text ?? document.slug,
		headings: headings.filter((heading) => heading.depth === 2),
		Content: markdown.Content,
	};
});
export const documentRelease = manifest;
export const documentPublishedDate = new Intl.DateTimeFormat("ja-JP", {
	year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo",
}).format(new Date(manifest.publishedAt));

export function documentHref(slug: string): string {
	return `/docs/${encodeURIComponent(slug)}`;
}

export function pdfSize(bytes: number): string {
	return `${Math.ceil(bytes / 1024)} KB`;
}
