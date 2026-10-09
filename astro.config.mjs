import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { homeFieldWidgets } from "./src/plugins/site-settings/home-sections.mjs";
import { internalAuth } from "./auth/index.ts";
import { fonts } from "./src/fonts.mjs";

const cloudflareEmailPlugin = {
  id: "cloudflare-email",
  version: "1.0.0",
  entrypoint: new URL(
    "./src/plugins/cloudflare-email/index.ts",
    import.meta.url,
  ).href,
};

const newsNotificationsPlugin = {
  id: "news-notifications",
  version: "1.0.0",
  entrypoint: new URL(
    "./src/plugins/news-notifications/index.ts",
    import.meta.url,
  ).href,
};

const siteSettingsPlugin = {
  id: "site-settings",
  version: "1.0.0",
  entrypoint: new URL("./src/plugins/site-settings/index.ts", import.meta.url).href,
  adminEntry: decodeURIComponent(new URL("./src/plugins/site-settings/admin.tsx", import.meta.url).pathname),
  fieldWidgets: homeFieldWidgets,
  options: { adminEntry: decodeURIComponent(new URL("./src/plugins/site-settings/admin.tsx", import.meta.url).pathname) },
};

export default defineConfig({
  output: "server",
  i18n: {
    defaultLocale: "ja",
    locales: ["ja"],
  },
  publicDir: "./brand",
  adapter: cloudflare(),
  image: {
    layout: "constrained",
    responsiveStyles: true,
  },
  integrations: [
    react(),
    {
      name: "site-settings-api",
      hooks: {
        "astro:config:setup": ({ injectRoute }) => {
          injectRoute({
            pattern: "/_emdash/api/site-settings/seed",
            entrypoint: new URL("./src/plugins/site-settings/seed.ts", import.meta.url),
            prerender: false,
          });
        },
      },
    },
    emdash({
      // Register the same admin font from local npm files below.
      fonts: false,
      // SITE_URL stays production-facing for email links. Keep EmDash's
      // login/callback origin local while running the development server.
      siteUrl: process.env.NODE_ENV === "development" ? "http://localhost:4321" : undefined,
      database: d1({ binding: "DB", session: "auto" }),
      storage: r2({ binding: "MEDIA" }),
      authProviders: [internalAuth()],
      plugins: [
        cloudflareEmailPlugin,
        newsNotificationsPlugin,
        siteSettingsPlugin,
      ],
    }),
  ],
  fonts,
  devToolbar: { enabled: false },
});
