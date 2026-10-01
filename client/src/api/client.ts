/**
 * Typed HTTP client for the Peek API
 *
 * Replaces the base fetch helpers from services/api.js with typed wrappers.
 */
import { PUBLIC_ROUTES, isPublicRoute } from "../constants/navigation";

const API_BASE_URL = "/api";
const REDIRECT_STORAGE_KEY = "peek_auth_redirect";
/** A one-time notice the login page shows (set by redirectToLogin). */
export const LOGIN_MESSAGE_STORAGE_KEY = "peek_login_message";

// Flag to prevent multiple simultaneous redirects to login.
// Never reset because the page does a full navigation (window.location.href).
let isRedirectingToLogin = false;

/**
 * Send the browser to the login page, remembering where it was so login can
 * return there, with an optional message the login page shows once.
 */
export function redirectToLogin(message?: string): void {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  sessionStorage.setItem(
    REDIRECT_STORAGE_KEY,
    window.location.pathname + window.location.search
  );
  if (message) sessionStorage.setItem(LOGIN_MESSAGE_STORAGE_KEY, message);
  window.location.href = PUBLIC_ROUTES.login;
}

// Background/fire-and-forget endpoints where a 401 should NOT trigger redirect.
const AUTH_SILENT_ENDPOINTS = new Set([
  "/watch-history/save-activity",
  "/watch-history/increment-play-count",
  "/image-view-history/increment-o",
  "/image-view-history/view",
]);

/**
 * Structured API error with status code and response data.
 */
export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  /** True when server returns 503 with ready: false (cache still warming). */
  isInitializing: boolean;
  /** When the server says to try again: its Retry-After, in seconds. */
  retryAfterSeconds: number | undefined;

  constructor(
    message: string,
    status: number,
    data: Record<string, unknown> = {},
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.isInitializing = status === 503 && data.ready === false;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Seconds to wait before trying again: the Retry-After header (seconds or an
 * HTTP date), else a body's `retryAfterSeconds` (the login lockout sends both).
 */
export function readRetryAfterSeconds(
  response: Response,
  data: Record<string, unknown>
): number | undefined {
  const header = response.headers.get("Retry-After")?.trim();
  if (header) {
    if (/^\d+$/.test(header)) return Number(header);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
      return Math.max(0, Math.ceil((date - Date.now()) / 1000));
    }
  }
  const fromBody = data.retryAfterSeconds;
  return typeof fromBody === "number" && Number.isFinite(fromBody)
    ? fromBody
    : undefined;
}

const plural = (count: number, unit: string) =>
  `${count} ${unit}${count === 1 ? "" : "s"}`;

/** "30 seconds", "14 minutes" */
function formatWait(seconds: number): string {
  return seconds < 60
    ? plural(Math.max(1, Math.ceil(seconds)), "second")
    : plural(Math.ceil(seconds / 60), "minute");
}

/**
 * What to tell the user about a failed request: the server's message, with
 * the wait for a lockout (423) or a rate limit (429) when the server gave
 * one. Anything that is not an Error gets the fallback.
 */
export function getErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (err instanceof ApiError) {
    const waits = err.status === 423 || err.status === 429;
    if (!waits || err.retryAfterSeconds === undefined) return err.message;
    const sentence = /[.!?]$/.test(err.message)
      ? err.message
      : `${err.message}.`;
    return `${sentence} Try again in ${formatWait(err.retryAfterSeconds)}.`;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** The request's headers: JSON by default, and the caller's on top. */
function requestHeaders(callerHeaders: HeadersInit | undefined): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  new Headers(callerHeaders).forEach((value, name) => {
    headers.set(name, value);
  });
  return headers;
}

/** An error response's JSON body, or a line naming the status. */
async function readErrorBody(
  response: Response
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Not JSON (a proxy's HTML error page, say)
  }
  return { error: `HTTP error! status: ${response.status}` };
}

function errorMessage(data: Record<string, unknown>, status: number): string {
  if (typeof data.error === "string" && data.error) return data.error;
  if (typeof data.message === "string" && data.message) return data.message;
  return `HTTP error! status: ${status}`;
}

/**
 * The library stamp: every authenticated answer names one in
 * `X-Peek-Library` ("<boot>.<library>.<user>"), and the server moves it
 * when a sync ends or an admin changes the user's restrictions, role or
 * the Stash servers. The first stamp a page sees is only recorded; a newer
 * one calls the listener (`createQueryClient` registers one that refetches
 * what the page shows). Newer is another boot (a restart starts its
 * counters again) or, on the same boot, a higher library or user counter;
 * a late answer to a request asked before a bump carries an older stamp
 * and changes nothing.
 */
const LIBRARY_STAMP_HEADER = "X-Peek-Library";

interface LibraryStamp {
  boot: string;
  library: number;
  user: number;
}

/** A stamp's parts; null for a value of another shape */
function parseLibraryStamp(stamp: string): LibraryStamp | null {
  const [boot, library, user, ...rest] = stamp.split(".");
  if (!boot || library === undefined || user === undefined || rest.length) {
    return null;
  }
  const counters = [Number(library), Number(user)];
  if (!counters.every((n) => Number.isSafeInteger(n) && n >= 0)) return null;
  return { boot, library: Number(library), user: Number(user) };
}

/** The highest stamp seen: its raw text, and its parts when it has them */
let lastLibraryStamp: string | undefined;
let lastLibraryParts: LibraryStamp | null = null;
let libraryStampListener: (() => void) | undefined;

/** Registers what a changed stamp does; a later call replaces it. */
export function setLibraryStampListener(listener: () => void): void {
  libraryStampListener = listener;
}

/** Forgets the stamp seen (on logout, and between tests). */
export function resetLibraryStamp(): void {
  lastLibraryStamp = undefined;
  lastLibraryParts = null;
}

function noteLibraryStamp(stamp: string | null): void {
  if (stamp === null || stamp === lastLibraryStamp) return;
  const first = lastLibraryStamp === undefined;
  const parts = parseLibraryStamp(stamp);
  const seen = lastLibraryParts;
  if (parts && seen && parts.boot === seen.boot) {
    // The same boot: only a higher counter is news; keep the highest of each
    const newer = parts.library > seen.library || parts.user > seen.user;
    if (!newer) return;
    const highest = {
      boot: seen.boot,
      library: Math.max(parts.library, seen.library),
      user: Math.max(parts.user, seen.user),
    };
    lastLibraryParts = highest;
    lastLibraryStamp = `${highest.boot}.${highest.library}.${highest.user}`;
  } else {
    // The first stamp, another boot, or a value of another shape
    lastLibraryParts = parts;
    lastLibraryStamp = stamp;
  }
  if (!first) libraryStampListener?.();
}

/**
 * Base fetch wrapper with auth redirect and error handling.
 *
 * Only a 401 means the session is gone: it sends the browser to the login
 * page, except from a background endpoint, an /auth/ endpoint or a public
 * page. Every other failure, 403 included, throws an ApiError for the caller
 * to show where the user is.
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    credentials: "include",
    ...options,
    headers: requestHeaders(options.headers),
  });
  // Any answer, an error included, can carry a newer stamp
  noteLibraryStamp(response.headers.get(LIBRARY_STAMP_HEADER));

  if (response.ok) {
    // No Content has no body to parse
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const errorData = await readErrorBody(response);
  const error = new ApiError(
    errorMessage(errorData, response.status),
    response.status,
    errorData,
    readRetryAfterSeconds(response, errorData)
  );

  const sessionLost =
    response.status === 401 &&
    !endpoint.startsWith("/auth/") &&
    !AUTH_SILENT_ENDPOINTS.has(endpoint) &&
    !isPublicRoute(window.location.pathname);

  if (sessionLost && !isRedirectingToLogin) {
    redirectToLogin();
    // The page is leaving; the caller never needs to handle this request
    return new Promise<T>(() => {});
  }

  throw error;
}

export function apiGet<T = unknown>(
  endpoint: string,
  signal?: AbortSignal
): Promise<T> {
  return apiFetch<T>(endpoint, { method: "GET", signal });
}

export function apiPost<T = unknown>(
  endpoint: string,
  data?: unknown,
  signal?: AbortSignal
): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: "POST",
    body: data !== undefined ? JSON.stringify(data) : undefined,
    signal,
  });
}

export function apiPut<T = unknown>(
  endpoint: string,
  data?: unknown
): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: "PUT",
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
}

export function apiDelete<T = unknown>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: "DELETE" });
}

export { REDIRECT_STORAGE_KEY };
