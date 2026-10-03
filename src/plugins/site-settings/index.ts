import { definePlugin } from "emdash";

export function createPlugin(options: { adminEntry: string }) {
	return definePlugin({
		id: "site-settings",
		version: "1.0.0",
		admin: {
			entry: options.adminEntry,
			pages: [{ path: "/settings", label: "サイト設定・初期化", icon: "gear" }],
		},
	});
}
