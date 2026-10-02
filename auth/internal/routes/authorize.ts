import type { APIRoute } from "astro";
import {
  getAuthProviderStorage,
  getPublicOrigin,
} from "emdash/api/route-utils";
import {
  createCodeChallenge,
  errorRedirect,
  getInternalAuthOrigin,
  type AuthorizationState,
  PROVIDER_ID,
  randomBase64Url,
  STATE_STORAGE_CONFIG,
} from "../shared.ts";

export const prerender = false;

export const GET: APIRoute = async ({ locals, url, redirect }) => {
  const { emdash } = locals;
  if (!emdash?.db) return redirect(errorRedirect("not_configured"));

  try {
    const state = randomBase64Url();
    const verifier = randomBase64Url();
    const challenge = await createCodeChallenge(verifier);
    const redirectUri = `${getPublicOrigin(url, emdash.config)}/_emdash/api/auth/callback`;
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const storage = getAuthProviderStorage(
      emdash.db,
      PROVIDER_ID,
      STATE_STORAGE_CONFIG,
    );
    const expiredStates = await storage.states.query({
      where: { expiresAt: { lte: new Date().toISOString() } },
      limit: 1000,
    });
    if (expiredStates.items.length > 0) {
      await storage.states.deleteMany(expiredStates.items.map(({ id }) => id));
    }
    await storage.states.put(state, {
      verifier,
      redirectUri,
      expiresAt,
    } satisfies AuthorizationState);

    const authorizeUrl = new URL(
      "/auth/emdash/authorize",
      getInternalAuthOrigin(),
    );
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    return redirect(authorizeUrl.toString());
  } catch (error) {
    console.error("Internal authorization initiation failed", error);
    return redirect(errorRedirect("authorization_failed"));
  }
};
