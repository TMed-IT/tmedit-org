import { VerifyInvalidGrant, VerifyUnavailable } from "./lib/verify-client";
import type { APIContext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { OptionsRepository } from "emdash";
import { env } from "cloudflare:workers";
import { isPageAttachmentKey } from "./lib/page-attachments";

const AUTH_START_PATH = "/_emdash/api/auth/internal/authorize";
const EMAIL_DELIVER_HOOK = "email:deliver";
const DEV_CONSOLE_EMAIL_PROVIDER = "emdash-console-email";
const EMAIL_PROVIDER_OPTION = `emdash:exclusive_hook:${EMAIL_DELIVER_HOOK}`;
const DISABLED_AUTH_PREFIXES = [
  "/_emdash/api/auth/passkey",
  "/_emdash/api/auth/magic-link",
  "/_emdash/api/auth/signup",
  "/_emdash/api/auth/invite",
];

let devEmailProviderInitialized = false;

async function ensureDevEmailProvider(context: APIContext) {
  if (!import.meta.env.DEV || devEmailProviderInitialized) return;

  const runtime = context.locals.emdash;
  if (!runtime?.db || !runtime.hooks) return;

  try {
    const providers = runtime.hooks.getExclusiveHookProviders(EMAIL_DELIVER_HOOK);
    if (!providers.some(({ pluginId }) => pluginId === DEV_CONSOLE_EMAIL_PROVIDER)) return;

    const inserted = await new OptionsRepository(runtime.db).setIfAbsent(
      EMAIL_PROVIDER_OPTION,
      DEV_CONSOLE_EMAIL_PROVIDER,
    );

    if (inserted) {
      runtime.hooks.setExclusiveSelection(EMAIL_DELIVER_HOOK, DEV_CONSOLE_EMAIL_PROVIDER);
    }

    devEmailProviderInitialized = true;
  } catch (error) {
    console.warn("[email] Failed to set the development email provider default:", error);
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  await ensureDevEmailProvider(context);

  const { pathname } = context.url;

  // The standard media endpoint is public. Page PDFs must use the page-scoped endpoint.
  if (pathname.startsWith("/_emdash/api/media/file/")) {
    let key = pathname.slice("/_emdash/api/media/file/".length);
    try {
      for (let layer = 0; layer < 3; layer++) {
        const decoded = decodeURIComponent(key);
        if (decoded === key) break;
        key = decoded;
      }
    } catch {
      return new Response("File not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    if (await isPageAttachmentKey(env.DB, key)) {
      context.cache.set(false);
      if (!context.locals.user) {
        return new Response("File not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
      }
      const mediaResponse = await next();
      mediaResponse.headers.set("Cache-Control", "private, no-store");
      return mediaResponse;
    }
  }

  if (
    pathname === "/login" ||
    pathname === "/_emdash/admin/login" ||
    pathname === "/_emdash/admin/signup" ||
    pathname.startsWith("/_emdash/admin/invite/accept")
  ) {
    return context.redirect(AUTH_START_PATH, 302);
  }

  if (pathname === "/_emdash/admin/settings/security") {
    return context.redirect("/_emdash/admin/settings/general", 302);
  }

  if (DISABLED_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "AUTH_METHOD_DISABLED",
          message: "This authentication method is disabled.",
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    return await next();
  } catch (error) {
    if (error instanceof VerifyInvalidGrant) {
      return new Response("確認リンクが無効か、有効期限が切れています。お知らせページから確認をやり直してください。", {
        status: 400,
        headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
      });
    }
    if (!(error instanceof VerifyUnavailable)) throw error;
    return new Response("在籍確認サービスに接続できません。時間をおいてもう一度お試しください。", {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "Retry-After": "30", "Referrer-Policy": "no-referrer" },
    });
  }
});
