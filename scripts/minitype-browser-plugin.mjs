export function minitypeBrowserPlugin() {
	const unavailableBunAdapter = "\0minitype-browser-bun-adapter";
	return {
		name: "minitype-browser-adapter",
		config() { return { optimizeDeps: { exclude: ["@minitype/minitype"] } }; },
		resolveId(source, importer) {
			if (source === "./shims/better-sqlite3.bun.js" && importer?.split("?")[0].endsWith("/@minitype/minitype/dist/index.browser.js")) return unavailableBunAdapter;
		},
		load(id) {
			if (id === unavailableBunAdapter) return 'throw new Error("The Bun database adapter cannot run in a browser."); export default class {}';
		},
	};
}
