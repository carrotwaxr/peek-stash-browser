/**
 * Masks secrets in URLs before they reach the log.
 *
 * Stash takes its API key as `apikey` on media URLs, and Peek's signed
 * external-player links carry `sig`. A regex rather than URL parsing, so
 * relative paths, unparsable strings and percent-encoded nested URLs
 * (`path=%2Fimage%3Fapikey%3D...`) are covered too.
 */

/** Query parameters whose values are secrets. */
export const SECRET_QUERY_PARAMS = [
  "apikey",
  "api_key",
  "token",
  "sig",
  "signature",
] as const;

// A separator (?, &, ; or their encoded forms), the name, = (or %3D), then
// the value up to the next separator, fragment, whitespace or quote
const SECRET_PARAM_PATTERN = new RegExp(
  `((?:^|[?&;]|%3f|%26)(?:${SECRET_QUERY_PARAMS.join("|")})(?:=|%3d))(?:(?!%26)[^&#\\s"'])*`,
  "gi"
);

/** Replace the value of every secret query parameter with `***`. */
export function redactUrl(value: string): string {
  return value.replace(SECRET_PARAM_PATTERN, "$1***");
}
