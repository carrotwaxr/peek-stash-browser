/**
 * BASE_PATH: the prefix a reverse proxy serves Peek under (for example
 * "/peek"). The proxy strips it before the request reaches the server, so
 * routes stay root-relative; only what the browser sees (cookie paths,
 * redirects, links) carries the prefix.
 */

const VALID = /^(\/[A-Za-z0-9._~-]+)+$/;

/** "" for none, "/peek" for a valid prefix, null for an invalid one. */
export function parseBasePath(raw: string | undefined): string | null {
  let value = (raw ?? "").trim();
  if (value.endsWith("/")) value = value.slice(0, -1);
  if (value === "") return "";
  if (!VALID.test(value)) return null;
  if (value.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return value;
}

/** The prefix the browser sees Peek under: BASE_PATH, or "" when unset or invalid. */
export function getBasePath(): string {
  return parseBasePath(process.env.BASE_PATH) ?? "";
}

/** A root-absolute path as the browser must request it. */
export function publicPath(path: string): string {
  return path.startsWith("/") ? getBasePath() + path : path;
}
