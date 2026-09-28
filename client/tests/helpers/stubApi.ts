/**
 * A stand-in for the server behind `apiFetch`: global fetch routed by path,
 * answering real Responses as the browser's fetch does.
 */
import { type Mock, vi } from "vitest";

/** A real Response with a JSON body. */
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** What `requireCacheReady` answers while the user's library is initializing. */
export const initializingResponse = (): Response =>
  jsonResponse(503, {
    error: "Server is initializing",
    message: "Cache is still loading. Please wait a moment and try again.",
    ready: false,
  });

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

export type ApiStub = Mock<
  (url: string, init?: RequestInit) => Promise<Response>
>;

/**
 * Stubs global fetch. A request goes to the route whose path (after `/api`,
 * before the query string) is the request's; any other request fails the
 * test by rejecting with a message naming it. Undo with
 * `vi.unstubAllGlobals()`.
 */
export function stubApi(routes: Record<string, Route>): ApiStub {
  const fetchMock: ApiStub = vi.fn((url: string, init?: RequestInit) => {
    const path = url.replace(/^\/api/, "").split("?")[0] ?? "";
    const route = routes[path];
    if (!route) {
      return Promise.reject(new Error(`No stubbed route for ${url}`));
    }
    return Promise.resolve(route(url, init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The requests `fetchMock` received for `path` (after `/api`). */
export function requestsTo(fetchMock: ApiStub, path: string): string[] {
  return fetchMock.mock.calls
    .map(([url]) => url)
    .filter((url) => url.replace(/^\/api/, "").split("?")[0] === path);
}
