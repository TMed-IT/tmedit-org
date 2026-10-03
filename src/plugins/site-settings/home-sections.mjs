/** @type {import("emdash").FieldWidgetConfig[]} */
export const homeFieldWidgets = [
	{ name: "home-hero", label: "トップの紹介", fieldTypes: ["json"] },
	{ name: "home-activities", label: "活動内容", fieldTypes: ["json"] },
	{ name: "home-projects", label: "公開プロジェクト", fieldTypes: ["json"] },
	{ name: "home-faq", label: "よくある質問", fieldTypes: ["json"] },
];

export function objectValue(value) {
	return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function textValue(value) {
	return typeof value === "string" ? value : "";
}

/** Only render the declared text fields, even if JSON was changed through the API. */
export function activityItems(value) {
	return Array.isArray(value) ? value.map(objectValue).map((item) => ({ title: textValue(item.title), description: textValue(item.description) })) : [];
}

export function faqItems(value) {
	return Array.isArray(value) ? value.map(objectValue).map((item) => ({ question: textValue(item.question), answer: textValue(item.answer) })) : [];
}
