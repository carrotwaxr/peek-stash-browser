import { NextFunction, RequestHandler } from "express";

/**
 * Wraps an authenticated route handler to satisfy Express's type requirements.
 * Use this for any route that comes after authenticateToken middleware.
 *
 * Supports both AuthenticatedRequest (legacy) and TypedAuthRequest (typed) handlers.
 *
 * @example
 * app.get("/api/users", authenticateToken, authenticated(myHandler));
 */
export function authenticated<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  P = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqQuery = any,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (req: any, res: any, next?: NextFunction) => any
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handler as any;
}
