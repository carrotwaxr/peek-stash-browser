/**
 * The one place a Stash media URL or path becomes a Peek proxy path.
 *
 * Every image, preview, sprite and cover a response names goes through
 * `/api/proxy/stash` (the browser never talks to Stash), and the path names
 * the instance that serves it: without one, the proxy would fall back to the
 * highest-priority instance and show another server's picture.
 */

const PROXY_PREFIX = "/api/proxy/";

/** `decodeURIComponent`, or the text as is when it is not valid encoding. */
function decodeKey(key: string): string {
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

/**
 * Drops every `apikey` query parameter (any case), keeping the other
 * parameters byte for byte, so a path without one comes back unchanged.
 */
function withoutApiKey(pathWithQuery: string): string {
  const q = pathWithQuery.indexOf("?");
  if (q === -1) return pathWithQuery;
  const kept = pathWithQuery
    .slice(q + 1)
    .split("&")
    .filter((param) => {
      const eq = param.indexOf("=");
      const key = eq === -1 ? param : param.slice(0, eq);
      return decodeKey(key).toLowerCase() !== "apikey";
    });
  const path = pathWithQuery.slice(0, q);
  return kept.length > 0 ? `${path}?${kept.join("&")}` : path;
}

/** A full URL's path and query (no host, no fragment); anything else as is. */
function pathAndQuery(urlOrPath: string): string {
  if (!urlOrPath.startsWith("http://") && !urlOrPath.startsWith("https://")) {
    return urlOrPath;
  }
  try {
    const url = new URL(urlOrPath);
    return url.pathname + url.search;
  } catch {
    return urlOrPath;
  }
}

/**
 * The Peek proxy path for a Stash media URL or path, served from the
 * entity's own instance: `/api/proxy/stash?path=<path+query>&instanceId=<id>`.
 * null or "" → null; an existing proxy path is returned as is; an
 * `apikey` query parameter is dropped (Stash's stored paths carry none,
 * so no output changes; invariant 1 then holds by construction).
 * A column a row lacks at runtime (undefined) reads as null, as it did in
 * the copies this replaced.
 */
export function toProxyUrl(
  urlOrPath: string | null,
  instanceId: string
): string | null {
  if (!urlOrPath) return null;
  if (urlOrPath.startsWith(PROXY_PREFIX)) return urlOrPath;

  const path = withoutApiKey(pathAndQuery(urlOrPath));
  return `${PROXY_PREFIX}stash?path=${encodeURIComponent(path)}&instanceId=${encodeURIComponent(instanceId)}`;
}
