import type { APIRoute } from "astro";
import { findOrCreateOAuthUser, Role, type RoleLevel } from "@emdash-cms/auth";
import { createKyselyAdapter } from "@emdash-cms/auth/adapters/kysely";
import {
  finalizeSetup,
  getAuthProviderStorage,
  OptionsRepository,
} from "emdash/api/route-utils";
import {
  errorRedirect,
  getInternalAuthOrigin,
  getRuntimeEnv,
  type AuthorizationState,
  PROVIDER_ID,
  STATE_STORAGE_CONFIG,
} from "../shared.ts";
import { getInternalAvatarUrl } from "../avatar.ts";

export const prerender = false;

type InternalTokenResponse = {
  user?: {
    id?: unknown;
    email?: unknown;
    name?: unknown;
  };
};

const isAuthorizationState = (value: unknown): value is AuthorizationState => {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AuthorizationState>;
  return (
    typeof state.verifier === "string" &&
    typeof state.redirectUri === "string" &&
    typeof state.expiresAt === "string"
  );
};

const defaultRole = (): RoleLevel => {
  const raw = getRuntimeEnv().AUTH_DEFAULT_ROLE;
  const role = Number(raw ?? Role.AUTHOR);
  const allowedRoles: number[] = [
    Role.SUBSCRIBER,
    Role.CONTRIBUTOR,
    Role.AUTHOR,
    Role.EDITOR,
  ];
  return allowedRoles.includes(role) ? (role as RoleLevel) : Role.AUTHOR;
};

export const GET: APIRoute = async ({ locals, url, session, redirect }) => {
  const { emdash } = locals;
  if (!emdash?.db) return redirect(errorRedirect("not_configured"));

  const code = url.searchParams.get("code");
  const stateId = url.searchParams.get("state");
  if (!code || !stateId) return redirect(errorRedirect("invalid_callback"));

  const storage = getAuthProviderStorage(
    emdash.db,
    PROVIDER_ID,
    STATE_STORAGE_CONFIG,
  );
  const stored = await storage.states.get(stateId);
  await storage.states.delete(stateId);
  if (
    !isAuthorizationState(stored) ||
    Date.parse(stored.expiresAt) <= Date.now()
  ) {
    return redirect(errorRedirect("invalid_state"));
  }

  try {
    const authOrigin = getInternalAuthOrigin();
    const tokenResponse = await fetch(
      new URL("/auth/emdash/token", authOrigin),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: stored.verifier,
          redirect_uri: stored.redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!tokenResponse.ok) {
      return redirect(errorRedirect("token_exchange_failed"));
    }

    const payload = (await tokenResponse.json()) as InternalTokenResponse;
    const internalUser = payload.user;
    if (
      typeof internalUser?.id !== "string" ||
      typeof internalUser.email !== "string" ||
      typeof internalUser.name !== "string"
    ) {
      return redirect(errorRedirect("invalid_user"));
    }

    const adapter = createKyselyAdapter(
      emdash.db as unknown as Parameters<typeof createKyselyAdapter>[0],
    );
    const options = new OptionsRepository(emdash.db);
    const setupComplete = await options.get("emdash:setup_complete");
    const setupPending = setupComplete !== true && setupComplete !== "true";
    const existingInternalAccount = await emdash.db
      .selectFrom("oauth_accounts")
      .select("provider_account_id")
      .where("provider", "=", PROVIDER_ID)
      .limit(1)
      .executeTakeFirst();
    const isFirstUser = existingInternalAccount === undefined;
    const avatarUrl = await getInternalAvatarUrl(internalUser.email, authOrigin);

    let user = await findOrCreateOAuthUser(
      adapter,
      PROVIDER_ID,
      {
        id: internalUser.id,
        email: internalUser.email,
        name: internalUser.name,
        avatarUrl,
        emailVerified: true,
      },
      async () => ({
        allowed: true,
        role: isFirstUser ? Role.ADMIN : defaultRole(),
      }),
    );

    // findOrCreateOAuthUser may auto-link an existing local user. Ensure the
    // first account for this provider is an admin even in that case.
    if (isFirstUser && user.role !== Role.ADMIN) {
      await adapter.updateUser(user.id, { role: Role.ADMIN });
      user = { ...user, role: Role.ADMIN };
    }

    if (user.disabled) return redirect(errorRedirect("account_disabled"));
    if (user.avatarUrl !== avatarUrl) {
      await adapter.updateUser(user.id, { avatarUrl });
    }
    if (setupPending) await finalizeSetup(emdash.db);
    session?.set("user", { id: user.id });
    return redirect("/_emdash/admin");
  } catch (error) {
    console.error("Internal authentication callback failed", error);
    return redirect(errorRedirect("internal_callback_failed"));
  }
};
