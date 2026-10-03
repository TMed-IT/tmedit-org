/** Matches the avatar key used by the auth service's R2 storage. */
export async function getInternalAvatarUrl(email: string, authOrigin: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return new URL(`/avatar/${hash}`, authOrigin).href;
}
