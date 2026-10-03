import { useEffect, useState } from "react";

const endpoint = "/_emdash/api/site-settings/seed";

function SettingsPage() {
	const [allowed, setAllowed] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	useEffect(() => {
		const controller = new AbortController();
		fetch(endpoint, { signal: controller.signal }).then(async (response) => {
			setAllowed(response.ok);
			if (!response.ok) setMessage("この操作は管理者だけが実行できます。");
		}).catch(() => { if (!controller.signal.aborted) setMessage("権限を確認できませんでした。画面を再読み込みしてください。"); });
		return () => controller.abort();
	}, []);

	async function reset() {
		if (!allowed || busy || confirmation !== "初期化") return;
		if (!window.confirm("ホーム・固定ページ・お知らせを削除して初期データに戻します。この操作は取り消せません。実行しますか？")) return;
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
				body: JSON.stringify({ confirmation }),
			});
			const result = await response.json() as { message?: string };
			setMessage(result.message || "結果を確認できませんでした。");
			setConfirmation("");
		} catch {
			setMessage("通信が切れました。初期化が続いている可能性があります。すぐに再実行せず、サイトと管理画面の状態を確認してください。");
		} finally { setBusy(false); }
	}

	return <section className="mx-auto max-w-3xl space-y-6 p-6">
		<h1 className="text-2xl font-semibold">サイト設定</h1>
		<h2 className="text-xl font-semibold">初期化（seed）</h2>
		<div role="note" className="rounded-lg border p-4 space-y-3" style={{ borderColor: "#b91c1c" }}>
			<p className="font-semibold">この操作は取り消せません。</p>
			<p>ホーム・固定ページ・お知らせの全記事（下書きを含む）と編集項目を削除し、初期データに置き換えます。メニュー、サイト名、紹介文も初期設定に戻し、お知らせメールの配信履歴・配信待ちデータを削除します。</p>
			<p>ユーザー・管理者権限・認証設定、画像などのメディア、メール購読者は残ります。他のコレクションは変更しません。</p>
			<p>必要なデータは、実行前にバックアップしてください。初期化中は記事の編集・公開を控えてください。</p>
		</div>
		{allowed && <div className="space-y-3">
			<label className="block" htmlFor="seed-confirmation">実行する場合は「初期化」と入力してください。</label>
			<input id="seed-confirmation" className="rounded border p-2" autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
			<button type="button" className="block rounded px-4 py-2 text-white" style={{ backgroundColor: "#b91c1c", opacity: busy || confirmation !== "初期化" ? 0.5 : 1 }} disabled={busy || confirmation !== "初期化"} onClick={reset}>{busy ? "初期化しています…" : "初期化する（seed）"}</button>
		</div>}
		{message && <p role="status" aria-live="polite">{message}</p>}
	</section>;
}

export const pages = { "/settings": SettingsPage };
