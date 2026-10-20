import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const repository = "TMed-IT/docs";
// Only documents explicitly selected for the public website are imported.
export const publicDocuments = [
	{ slug: "regulations", title: "規約", description: "東邦大学医学部IT部の目的、活動、入退会および運営に関する規約です。" },
	{ slug: "governance", title: "機密情報及び成果物取扱規程", description: "機密情報・個人情報の取扱いと、活動を通じて生まれた成果物の権利・利用条件を定めています。" },
];

async function githubApi(path, binary = false) {
	const { stdout } = await execFileAsync("gh", ["api", path, ...(binary ? ["-H", "Accept: application/octet-stream"] : [])], {
		encoding: binary ? "buffer" : "utf8", maxBuffer: 20 * 1024 * 1024,
	});
	return binary ? stdout : JSON.parse(stdout);
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Fetch everything before touching the working tree. Both formats use one release. */
export async function collectDocuments(tag, api = githubApi) {
	// Resolve once, then pin both formats. Delayed dispatch events must not roll
	// the site back to a release older than the latest published one.
	if (tag === "--latest") tag = (await api(`repos/${repository}/releases/latest`)).tag_name;
	if (!tag || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(tag)) throw new Error("公開済みのリリースタグを指定してください。例: pnpm docs:sync v2026.08.02-3");
	const base = `repos/${repository}`;
	const release = await api(`${base}/releases/tags/${tag}`);
	if (release.draft || release.prerelease || release.tag_name !== tag) throw new Error("正式公開済みのリリースを指定してください。");
	if (!release.published_at || Number.isNaN(Date.parse(release.published_at))) throw new Error("リリースの公開日を確認できませんでした。");
	// target_commitish may be 'main'; resolve the actual tag instead.
	const commit = await api(`${base}/commits/${tag}`);
	if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("リリースのコミットを特定できませんでした。");
	const files = [];
	const documents = [];
	for (const document of publicDocuments) {
		const { slug, title } = document;
		const asset = release.assets.find((candidate) => candidate.name === `${slug}.pdf`);
		if (!asset || !Number.isSafeInteger(asset.id)) throw new Error(`${slug}.pdf がリリースにありません。`);
		const source = await api(`${base}/contents/${slug}.md?ref=${commit.sha}`);
		if (source.encoding !== "base64" || typeof source.content !== "string") throw new Error(`${slug}.md を取得できませんでした。`);
		const markdown = Buffer.from(source.content, "base64");
		if (markdown.toString("utf8").split(/\r?\n/, 1)[0] !== `# ${title}`) throw new Error(`${slug}.md のタイトルが変更されています。公開対象を確認してください。`);
		const pdf = await api(`${base}/releases/assets/${asset.id}`, true);
		if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== "%PDF-" || pdf.length !== asset.size) throw new Error(`${slug}.pdf が不正、または不完全です。`);
		const digest = sha256(pdf);
		if (asset.digest && asset.digest !== `sha256:${digest}`) throw new Error(`${slug}.pdf のチェックサムが一致しません。`);
		// Content-addressed paths avoid an old cached PDF being paired with new text.
		const pdfPath = `/documents/files/${digest}/${slug}.pdf`;
		files.push({ path: `src/documents/${slug}.md`, data: markdown }, { path: `brand${pdfPath}`, data: pdf });
		documents.push({ ...document, pdf: pdfPath, bytes: pdf.length, markdownSha256: sha256(markdown), pdfSha256: digest });
	}
	const manifest = { repository, tag, commit: commit.sha, publishedAt: release.published_at, documents };
	files.push({ path: "src/documents/manifest.json", data: JSON.stringify(manifest, null, "\t") + "\n" });
	return { manifest, files };
}

export async function syncDocuments(tag, { api = githubApi, root = fileURLToPath(new URL("../", import.meta.url)) } = {}) {
	const result = await collectDocuments(tag, api);
	for (const file of result.files) {
		const path = resolve(root, file.path);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, file.data);
	}
	return result.manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const manifest = await syncDocuments(process.argv[2]);
		console.log(`${repository} ${manifest.tag} (${manifest.commit.slice(0, 7)}) の ${manifest.documents.length} 文書を取り込みました。差分を確認してコミットしてください。`);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
