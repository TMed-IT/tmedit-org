import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler"))("esbuild");
const htmlLists = fileURLToPath(new URL("../src/content/portable-text-lists.ts", import.meta.resolve("emdash")));
const { outputFiles } = await build({
	stdin: { contents: `export * from './src/lib/rule-pdf'; export { buildPortableTextListTree as htmlListTree } from ${JSON.stringify(htmlLists)};`, resolveDir: process.cwd() },
	bundle: true, write: false, format: "esm", platform: "node", external: ["@minitype/minitype"],
});

const nativeEntry = import.meta.resolve("@minitype/minitype");
const module = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text.replace('"@minitype/minitype"',JSON.stringify(nativeEntry))).toString("base64")}`);
const block = (value, extra = {}) => ({ _type: "block", style: "normal", children: [{ _type: "span", text: value, marks: [] }], ...extra });

test("PDF conversion preserves headings, line breaks, list nesting and safe links from CMS content", () => {
	const body = module.rulePdfBlocks({ slug: "test", title: "諸則", updatedAt: "2026-11-03", content: [
		block("第1章", { style: "h2" }), block("1行目\n2行目"),
		block("番号付き項目", { listItem: "number", level: 2 }),
		block("箇条書き", { listItem: "bullet", level: 1 }),
		{ _type: "block", children: [{ _type: "span", text: "リンク", marks: ["safe"] }], markDefs: [{ _key: "safe", _type: "link", href: "https://tmedit.org" }] },
		{ _type: "block", children: [{ _type: "span", text: "危険なリンク", marks: ["unsafe"] }], markDefs: [{ _key: "unsafe", _type: "link", href: "javascript:alert(1)" }] },
	] }).filter((block) => block.type !== "vspace");
	assert.equal(body[0].unnumbered, true);
	assert.equal(body[1].unnumbered, true);
	assert.deepEqual(body[2].lines, [["1行目"], ["2行目"]]);
	assert.equal(body[3].type, "list");
	assert.equal(body[3].listType, "ordered");
	assert.equal(body[3].level, 2);
	assert.equal(body[4].listType, "unordered");
	assert.ok(JSON.stringify(body[5]).includes("https://tmedit.org"));
	assert.ok(!JSON.stringify(body[6]).includes("javascript:"));
});

test("PDF conversion fails explicitly on unknown blocks instead of dropping legal content", () => {
	assert.throws(() => module.rulePdfBlocks({ slug: "test", title: "Title", content: [{ _type: "unsupported" }] }), /対応していない/);
});

test("PDF title details preserve separate CMS paragraphs as lines without absorbing the article body", () => {
	const body = module.rulePdfBlocks({ slug: "test", title: "諸則", updatedAt: "2026-11-03", content: [
		block("団体名"), block("2026年6月2日制定"),
		block("第1条", { style: "h2" }), block("本文1行目\n本文2行目"),
	] }).filter((block) => block.type !== "vspace");
	assert.deepEqual(body[1].lines, [["団体名"], ["2026年6月2日制定"]]);
	assert.equal(body[1].style.align, "right");
	assert.equal(body[2].textType, "h2");
	assert.deepEqual(body[3].lines, [["本文1行目"], ["本文2行目"]]);
	assert.notEqual(body[3].style.align, "right");
});

const markerText = (value) => typeof value === "string" ? value : Array.isArray(value) ? value.map(markerText).join("") : value && typeof value === "object" ? markerText(value.body) : "";
const numbered = (extra = {}) => block("項目", { listItem: "number", ...extra });
const listCases = {
	"start and continuation across paragraphs": [
		numbered({ listId: "main", listStart: 5 }), numbered({ listId: "main" }),
		block("中間の段落"), numbered({ listId: "main" }),
	],
	"different identities, list types and unlabelled lists": [
		numbered({ listId: "first", listStart: 3 }), numbered({ listId: "second", listStart: 8 }),
		block("箇条書き", { listItem: "bullet" }), numbered({ listId: "first" }),
		numbered(), numbered(), block("区切り"), numbered(),
	],
	"nested identities are scoped to their parent item and level": [
		numbered({ listId: "parent", listStart: 5 }), numbered({ listId: "child", level: 2, listStart: 3 }),
		numbered({ listId: "child", level: 2 }), numbered({ listId: "parent" }),
		numbered({ listId: "child", level: 2, listStart: 8 }), numbered({ listId: "child", level: 3, listStart: 2 }),
		numbered({ listId: "child", level: 2 }), numbered({ listId: "parent" }),
	],
	"late starts, invalid metadata and skipped levels match HTML": [
		numbered({ listId: " late " }), block("区切り"), numbered({ listId: "late", listStart: 7 }),
		numbered({ listId: "late", listStart: 30 }), numbered({ listId: "invalid", listStart: -1 }),
		numbered({ listId: "invalid", listStart: 0 }), numbered({ listId: "invalid", listStart: "8" }),
		numbered({ listId: "invalid", listStart: 4.5 }), numbered({ listId: "invalid", listStart: 2_147_483_648 }),
		numbered({ listId: "invalid", listStart: 2 }), numbered({ listId: "", listStart: 8 }),
		numbered({ listId: "x".repeat(129), listStart: 9 }), numbered({ listId: "orphan", level: 3, listStart: 4 }),
		numbered({ listId: "invalid-level", level: "2", listStart: 3 }),
	],
};

for (const [name, blocks] of Object.entries(listCases)) {
	test(`PDF numbering matches EmDash HTML: ${name}`, () => {
		const content = blocks.map((block, index) => ({ ...block, _key: String(index) }));
		const expected = new Map();
		const visit = (node) => {
			if (node._type === "@list") {
				let number = node.start ?? 1;
				for (const item of node.children) {
					if (node.listItem === "number") expected.set(item._key, `${number++}.`);
					visit(item);
				}
			} else for (const child of node.children ?? []) visit(child);
		};
		for (const node of module.htmlListTree(structuredClone(content))) visit(node);
		const lists = module.rulePdfBlocks({ slug: "test", title: "諸則", updatedAt: "2026-11-03", content }).filter(block => block.type === "list");
		const source = content.filter(block => block.listItem);
		assert.equal(lists.length, source.length);
		for (const [index, block] of source.entries()) {
			if (block.listItem === "number") assert.equal(markerText(lists[index].style.marker), expected.get(block._key));
		}
		if (name === "start and continuation across paragraphs") assert.deepEqual(lists.map(block => markerText(block.style.marker)), ["5.", "6.", "7."]);
	});
}
