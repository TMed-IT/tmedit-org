export function permissionErrorMessage(status) {
	if (status === 401) return "ログイン状態を確認できませんでした。管理画面にログインし直してください。";
	if (status === 403) return "この操作は管理者だけが実行できます。";
	return `初期化機能を読み込めませんでした（HTTP ${status}）。管理者がログとデプロイ状況を確認してください。`;
}
