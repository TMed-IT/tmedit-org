import manifest from "../generated/documents/manifest.json";

export const documents = manifest.documents;
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
