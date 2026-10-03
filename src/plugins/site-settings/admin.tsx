import { useEffect, useRef, useState } from "react";
import { permissionErrorMessage } from "./messages.mjs";
import { resetOptions, resetTargetLabels } from "./reset-options.mjs";

const endpoint = "/_emdash/api/site-settings/seed";

function SettingsPage() {
	const [allowed, setAllowed] = useState(false);
	const [targets, setTargets] = useState<string[]>([]);
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const confirmationDialog = useRef<HTMLDialogElement>(null);
	const cancelButton = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const controller = new AbortController();
		fetch(endpoint, { signal: controller.signal, headers: { "X-EmDash-Request": "1" } }).then((response) => {
			setAllowed(response.ok);
			if (!response.ok) setMessage(permissionErrorMessage(response.status));
		}).catch(() => { if (!controller.signal.aborted) setMessage("権限を確認できませんでした。画面を再読み込みしてください。"); });
		return () => controller.abort();
	}, []);

	function selectTargets(next: string[]) {
		setTargets(next);
		setConfirmation("");
		setMessage("");
	}

	function openConfirmation() {
		if (!allowed || busy || !targets.length || confirmation !== "初期化") return;
		confirmationDialog.current?.showModal();
		cancelButton.current?.focus();
	}

	async function reset() {
		if (!confirmationDialog.current?.open || !allowed || busy || !targets.length || confirmation !== "初期化") return;
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
				body: JSON.stringify({ confirmation, targets }),
			});
			const result = await response.json() as { message?: string };
			setMessage(result.message || "結果を確認できませんでした。");
			setConfirmation("");
		} catch {
			setMessage("通信が切れました。初期化が続いている可能性があります。すぐに再実行せず、サイトと管理画面の状態を確認してください。");
		} finally {
			setBusy(false);
			confirmationDialog.current?.close();
		}
	}

	return <section className="mx-auto max-w-3xl space-y-6 p-6">
		<h1 className="text-2xl font-semibold">サイト設定</h1>
		<h2 className="text-xl font-semibold">初期化（seed）</h2>
		{allowed && <fieldset disabled={busy} className="space-y-3">
			<legend className="font-semibold">初期化する項目を選んでください（複数選択可）。</legend>
			{resetOptions.map((option) => <label key={option.id} className="block">
				<input type="checkbox" checked={targets.includes(option.id)} onChange={(event) => selectTargets(event.target.checked ? [...targets, option.id] : targets.filter((target) => target !== option.id))} /> {option.label}
			</label>)}
			<button type="button" className="rounded border px-3 py-2" onClick={() => selectTargets(targets.length === resetOptions.length ? [] : resetOptions.map((option) => option.id))}>{targets.length === resetOptions.length ? "選択を解除" : "すべて選択"}</button>
		</fieldset>}
		<div role="note" className="rounded-lg border p-4 space-y-3" style={{ borderColor: "#b91c1c" }}>
			<p className="font-semibold">この操作は取り消せません。</p>
			{targets.length ? <ul className="list-disc pl-6 space-y-2">{resetOptions.filter((option) => targets.includes(option.id)).map((option) => <li key={option.id}><strong>{option.label}：</strong>{option.description}</li>)}</ul> : <p>項目を選ぶと、初期化する内容をここに表示します。</p>}
			<p>選択していない項目、ユーザー・管理者権限・認証設定、画像などのメディア、メール購読者は残ります。</p>
			<p>必要なデータは、実行前にバックアップしてください。初期化中は記事の編集・公開を控えてください。</p>
		</div>
		{allowed && <div className="space-y-3">
			<label className="block" htmlFor="seed-confirmation">実行する場合は「初期化」と入力してください。</label>
			<input id="seed-confirmation" className="rounded border p-2" autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
			<button type="button" className="block rounded px-4 py-2 text-white" style={{ backgroundColor: "#b91c1c", opacity: busy || !targets.length || confirmation !== "初期化" ? 0.5 : 1 }} disabled={busy || !targets.length || confirmation !== "初期化"} onClick={openConfirmation}>{busy ? "初期化しています…" : "選択した項目を初期化する（seed）"}</button>
		</div>}
		<style>{`.site-settings-confirmation::backdrop { background: rgb(0 0 0 / 0.55); }`}</style>
		<dialog ref={confirmationDialog} className="site-settings-confirmation space-y-4" role="alertdialog" aria-labelledby="seed-dialog-title" aria-describedby="seed-dialog-description" aria-busy={busy} onCancel={(event) => { if (busy) event.preventDefault(); }} style={{ width: "min(32rem, calc(100vw - 2rem))", margin: "auto", padding: "1.5rem", borderRadius: "0.75rem", border: "1px solid #b91c1c", backgroundColor: "var(--color-kumo-base, Canvas)", color: "var(--color-kumo-default, CanvasText)", boxShadow: "0 20px 60px rgb(0 0 0 / 0.3)" }}>
			<h2 id="seed-dialog-title" className="text-xl font-semibold">選択した項目を初期化しますか？</h2>
			<div id="seed-dialog-description" className="space-y-3">
				<p className="font-semibold">{resetTargetLabels(targets)}</p>
				<p>選択した項目を初期データに戻します。この操作は取り消せません。</p>
				<p>選択していない項目は変更しません。</p>
			</div>
			<div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", flexWrap: "wrap" }}>
				<button ref={cancelButton} type="button" className="rounded border px-4 py-2" disabled={busy} onClick={() => confirmationDialog.current?.close()}>キャンセル</button>
				<button type="button" className="rounded px-4 py-2 text-white" disabled={busy} style={{ backgroundColor: "#b91c1c", opacity: busy ? 0.5 : 1 }} onClick={reset}>{busy ? "初期化しています…" : "初期化を実行する"}</button>
			</div>
		</dialog>
		{message && <p role="status" aria-live="polite">{message}</p>}
	</section>;
}

export const pages = { "/settings": SettingsPage };
