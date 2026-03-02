/**
 * Typed HTTP client for the Peek API
 *
 * Replaces the base fetch helpers from services/api.js with typed wrappers.
 */

const API_BASE_URL = "/api";
const REDIRECT_STORAGE_KEY = "peek_auth_redirect";

// Flag to prevent multiple simultaneous redirects to login.
// Never reset because the page does a full navigation (window.location.href).
let isRedirectingToLogin = false;

// Background/fire-and-forget endpoints where 401/403 should NOT trigger redirect.
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

  constructor(
    message: string,
    status: number,
    data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.isInitializing = status === 503 && data.ready === false;
  }
}

/**
 * Base fetch wrapper with auth redirect and error handling.
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorData: Record<string, unknown>;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: `HTTP error! status: ${response.status}` };
    }

    const isAuthEndpoint = endpoint.startsWith("/auth/");
    const isSilentEndpoint = AUTH_SILENT_ENDPOINTS.has(endpoint);

    if (
      (response.status === 401 || response.status === 403) &&
      !isAuthEndpoint
    ) {
      console.warn(
        `[API] Auth failure: ${response.status} on ${endpoint}`,
        `| error: ${(errorData?.error as string) || "unknown"}`,
        `| cookie present: ${document.cookie.length > 0}`,
        `| page: ${window.location.pathname}`,
      );

      if (isSilentEndpoint) {
        throw new ApiError(
          (errorData?.error as string) || `Auth failure on ${endpoint}`,
          response.status,
          errorData,
        );
      }

      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true;
        const currentUrl = window.location.pathname + window.location.search;
        if (currentUrl !== "/login" && currentUrl !== "/setup") {
          sessionStorage.setItem(REDIRECT_STORAGE_KEY, currentUrl);
        }
        window.location.href = "/login";
        return new Promise<T>(() => {});
      }
    }

    throw new ApiError(
      (errorData.error as string) ||
        (errorData.message as string) ||
        `HTTP error! status: ${response.status}`,
      response.status,
      errorData,
    );
  }

  return (await response.json()) as T;
}

export function apiGet<T = unknown>(endpoint: string, signal?: AbortSignal): Promise<T> {
  return apiFetch<T>(endpoint, { method: "GET", signal });
}

export function apiPost<T = unknown>(
  endpoint: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: "POST",
    body: data !== undefined ? JSON.stringify(data) : undefined,
    signal,
  });
}

export function apiPut<T = unknown>(
  endpoint: string,
  data?: unknown,
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
