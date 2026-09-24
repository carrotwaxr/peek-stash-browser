/**
 * Shared test helpers for controller unit tests.
 *
 * Provides mock Express request/response factories used across all controller
 * test files.  The `mockRes()` response object chains `.status().json()` and
 * exposes `_getStatus()` / `_getBody()` for readable assertions.
 */
import type { NextFunction, Request, Response, Router } from "express";
import { vi } from "vitest";
import type { RequestUser } from "../../middleware/auth.js";
import type { TypedAuthRequest } from "../../types/api/express.js";

/** A signed-in user as the auth middleware attaches it; override any field. */
export function testUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return { id: 1, username: "testuser", role: "USER", ...overrides };
}

type RequestQuery = Record<string, string | string[] | undefined>;

declare const malformedInput: unique symbol;

/** Request input a test sends on purpose to check the handler rejects it. */
export interface Malformed {
  readonly [malformedInput]: true;
}

/**
 * Mark a body, params or query as invalid on purpose (a missing or
 * wrongly typed field), so it skips the handler's types. Only for tests of the
 * handler's own validation.
 */
export function malformed(input: unknown): Malformed {
  return input as Malformed;
}

/**
 * The parts of an authenticated request a controller test sets. Body, params
 * and query are checked against the handler's own types unless wrapped in
 * `malformed()`. `user` may be left out to test the handler's own sign-in
 * check.
 */
export interface AuthReqParts<B, P, Q> {
  body?: B | Malformed;
  params?: P | Malformed;
  query?: Q | Malformed;
  user?: RequestUser;
}

/**
 * Build the request for a `TypedAuthRequest` handler. Its body, params and
 * query types come from the handler it is passed to:
 * `await saveActivity(authReq({ body: { sceneId: "1" }, user: testUser() }), res)`.
 */
export function authReq<
  B = unknown,
  P extends Record<string, string> = Record<string, string>,
  Q extends RequestQuery = Record<string, string | undefined>,
>(parts: NoInfer<AuthReqParts<B, P, Q>> = {}): TypedAuthRequest<B, P, Q> {
  return parts as TypedAuthRequest<B, P, Q>;
}

type RouteMethod = "get" | "post" | "put" | "patch" | "delete";
type RouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => unknown;

/**
 * The handler `router` runs for `method` and `path` (the first one registered
 * on that route). Throws when the router has no such route, so a renamed route
 * fails the test instead of leaving it nothing to call.
 */
export function findHandler(
  router: Router,
  method: RouteMethod,
  path: string
): RouteHandler {
  for (const layer of router.stack) {
    if (layer.route?.path !== path) continue;
    const handler = layer.route.stack.find((l) => l.method === method);
    if (handler) return handler.handle;
  }
  throw new Error(`No ${method.toUpperCase()} ${path} route`);
}

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
 * Create a mock Express response with chainable `.status().json()` and a
 * `cookie()` spy (password changes issue a fresh session cookie).
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
    cookie: vi.fn().mockReturnThis(),
    _getStatus: () => res.status.mock.calls[0]?.[0] ?? 200,
    _getBody: () => {
      const jsonCalls = res.json.mock.calls;
      return jsonCalls[jsonCalls.length - 1]?.[0];
    },
  };
  return res;
}
