import type { InferCollectionData } from "emdash";
import { activityItems, faqItems, objectValue, textValue } from "../plugins/site-settings/home-sections.mjs";

/** Maps the dedicated home collection to the section components. */
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

export function homeContent(data: InferCollectionData<"home">): HomeContent {
	// Keep the current copy visible until an existing database's home schema is reset.
	const stored = data as unknown as Record<string, unknown>;
	const hero = objectValue(stored.hero ?? { headline: stored.hero_headline, subheadline: stored.hero_subheadline });
	const activities = objectValue(stored.activities ?? { subheadline: stored.activities_subheadline, items: stored.activities_items });
	const projects = objectValue(stored.projects ?? { subheadline: stored.projects_subheadline });
	const faq = objectValue(stored.faq ?? { subheadline: stored.faq_subheadline, items: stored.faq_items });
	return {
		hero: {
			_key: "hero",
			headline: textValue(hero.headline),
			subheadline: textValue(hero.subheadline),
			primaryCtaLabel: "活動を見る",
			primaryCtaUrl: "#activities",
		},
		activities: {
			_key: "activities",
			headline: "活動内容",
			subheadline: textValue(activities.subheadline),
			items: activityItems(activities.items),
		},
		projects: {
			_key: "projects",
			headline: "公開プロジェクト",
			subheadline: textValue(projects.subheadline),
			organization: "tmed-it",
			githubUrl: "https://github.com/tmed-it",
			maxProjects: 5,
		},
		faq: {
			_key: "faq",
			headline: "よくある質問",
			subheadline: textValue(faq.subheadline),
			items: faqItems(faq.items),
		},
	};
}
