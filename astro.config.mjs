import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { internalAuth } from "./auth/internal/index.ts";

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
    emdash({
      // SITE_URL stays production-facing for email links. Keep EmDash's
      // login/callback origin local while running the development server.
      siteUrl: process.env.NODE_ENV === "development" ? "http://localhost:4321" : undefined,
      database: d1({ binding: "DB", session: "auto" }),
      storage: r2({ binding: "MEDIA" }),
      authProviders: [internalAuth()],
      plugins: [
        cloudflareEmailPlugin,
        newsNotificationsPlugin,
      ],
    }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Zen Kaku Gothic New",
      cssVariable: "--font-body",
      weights: [400, 500, 700, 900],
      fallbacks: ["sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Space Grotesk",
      cssVariable: "--font-outlier",
      weights: [500, 600, 700],
      fallbacks: ["sans-serif"],
    },
  ],
  devToolbar: { enabled: false },
});
