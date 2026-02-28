/**
 * Shared test helpers for controller unit tests.
 *
 * Provides mock Express request/response factories used across all controller
 * test files.  The `mockRes()` response object chains `.status().json()` and
 * exposes `_getStatus()` / `_getBody()` for readable assertions.
 */
import { vi } from "vitest";

/**
 * Create a mock Express request.
 *
 * Accepts positional arguments for body, params, user, and query — all
 * optional and defaulting to empty objects (or `undefined` for user).
 */
export function mockReq(
  body: Record<string, unknown> = {},
  params: Record<string, string> = {},
  user?: Record<string, unknown>,
  query: Record<string, string> = {}
) {
  return { body, params, user, query } as any;
}

/**
 * Create a mock Express response with chainable `.status().json()`.
 *
 * Inspection helpers:
 * - `_getStatus()` — returns the first status code passed to `res.status()`,
 *    or `200` if `status()` was never called (implicit 200).
 * - `_getBody()` — returns the argument of the *last* `res.json()` call.
 */
export function mockRes() {
  const res: any = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    _getStatus: () => res.status.mock.calls[0]?.[0] ?? 200,
    _getBody: () => {
      const jsonCalls = res.json.mock.calls;
      return jsonCalls[jsonCalls.length - 1]?.[0];
    },
  };
  return res;
}
