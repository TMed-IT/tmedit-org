import { env } from "cloudflare:workers";

export const PROVIDER_ID = "internal";

export const STATE_STORAGE_CONFIG = {
  states: { indexes: ["expiresAt"] },
};

export type AuthorizationState = {
  verifier: string;
  redirectUri: string;
  expiresAt: string;
};

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const randomBase64Url = () =>
  encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export const createCodeChallenge = async (verifier: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return encodeBase64Url(new Uint8Array(digest));
};

export const getRuntimeEnv = (): Record<string, unknown> =>
  env as unknown as Record<string, unknown>;

export const getInternalAuthOrigin = () => {
  const value = getRuntimeEnv().AUTH_URL;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("AUTH_URL is not configured");
  }

  const url = new URL(value);
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("AUTH_URL must be an HTTPS origin");
  }
  return url.origin;
};

export const errorRedirect = (code: string) =>
  `/?auth_error=${encodeURIComponent(code)}`;
