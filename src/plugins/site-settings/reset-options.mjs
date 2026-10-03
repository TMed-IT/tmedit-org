export const resetOptions = [
	{ id: "home", label: "ホーム", description: "ホームの全記事・下書き・編集履歴と編集項目を、初期データに置き換えます。" },
	{ id: "pages", label: "固定ページ", description: "固定ページの全記事・下書き・編集履歴と編集項目を削除し、プライバシーポリシーと利用規約を作り直します。" },
	{ id: "news", label: "お知らせ", description: "お知らせの全記事・下書き・編集履歴、メールの配信履歴・配信待ちデータを削除し、編集項目を初期設定に戻します。" },
	{ id: "menus", label: "メニュー", description: "メインとフッターの4つのメニューを初期設定に戻します。" },
	{ id: "settings", label: "サイト名・紹介文", description: "サイト名と紹介文を初期設定に戻します。" },
];

export function validResetTargets(targets) {
	return Array.isArray(targets) && targets.length > 0 && targets.length <= resetOptions.length &&
		new Set(targets).size === targets.length && targets.every((id) => resetOptions.some((option) => option.id === id));
}

export function resetTargetLabels(targets) {
	return resetOptions.filter((option) => targets.includes(option.id)).map((option) => option.label).join("、");
}
