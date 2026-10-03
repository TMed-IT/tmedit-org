import { activityItems, faqItems, objectValue, textValue } from "./home-sections.mjs";

interface FieldProps {
	value: unknown;
	onChange: (value: unknown) => void;
	label: string;
	id: string;
}

type Section = "hero" | "activities" | "projects" | "faq";

const notes: Record<Section, string> = {
	hero: "ボタンは「活動を見る」で、活動内容へ移動します。",
	activities: "見出しは「活動内容」です。紹介する活動を下の一覧で編集できます。",
	projects: "GitHubの tmed-it 組織から、スター数の多い公開リポジトリを5件まで自動表示します。",
	faq: "見出しは「よくある質問」です。質問と回答を下の一覧で編集できます。",
};

function SectionField({ value, onChange, label, id, section }: FieldProps & { section: Section }) {
	const data = objectValue(value);
	const isFaq = section === "faq";
	const hasItems = section === "activities" || isFaq;
	const keys = isFaq ? ["question", "answer"] : ["title", "description"];
	const labels = isFaq ? ["質問", "回答"] : ["活動名", "説明"];
	const items: Record<string, string>[] = isFaq ? faqItems(data.items) : activityItems(data.items);
	const update = (key: string, next: unknown) => onChange({ ...data, [key]: next });
	function move(index: number, offset: number) {
		const next = [...items];
		[next[index], next[index + offset]] = [next[index + offset], next[index]];
		update("items", next);
	}

	return <fieldset className="rounded-lg border p-4 space-y-4">
		<legend className="px-2 text-lg font-semibold">{label}</legend>
		<p className="text-sm text-kumo-subtle">{notes[section]}</p>
		{section === "hero" && <label className="block space-y-2" htmlFor={`${id}-headline`}>
			<span className="block font-medium">メイン見出し</span>
			<textarea id={`${id}-headline`} className="block w-full rounded border p-2" rows={3} value={textValue(data.headline)} onChange={(event) => update("headline", event.target.value)} />
		</label>}
		<label className="block space-y-2" htmlFor={`${id}-subheadline`}>
			<span className="block font-medium">{section === "hero" ? "紹介文" : "説明文"}</span>
			<textarea id={`${id}-subheadline`} className="block w-full rounded border p-2" rows={3} value={textValue(data.subheadline)} onChange={(event) => update("subheadline", event.target.value)} />
		</label>
		{hasItems && <div className="space-y-4">
			{items.map((item, index) => <fieldset key={index} className="rounded border p-3 space-y-3">
				<legend className="px-2 font-medium">{isFaq ? "質問" : "活動"} {index + 1}</legend>
				{keys.map((key, fieldIndex) => <label key={key} className="block space-y-2" htmlFor={`${id}-${index}-${key}`}>
					<span className="block">{labels[fieldIndex]}</span>
					<textarea id={`${id}-${index}-${key}`} className="block w-full rounded border p-2" rows={fieldIndex ? 3 : 2} value={item[key]} onChange={(event) => update("items", items.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: event.target.value } : row))} />
				</label>)}
				<div className="flex flex-wrap gap-2">
					<button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={index === 0} aria-label={`${isFaq ? "質問" : "活動"} ${index + 1}を上へ移動`} onClick={() => move(index, -1)}>上へ</button>
					<button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={index === items.length - 1} aria-label={`${isFaq ? "質問" : "活動"} ${index + 1}を下へ移動`} onClick={() => move(index, 1)}>下へ</button>
					<button type="button" className="rounded border px-3 py-2 text-kumo-danger" aria-label={`${isFaq ? "質問" : "活動"} ${index + 1}を削除`} onClick={() => update("items", items.filter((_, rowIndex) => rowIndex !== index))}>削除</button>
				</div>
			</fieldset>)}
			<button type="button" className="rounded border px-3 py-2" onClick={() => update("items", [...items, Object.fromEntries(keys.map((key) => [key, ""]))])}>{isFaq ? "質問を追加" : "活動を追加"}</button>
		</div>}
	</fieldset>;
}

export const fields = {
	"home-hero": (props: FieldProps) => <SectionField {...props} section="hero" />,
	"home-activities": (props: FieldProps) => <SectionField {...props} section="activities" />,
	"home-projects": (props: FieldProps) => <SectionField {...props} section="projects" />,
	"home-faq": (props: FieldProps) => <SectionField {...props} section="faq" />,
};
