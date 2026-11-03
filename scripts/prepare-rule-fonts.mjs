import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const revision = "2fe1e8c6b137fb13041a7cfca6fdcd8a910ea4dc";
const directory = new URL("../src/generated/rule-fonts/", import.meta.url);
const fonts = [
	["shipporimincho", "ShipporiMincho-Regular.ttf"],
	["shipporimincho", "ShipporiMincho-Bold.ttf"],
	["libertinusserif", "LibertinusSerif-Regular.ttf"],
	["libertinusserif", "LibertinusSerif-Bold.ttf"],
	["libertinusserif", "LibertinusSerif-Italic.ttf"],
	["libertinusserif", "LibertinusSerif-BoldItalic.ttf"],
];
await mkdir(directory, { recursive: true });
await mkdir(new URL("../brand/font-licenses/", import.meta.url), { recursive: true });
for (const [family, filename] of [...fonts, ["shipporimincho", "OFL.txt"], ["libertinusserif", "OFL.txt"]]) {
	const destination = filename === "OFL.txt" ? new URL(`../brand/font-licenses/${family}.txt`, import.meta.url) : new URL(filename, directory);
	try { if ((await readFile(destination)).length) continue; } catch (error) { if (error.code !== "ENOENT") throw error; }
	const response = await fetch(`https://raw.githubusercontent.com/google/fonts/${revision}/ofl/${family}/${filename}`, { signal: AbortSignal.timeout(30_000) });
	if (!response.ok) throw new Error(`フォントの取得に失敗しました: ${filename} (${response.status})`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (filename.endsWith(".ttf") && !(bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) throw new Error(`フォントの形式が不正です: ${filename}`);
	await writeFile(fileURLToPath(destination), bytes);
}
console.info("Prepared Shippori Mincho and Libertinus Serif fonts for rule PDFs.");
