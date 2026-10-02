import type { AuthProviderDescriptor } from "emdash";

const resolveEntrypoint = (relativePath: string) =>
  decodeURIComponent(new URL(relativePath, import.meta.url).pathname);

export function internalAuth(): AuthProviderDescriptor {
  return {
    id: "internal",
    label: "Internal",
    routes: [
      {
        pattern: "/_emdash/api/auth/internal/authorize",
        entrypoint: resolveEntrypoint("./routes/authorize.ts"),
      },
      {
        pattern: "/_emdash/api/auth/callback",
        entrypoint: resolveEntrypoint("./routes/callback.ts"),
      },
    ],
    publicRoutes: ["/_emdash/api/auth/internal/", "/_emdash/api/auth/callback"],
    storage: {
      states: { indexes: ["expiresAt"] },
    },
  };
}
