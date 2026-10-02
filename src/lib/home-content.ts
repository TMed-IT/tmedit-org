/** Home copy is maintained in code, independently of CMS pages. */
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

export const homeContent: HomeContent = {
	hero: {
		_key: "hero",
		headline: "仲間と学び、\n技術でつくる。",
		subheadline: "初心者から経験者まで、プログラミングやWeb制作を一緒に学ぶ部活です。",
		primaryCtaLabel: "活動を見る",
		primaryCtaUrl: "#activities"
	},
	activities: {
		_key: "activities",
		headline: "活動内容",
		subheadline: "プログラミング学習からサービス運営まで、興味に合わせて実践できます。",
		items: [
			{
				title: "オンラインコミュニティ",
				description: "Discordで質問や技術共有ができます。授業や個人制作の悩みも気軽に相談できます。"
			},
			{
				title: "プログラミング",
				description: "PythonやJavaScriptを中心に、基礎から手を動かして学びます。"
			},
			{
				title: "サービスの運営",
				description: "実際に使われるサービスを保守し、利用者の声をもとに改善します。"
			},
			{
				title: "講座と共有会",
				description: "制作で得た知識や便利なツールの使い方を、短い講座で共有します。"
			}
		]
	},
	projects: {
		_key: "projects",
		headline: "公開プロジェクト",
		subheadline: "同好会で開発・運営しているプロジェクトを紹介します。",
		organization: "tmed-it",
		githubUrl: "https://github.com/tmed-it",
		maxProjects: 5
	},
	faq: {
		_key: "faq",
		headline: "よくある質問",
		subheadline: "参加前によくいただく質問をまとめました。",
		items: [
			{
				question: "初心者でも参加できますか？",
				answer: "はい。経験は問いません。「少し興味がある」という段階から参加できます。分からないことを質問しやすく、自分のペースで手を動かせる環境をつくっています。"
			},
			{
				question: "どんなパソコンが必要ですか？",
				answer: "WindowsとMacのどちらでも参加できます。開発環境を整えにくいことがあるため、iPadなどのタブレットだけでの参加は推奨していません。"
			},
			{
				question: "活動は週にどれくらいありますか？",
				answer: "オンラインでのやり取りはいつでも自由です。活動は基本的に自由参加なので、実習やアルバイトの予定に合わせて無理なく続けられます。"
			},
			{
				question: "部費や費用はかかりますか？",
				answer: "使うソフトウェアやサービスによって、費用がかかる場合があります。活動に必要なものや費用は、参加前にご確認ください。"
			},
			{
				question: "プログラミング以外も学べますか？",
				answer: "学べます。ExcelやWordなどのソフトウェア、デザイン、サービス運営など、メンバーの興味に合わせて幅広いテーマを扱います。"
			},
			{
				question: "どんな人が参加できますか？",
				answer: "学年や経験を問わず、ITに興味のある学生が参加できます。勉強してみたいことや、つくってみたいものがあれば気軽にご相談ください。"
			},
			{
				question: "参加するにはどうすればいいですか？",
				answer: "受付方法はお問い合わせページでご案内します。窓口の準備ができるまでは、活動紹介や公開プロジェクトをご覧ください。"
			}
		]
	}
};
