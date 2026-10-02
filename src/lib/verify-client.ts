/** The verify service authenticates student membership, independently of CMS login. */
export const VERIFY_ORIGIN = "https://verify.tmedit.org";
export const CLIENT_ID = "tmedit";
export const CALLBACK_URL = "https://tmedit.org/auth/verify/callback";
export const TOKEN_COOKIE = "__Host-verify_token";
export const FLOW_COOKIE = "__Host-verify_flow";
export const COOKIE_OPTIONS = { path: "/", httpOnly: true, secure: true, sameSite: "lax" as const };

export class VerifyUnavailable extends Error {
	constructor() { super("Verification service unavailable"); }
}

export class VerifyInvalidGrant extends Error {}

export function randomToken(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function challenge(verifier: string): Promise<string> {
	return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Only application paths may be used as a post-login destination. */
export function safeReturnTo(value: string | null): string {
	if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return "/newsroom";
	const url = new URL(value, "https://tmedit.org");
	if (url.origin !== "https://tmedit.org" || url.pathname.startsWith("/auth/")) return "/newsroom";
	return url.pathname + url.search;
}
export function verificationPath(url: URL): string {
	return `/auth/verify/start?returnTo=${encodeURIComponent(safeReturnTo(url.pathname + url.search))}`;
}

async function readClientSecret(secret: { get(): Promise<string> }): Promise<string> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			secret.get(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new VerifyUnavailable()), 10_000);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

export async function verifyPost(
	path: "/auth/token" | "/auth/introspect",
	input: Record<string, string>,
	secret: { get(): Promise<string> },
	transport: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
	try {
		const clientSecret = await readClientSecret(secret);
		if (!clientSecret) throw new VerifyUnavailable();
		const response = await transport(VERIFY_ORIGIN + path, {
			method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...input, client_id: CLIENT_ID, client_secret: clientSecret }),
		});
		if (path === "/auth/token" && response.status === 400) throw new VerifyInvalidGrant();
		if (!response.ok) throw new VerifyUnavailable();
		const result: unknown = await response.json();
		if (!result || typeof result !== "object" || Array.isArray(result)) throw new VerifyUnavailable();
		return result as Record<string, unknown>;
	} catch (error) {
		if (error instanceof VerifyInvalidGrant) throw error;
		// Never log credentials, tokens, response bodies or callback URLs.
		throw new VerifyUnavailable();
	}
}

export async function tokenActive(token: string, secret: { get(): Promise<string> }, transport: typeof fetch = fetch): Promise<boolean> {
	const result = await verifyPost("/auth/introspect", { token }, secret, transport);
	if (typeof result.active !== "boolean") throw new VerifyUnavailable();
	return result.active;
}
