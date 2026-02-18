import type { RequestHandler } from "express";

/**
 * Wraps an authenticated route handler to satisfy Express's type requirements.
 * Use this for any route that comes after authenticateToken middleware.
 * Accepts handlers typed with AuthenticatedRequest, TypedAuthRequest, or similar.
 *
 * Note: This function intentionally uses a broad handler type because it bridges
 * between Express's loose Request type and our stricter AuthenticatedRequest /
 * TypedAuthRequest types. The middleware guarantees req.user exists at runtime.
 *
 * @example
 * app.get("/api/users", authenticateToken, authenticated(myHandler));
 */
export function authenticated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional type bridge between Express Request and our typed request variants
  handler: (...args: any[]) => any
): RequestHandler {
  return handler as unknown as RequestHandler;
}
