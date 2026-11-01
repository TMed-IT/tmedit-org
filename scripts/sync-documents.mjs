import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const repository = "TMed-IT/docs";

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
	const assets = release.assets.filter((asset) => asset.name.endsWith(".pdf"));
	if (!assets.length) throw new Error("リリースにPDFがありません。");
	const slugs = new Set();
	for (const asset of assets) {
		const slug = asset.name.slice(0, -4);
		if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(slug) || slugs.has(slug) || !Number.isSafeInteger(asset.id)) throw new Error(`文書のファイル名が不正、または重複しています: ${asset.name}`);
		slugs.add(slug);
		const source = await api(`${base}/contents/${encodeURIComponent(slug)}.md?ref=${commit.sha}`);
		if (source.encoding !== "base64" || typeof source.content !== "string") throw new Error(`${slug}.md を取得できませんでした。`);
		const markdown = Buffer.from(source.content, "base64");
		const pdf = await api(`${base}/releases/assets/${asset.id}`, true);
		if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== "%PDF-" || pdf.length !== asset.size) throw new Error(`${slug}.pdf が不正、または不完全です。`);
		const digest = sha256(pdf);
		if (asset.digest && asset.digest !== `sha256:${digest}`) throw new Error(`${slug}.pdf のチェックサムが一致しません。`);
		// PDFs are server-only assets; every download goes through verify.
		const pdfPath = `/docs/${encodeURIComponent(slug)}/document`;
		files.push({ path: `src/generated/documents/${slug}.md`, data: markdown }, { path: `src/generated/documents/files/${digest}/${slug}.pdf`, data: pdf });
		documents.push({ slug, pdf: pdfPath, bytes: pdf.length, markdownSha256: sha256(markdown), pdfSha256: digest });
	}
	const manifest = { repository, tag, commit: commit.sha, publishedAt: release.published_at, documents };
	files.push({ path: "src/generated/documents/manifest.json", data: JSON.stringify(manifest, null, "\t") + "\n" });
	return { manifest, files };
}

export async function syncDocuments(tag, { api = githubApi, root = fileURLToPath(new URL("../", import.meta.url)) } = {}) {
	const result = await collectDocuments(tag, api);
	const destination = resolve(root, "src/generated/documents");
	await mkdir(dirname(destination), { recursive: true });
	const staging = await mkdtemp(resolve(dirname(destination), ".documents-"));
	const backup = `${staging}-previous`;
	let replaced = false;
	let installed = false;
	try {
		for (const file of result.files) {
			const path = resolve(staging, file.path.slice("src/generated/documents/".length));
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, file.data);
		}
		try { await rename(destination, backup); replaced = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
		try { await rename(staging, destination); installed = true; } catch (error) { if (replaced) await rename(backup, destination); throw error; }
	} finally {
		await rm(staging, { recursive: true, force: true });
		if (installed) await rm(backup, { recursive: true, force: true });
	}
	return result.manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const manifest = await syncDocuments(process.argv[2]);
		console.log(`${repository} ${manifest.tag} (${manifest.commit.slice(0, 7)}) の ${manifest.documents.length} 文書を同期しました。`);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
