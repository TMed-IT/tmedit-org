import {
	minitype, h1, h2, h3, h4, p, li1, li2, li3, ol1, ol2, ol3,
	command, u, del, url, em, pt, physical, page, hbox, vspace,
	type Block, type InlineOrExtender, type CompositeFont, type BrowserFontData, type DocumentStyle,
	type ListMarkerFunction,
} from "@minitype/minitype";
import { ruleListNumbers } from "./rule-list-numbering";

export interface RulePdfDocument {
	slug: string;
	title: string;
	content: unknown[];
	updatedAt: string;
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const composite = (weight: "Regular" | "Bold" | "Italic" | "BoldItalic"): CompositeFont => ({
	default: { font: `ShipporiMincho-${weight.includes("Bold") ? "Bold" : "Regular"}`, scale: em(0.925) },
	latin: { font: `LibertinusSerif-${weight}` },
});

function inlineContent(block: RecordValue): InlineOrExtender[][] {
	const definitions = Array.isArray(block.markDefs) ? block.markDefs.map(record) : [];
	const lines: InlineOrExtender[][] = [[]];
	for (const value of Array.isArray(block.children) ? block.children : []) {
		const span = record(value);
		if (span._type !== "span") throw new Error("PDFに対応していないインライン要素があります。");
		const marks = Array.isArray(span.marks) ? span.marks.filter((mark): mark is string => typeof mark === "string") : [];
		for (const [index, line] of text(span.text).split("\n").entries()) {
			if (index) lines.push([]);
			let body: InlineOrExtender[] = [line];
			const weight = marks.includes("strong") ? marks.includes("em") ? "BoldItalic" : "Bold" : marks.includes("em") ? "Italic" : null;
			if (weight) body = [command(body, { style: { font: composite(weight) } })];
			if (marks.includes("underline")) body = [u(body)];
			if (marks.includes("strike-through") || marks.includes("strike")) body = [del(body)];
			for (const mark of marks) {
				const definition = definitions.find((definition) => definition._key === mark);
				const href = text(definition?.href);
				if (definition?._type === "link" && /^(?:https?:\/\/|mailto:|#)/i.test(href)) body = [url(href, body)];
			}
			lines[lines.length - 1].push(...body);
		}
	}
	return lines;
}

export function rulePdfBlocks(document: RulePdfDocument): Block[] {
	const numbers = ruleListNumbers(document.content);
	const body: Block[] = [vspace(pt(28)), { ...h1(document.title), unnumbered: true }];
	const titleDetails: InlineOrExtender[][] = [];
	let start = 0;
	while (start < document.content.length) {
		const block = record(document.content[start]);
		if (block._type !== "block" || block.listItem || (block.style && block.style !== "normal")) break;
		titleDetails.push(...inlineContent(block));
		start++;
	}
	if (titleDetails.length) body.push(p(titleDetails, { align: "right", indent: 0 }));
	for (const [offset, value] of document.content.slice(start).entries()) {
		const block = record(value);
		if (block._type === "code") {
			body.push(p(text(block.code), { pre: true, firstIndent: 0 }));
			continue;
		}
		if (block._type !== "block") throw new Error("PDFに対応していない本文の書式があります。");
		const inlines = inlineContent(block);
		if (block.listItem) {
			const level = typeof block.level === "number" && Number.isInteger(block.level) && block.level >= 1 ? Math.min(3, block.level) : 1;
			const make = (block.listItem === "number" ? [ol1, ol2, ol3] : [li1, li2, li3])[level - 1];
			body.push(make(inlines, block.listItem === "number" ? { marker: listMarker("ordered", [numbers.get(start + offset) ?? 1]) } : {}));
		} else if (/^h[1-6]$/.test(text(block.style))) {
			const make = [h1, h2, h3, h4][Math.min(4, Number(text(block.style).slice(1))) - 1];
			body.push({ ...make(inlines), unnumbered: true });
		} else {
			body.push(p(inlines, block.style === "blockquote" ? { indent: em(3) } : {}));
		}
	}
	return body;
}

const listMarker = (type: Parameters<ListMarkerFunction>[0], indices: number[]) => {
	return hbox(em(2.5), [
		hbox(em(2), [type === "ordered" ? `${indices.at(-1)}.` : "・"], { align: "right" }),
		hbox(em(0.5), []),
	]);
};

export const rulePdfStyle: Partial<DocumentStyle> = {
	size: "A4",
	padding: physical(25),
	block: {
		paragraph: { font: composite("Regular"), size: pt(10), lineHeight: pt(16), indent: em(1.5), firstIndent: 0 },
		h1: { font: composite("Bold"), size: pt(14.4), lineHeight: pt(23), align: "center", firstIndent: 0, needspace: pt(48) },
		h2: { font: composite("Bold"), size: pt(12), lineHeight: pt(19), align: "left", firstIndent: 0, needspace: pt(144) },
		h3: { font: composite("Bold"), size: pt(11), lineHeight: pt(18), align: "left", firstIndent: 0, needspace: pt(48) },
		h4: { font: composite("Bold"), size: pt(10), lineHeight: pt(16), align: "left", firstIndent: 0, needspace: pt(32) },
		li1: { font: composite("Regular"), size: pt(10), lineHeight: pt(16), indent: em(1.5), firstIndent: em(-2.5), marker: listMarker },
		li2: { font: composite("Regular"), size: pt(10), lineHeight: pt(16), indent: em(3.5), firstIndent: em(-2.5), marker: listMarker },
		li3: { font: composite("Regular"), size: pt(10), lineHeight: pt(16), indent: em(5.5), firstIndent: em(-2.5), marker: listMarker },
	},
	gaps: [
		["h1", "paragraph", pt(6.6)],
		["fallback", "h1", pt(24)],
		["fallback", "h2", pt(21)],
		["fallback", "h3", pt(14)],
		["fallback", "h4", pt(10)],
		["h2", "fallback", pt(5)],
		["h3", "fallback", pt(6)],
		["h4", "fallback", pt(5)],
		["paragraph", "paragraph", pt(4)],
		["fallback", "fallback", 0],
	],
};

export async function renderRulePdf(document: RulePdfDocument, fonts: BrowserFontData[]): Promise<Uint8Array> {
	const fallback = fonts.find((font) => font.fontKey === "ShipporiMincho-Regular");
	if (!fallback) throw new Error("しっぽり明朝のフォントデータがありません。");
	return minitype([{ body: [...rulePdfBlocks(document), { type: "flow", position: "nombre", blockOffset: pt(20), blocks: [p([[page]], { align: "center", indent: 0, firstIndent: 0 })] }] }], rulePdfStyle, {
		fonts: [...fonts, { fontKey: "SourceHanSerifJP-Regular", data: fallback.data }], metadata: { title: document.title, author: "東邦大学医学部 IT部" },
	}).toPdf();
}
