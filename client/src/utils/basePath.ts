/**
 * The prefix Peek is served under ("" at the root), from the meta tag the
 * container writes into index.html when the admin sets BASE_PATH.
 */

const VALID_BASE_PATH = /^(\/[A-Za-z0-9._~-]+)+$/;

/** Trim, drop one trailing "/"; anything that is not a valid prefix is "". */
function normalise(raw: string | null | undefined): string {
  let value = (raw ?? "").trim();
  if (value.endsWith("/")) value = value.slice(0, -1);
  if (value === "") return "";
  if (!VALID_BASE_PATH.test(value)) return "";
  if (value.split("/").some((segment) => segment === "." || segment === "..")) {
    return "";
  }
  return value;
}

function readBasePath(): string {
  if (typeof document === "undefined") return "";
  const meta = document.querySelector('meta[name="peek-base-path"]');
  return normalise(meta?.getAttribute("content"));
}

export const BASE_PATH: string = readBasePath();

/** The API's root: `${BASE_PATH}/api`. */
export const API_PATH: string = `${BASE_PATH}/api`;

/** Prefix a root-absolute path ("/x"); anything else is returned unchanged. */
export function withBase(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return BASE_PATH + path;
}

/** A browser pathname as the router sees it (without the prefix). */
export function stripBase(pathname: string): string {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(BASE_PATH + "/")) {
    return pathname.slice(BASE_PATH.length);
  }
  return pathname;
}
