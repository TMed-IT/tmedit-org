/** Fixed home layout backed by ordinary EmDash fields. */
export interface HomeContent {
	hero: {
		_key: "hero";
		headline: string;
		subheadline?: string;
		primaryCtaLabel?: string;
		primaryCtaUrl?: string;
	};
	activities: {
		_key: "activities";
		headline: string;
		subheadline?: string;
		items: { title: string; description: string }[];
	};
	projects: {
		_key: "projects";
		headline: string;
		subheadline?: string;
		organization?: string;
		githubUrl?: string;
		maxProjects?: number;
	};
	faq: {
		_key: "faq";
		headline: string;
		subheadline?: string;
		items: { question: string; answer: string }[];
	};
}

type LegacyBlock = Record<string, unknown> & { _type?: string };

function string(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function rows<T extends Record<string, string>>(
	value: unknown,
	keys: (keyof T)[],
): T[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!item || typeof item !== "object") return [];
		const row = item as Record<string, unknown>;
		if (!keys.every((key) => typeof row[key as string] === "string")) return [];
		return [Object.fromEntries(keys.map((key) => [key, row[key as string]])) as T];
	});
}

/** Legacy blocks are read only until an existing database has been migrated. */
export function homeContent(data: Record<string, unknown> | undefined): HomeContent | null {
	if (!data) return null;
	// Once any standard field exists, an intentionally cleared field must stay
	// empty instead of silently reappearing from the retired block document.
	const usesStandardFields = Object.keys(data).some((key) =>
		/^(hero|activities|projects|faq)_/.test(key) && data[key] != null,
	);
	const blocks = !usesStandardFields && Array.isArray(data.content)
		? data.content as LegacyBlock[]
		: [];
	const legacy = (type: string) => blocks.find((block) => block._type === `marketing.${type}`) ?? {};
	const hero = legacy("hero");
	const activities = legacy("activities");
	const projects = legacy("projects");
	const faq = legacy("faq");
	const headline = string(data.hero_headline) ?? string(hero.headline);
	if (!headline) return null;

	return {
		hero: {
			_key: "hero",
			headline,
			subheadline: string(data.hero_subheadline) ?? string(hero.subheadline),
			primaryCtaLabel: string(data.hero_cta_label) ?? string(hero.primaryCtaLabel),
			primaryCtaUrl: string(data.hero_cta_url) ?? string(hero.primaryCtaUrl),
		},
		activities: {
			_key: "activities",
			headline: string(data.activities_headline) ?? string(activities.headline) ?? "活動内容",
			subheadline: string(data.activities_subheadline) ?? string(activities.subheadline),
			items: rows<{ title: string; description: string }>(
				data.activities_items ?? activities.items,
				["title", "description"],
			),
		},
		projects: {
			_key: "projects",
			headline: string(data.projects_headline) ?? string(projects.headline) ?? "公開プロジェクト",
			subheadline: string(data.projects_subheadline) ?? string(projects.subheadline),
			organization: string(data.projects_organization) ?? string(projects.organization),
			githubUrl: string(data.projects_github_url) ?? string(projects.githubUrl),
			maxProjects: typeof data.projects_max === "number" ? data.projects_max :
				typeof projects.maxProjects === "number" ? projects.maxProjects : undefined,
		},
		faq: {
			_key: "faq",
			headline: string(data.faq_headline) ?? string(faq.headline) ?? "よくある質問",
			subheadline: string(data.faq_subheadline) ?? string(faq.subheadline),
			items: rows<{ question: string; answer: string }>(
				data.faq_items ?? faq.items,
				["question", "answer"],
			),
		},
	};
}
