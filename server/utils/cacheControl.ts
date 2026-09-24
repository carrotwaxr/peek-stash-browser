/**
 * Cache-Control for proxied media (sweep item 2).
 *
 * Media responses now belong to a signed-in user, so a shared cache (a CDN
 * or a reverse proxy cache) must never serve one visitor's response to
 * another. Stash answers with `public`; this keeps its freshness directives
 * and makes the response private.
 */

/**
 * The upstream Cache-Control, else the fallback, with `public` dropped and
 * `private` prepended unless `private` or `no-store` is already present.
 */
export function privateCacheControl(
  upstream: string | null | undefined,
  fallback: string
): string {
  const source = upstream && upstream.trim() !== "" ? upstream : fallback;
  const directives = source
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d !== "" && d.toLowerCase() !== "public");

  const alreadyPrivate = directives.some((d) => {
    const name = d.split("=")[0]?.trim().toLowerCase();
    return name === "private" || name === "no-store";
  });
  if (!alreadyPrivate) {
    directives.unshift("private");
  }
  return directives.join(", ");
}
