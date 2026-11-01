import { documents } from "./documents";

// Explicit inlining keeps PDFs inside the server bundle, never public /_astro
// assets. This module is imported only by the authenticated download endpoint.
const pdfs = import.meta.glob<string>("../generated/documents/files/**/*.pdf", {
	query: "?inline", import: "default", eager: true,
});
const decoded = new Map<string, Uint8Array<ArrayBuffer>>();

export function documentBytes(slug: string): Uint8Array<ArrayBuffer> | null {
	const cached = decoded.get(slug);
	if (cached) return cached;
	const document = documents.find((entry) => entry.slug === slug);
	if (!document) return null;
	const dataUrl = pdfs[`../generated/documents/files/${document.pdfSha256}/${document.slug}.pdf`];
	if (!dataUrl) return null;
	const base64 = dataUrl.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/)?.[1];
	if (!base64) throw new Error(`Invalid private PDF: ${document.slug}`);
	const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
	decoded.set(slug, bytes);
	return bytes;
}
