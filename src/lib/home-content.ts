import type { InferCollectionData } from "emdash";

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
	return {
		hero: {
			_key: "hero",
			headline: data.hero_headline ?? "",
			subheadline: data.hero_subheadline,
			primaryCtaLabel: data.hero_cta_label,
			primaryCtaUrl: data.hero_cta_url,
		},
		activities: {
			_key: "activities",
			headline: data.activities_headline ?? "活動内容",
			subheadline: data.activities_subheadline,
			items: data.activities_items ?? [],
		},
		projects: {
			_key: "projects",
			headline: data.projects_headline ?? "公開プロジェクト",
			subheadline: data.projects_subheadline,
			organization: data.projects_organization,
			githubUrl: data.projects_github_url,
			maxProjects: data.projects_max,
		},
		faq: {
			_key: "faq",
			headline: data.faq_headline ?? "よくある質問",
			subheadline: data.faq_subheadline,
			items: data.faq_items ?? [],
		},
	};
}
